import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { DocumentList } from "@/components/document-list";
import { deleteDocument, listDocuments, type SavedSummary } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";

vi.mock("@/lib/api", () => ({ listDocuments: vi.fn(), deleteDocument: vi.fn() }));

const DOCUMENTS: DocumentSpec[] = [
  { id: "mutual-nda", name: "Mutual Non-Disclosure Agreement", template: "", engine: "nda" },
  { id: "pilot-agreement", name: "Pilot Agreement", template: "" },
];

const PILOT: SavedSummary = {
  id: 12,
  document: "pilot-agreement",
  parties: "Acme Inc. and Globex LLC",
  // The tests run in Los Angeles, where this is the afternoon of the day before.
  updatedAt: "2026-10-07T01:30:00+00:00",
};
const NDA: SavedSummary = { id: 9, document: "mutual-nda", parties: "", updatedAt: "2026-10-01T16:00:00+00:00" };

afterEach(() => {
  cleanup();
  vi.mocked(listDocuments).mockReset();
  vi.mocked(deleteDocument).mockReset();
});

async function renderList(...saved: SavedSummary[]) {
  vi.mocked(listDocuments).mockResolvedValue(saved);
  render(<DocumentList documents={DOCUMENTS} />);
  return saved.length ? within(await screen.findByRole("list")).getAllByRole("listitem") : [];
}

describe("DocumentList", () => {
  test("says it is loading until the documents arrive", async () => {
    vi.mocked(listDocuments).mockReturnValue(new Promise(() => {}));

    render(<DocumentList documents={DOCUMENTS} />);

    expect(screen.getByRole("status").textContent).toBe("Loading your documents…");
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("lists each document with what it is, who it is between and when it changed", async () => {
    const [pilot, nda] = await renderList(PILOT, NDA);

    expect(pilot.textContent).toContain("Pilot Agreement");
    expect(pilot.textContent).toContain("Acme Inc. and Globex LLC");
    expect(pilot.textContent).toContain("Updated Oct 6, 2026, 6:30 PM");
    expect(nda.textContent).toContain("Mutual Non-Disclosure Agreement");
    expect(nda.textContent).toContain("No parties yet");
    expect(screen.queryByRole("status")).toBeNull();
  });

  test("opens a document in the workspace", async () => {
    const [pilot] = await renderList(PILOT);

    const links = within(pilot).getAllByRole("link");

    expect(links.map((link) => link.textContent)).toEqual(["Pilot Agreement", "Open"]);
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["/?doc=12", "/?doc=12"]);
  });

  test("names a kind of document it no longer knows in general terms", async () => {
    const [unknown] = await renderList({ ...PILOT, document: "retired-agreement" });

    expect(within(unknown).getAllByRole("link")[0].textContent).toBe("Agreement");
  });

  test("invites the user to draft a first agreement when there are none", async () => {
    await renderList();

    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeDefined();
    expect(
      screen.getByRole("link", { name: "Draft your first agreement" }).getAttribute("href"),
    ).toBe("/");
    expect(screen.queryByRole("list")).toBeNull();
  });

  test("offers to try again when the documents cannot be loaded", async () => {
    vi.mocked(listDocuments).mockRejectedValueOnce(new Error("offline")).mockResolvedValue([PILOT]);
    render(<DocumentList documents={DOCUMENTS} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("couldn’t be loaded");
    fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("list")).toBeDefined();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  test("deletes a document only once the user has confirmed it", async () => {
    vi.mocked(deleteDocument).mockResolvedValue();
    const [pilot] = await renderList(PILOT, NDA);

    fireEvent.click(
      within(pilot).getByRole("button", { name: "Delete Pilot Agreement - Acme Inc. and Globex LLC" }),
    );

    expect(pilot.textContent).toContain("Delete for good?");
    expect(deleteDocument).not.toHaveBeenCalled();

    fireEvent.click(within(pilot).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(1));
    expect(deleteDocument).toHaveBeenCalledExactlyOnceWith(12);
    expect(screen.getByRole("listitem").textContent).toContain("Mutual Non-Disclosure Agreement");
  });

  test("keeps a document the user decides not to delete", async () => {
    const [nda] = await renderList(NDA);

    fireEvent.click(
      within(nda).getByRole("button", { name: "Delete Mutual Non-Disclosure Agreement" }),
    );
    fireEvent.click(within(nda).getByRole("button", { name: "Keep" }));

    expect(nda.textContent).not.toContain("Delete for good?");
    expect(within(nda).getByRole("link", { name: "Open" })).toBeDefined();
    expect(deleteDocument).not.toHaveBeenCalled();
  });

  test("shows the empty state after the last document is deleted", async () => {
    vi.mocked(deleteDocument).mockResolvedValue();
    const [nda] = await renderList(NDA);

    fireEvent.click(within(nda).getByRole("button", { name: /^Delete Mutual/ }));
    fireEvent.click(within(nda).getByRole("button", { name: "Delete" }));

    expect(await screen.findByRole("heading", { name: "No documents yet" })).toBeDefined();
  });

  test("keeps a document that could not be deleted, and says so", async () => {
    vi.mocked(deleteDocument).mockRejectedValue(new Error("offline"));
    const [pilot] = await renderList(PILOT);

    fireEvent.click(within(pilot).getByRole("button", { name: /^Delete Pilot/ }));
    fireEvent.click(within(pilot).getByRole("button", { name: "Delete" }));

    expect((await within(pilot).findByRole("alert")).textContent).toBe(
      "This document couldn’t be deleted. Try again.",
    );
    expect(within(pilot).getByRole("link", { name: "Open" })).toBeDefined();
  });
});
