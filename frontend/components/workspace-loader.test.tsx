import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { WorkspaceLoader } from "@/components/workspace-loader";
import type { SavedDocument } from "@/lib/api";
import { ApiError, openDocument } from "@/lib/api";
import { defaultNdaForm } from "@/lib/nda";

// The address, which the tests change as following a link or saving a document would.
const address = vi.hoisted(() => ({ search: "" }));
vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(address.search),
}));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  openDocument: vi.fn(),
}));
// Stands in for the workspace, showing what it was given and saving when asked.
vi.mock("@/components/workspace", () => ({
  Workspace: ({ opened, onSaved }: { opened?: SavedDocument; onSaved: (id: number) => void }) => (
    <section aria-label="Workspace">
      <p>{opened ? `Opened ${opened.id}` : "New"}</p>
      <input aria-label="Typed" />
      <button onClick={() => onSaved(31)}>Save</button>
    </section>
  ),
}));

const DOCUMENTS = [{ id: "pilot-agreement", name: "Pilot Agreement", template: "" }];

function saved(id: number, document = "pilot-agreement"): SavedDocument {
  return {
    id,
    document,
    parties: "",
    updatedAt: "2026-10-06T10:00:00+00:00",
    draft: { document, form: defaultNdaForm, values: {}, settled: [] },
    messages: [{ role: "assistant", content: "Who is the customer?" }],
  };
}

let replaceState: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  address.search = "";
  vi.mocked(openDocument).mockImplementation(async (id) => saved(id));
  replaceState = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.mocked(openDocument).mockReset();
  replaceState.mockRestore();
});

function renderLoader(search = "") {
  address.search = search;
  const page = () => <WorkspaceLoader documents={DOCUMENTS} clauses={[]} />;
  const { rerender } = render(page());
  return {
    /** Shows the page as it is once the address has changed. */
    goTo(next: string) {
      address.search = next;
      rerender(page());
    },
  };
}

const type = (text: string) =>
  fireEvent.change(screen.getByLabelText("Typed"), { target: { value: text } });
const typed = () => (screen.getByLabelText("Typed") as HTMLInputElement).value;

describe("WorkspaceLoader", () => {
  test("starts a new document when the address names none", () => {
    renderLoader();

    expect(screen.getByText("New")).toBeDefined();
    expect(openDocument).not.toHaveBeenCalled();
  });

  test("opens the saved document that the address names", async () => {
    renderLoader("?doc=12");

    expect(screen.getByRole("status").textContent).toBe("Opening your document…");
    expect(await screen.findByText("Opened 12")).toBeDefined();
    expect(openDocument).toHaveBeenCalledExactlyOnceWith(12);
  });

  test.each(["?doc=", "?doc=abc", "?doc=1.5", "?doc=-3", "?other=12"])(
    "starts a new document when the address is %j",
    (search) => {
      renderLoader(search);

      expect(screen.getByText("New")).toBeDefined();
      expect(openDocument).not.toHaveBeenCalled();
    },
  );

  test("says so when the document does not exist, and leads back to the list", async () => {
    vi.mocked(openDocument).mockRejectedValue(
      new ApiError("This document doesn’t exist or has been deleted.", 404),
    );
    renderLoader("?doc=12");

    const alert = within(await screen.findByRole("alert"));

    expect(alert.getByText("This document doesn’t exist or has been deleted.")).toBeDefined();
    expect(alert.getByRole("link", { name: "Go to my documents" }).getAttribute("href")).toBe(
      "/documents/",
    );
    // Trying again would get the same answer.
    expect(alert.queryByRole("button")).toBeNull();
  });

  test("offers to try again when the document cannot be fetched", async () => {
    vi.mocked(openDocument).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderLoader("?doc=12");

    const alert = within(await screen.findByRole("alert"));
    expect(alert.getByText(/couldn’t be opened/)).toBeDefined();
    fireEvent.click(alert.getByRole("button", { name: "Try again" }));

    expect(await screen.findByText("Opened 12")).toBeDefined();
    expect(openDocument).toHaveBeenCalledTimes(2);
  });

  test("does not open a kind of document that can no longer be drafted", async () => {
    vi.mocked(openDocument).mockResolvedValue(saved(12, "retired-agreement"));
    renderLoader("?doc=12");

    expect((await screen.findByRole("alert")).textContent).toContain("can no longer be drafted");
    expect(screen.queryByLabelText("Workspace")).toBeNull();
  });

  test("puts a document's id in the address when it is saved, and carries on with it", () => {
    const { goTo } = renderLoader();
    type("half a message");

    act(() => screen.getByRole("button", { name: "Save" }).click());

    expect(replaceState).toHaveBeenCalledExactlyOnceWith(null, "", "?doc=31");
    goTo("?doc=31");
    // The same workspace, not the saved copy of it opened afresh.
    expect(typed()).toBe("half a message");
    expect(openDocument).not.toHaveBeenCalled();
  });

  test("starts a new document when the user leaves the one they saved", () => {
    const { goTo } = renderLoader();
    act(() => screen.getByRole("button", { name: "Save" }).click());
    goTo("?doc=31");
    type("about the saved one");

    goTo("");

    expect(screen.getByText("New")).toBeDefined();
    expect(typed()).toBe("");
  });

  test("opens another document when the address moves on to it", async () => {
    const { goTo } = renderLoader("?doc=12");
    await screen.findByText("Opened 12");

    goTo("?doc=13");

    expect(await screen.findByText("Opened 13")).toBeDefined();
    expect(screen.queryByText("Opened 12")).toBeNull();
  });

  test("opens the saved copy when the user comes back to a document they left", async () => {
    const { goTo } = renderLoader();
    act(() => screen.getByRole("button", { name: "Save" }).click());
    goTo("?doc=31");
    goTo("");

    goTo("?doc=31");

    expect(await screen.findByText("Opened 31")).toBeDefined();
    expect(openDocument).toHaveBeenCalledExactlyOnceWith(31);
  });

  test("ignores a document that arrives after the user has moved on", async () => {
    let arrive: (document: SavedDocument) => void = () => {};
    vi.mocked(openDocument).mockReturnValueOnce(new Promise((resolve) => (arrive = resolve)));
    const { goTo } = renderLoader("?doc=12");

    goTo("");
    await act(async () => arrive(saved(12)));

    expect(screen.getByText("New")).toBeDefined();
  });
});
