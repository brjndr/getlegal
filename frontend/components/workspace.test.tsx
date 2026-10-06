import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Workspace } from "@/components/workspace";
import { fetchTemplates, saveDocument, type SavedDocument } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";
import type { DocumentSpec } from "@/lib/documents";
import { loadSpecs, loadTemplates } from "@/lib/load-documents";
import { defaultNdaForm } from "@/lib/nda";
import { downloadPdf } from "@/lib/pdf";
import { loadStandardTerms, type Clause } from "@/lib/standard-terms";
import type { Template } from "@/lib/template";

vi.mock("@/lib/pdf", () => ({ downloadPdf: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  fetchTemplates: vi.fn(),
  saveDocument: vi.fn(),
}));

const TEMPLATE_PATH = path.join(process.cwd(), "..", "templates", "Mutual-NDA.md");

let documents: DocumentSpec[];
let clauses: Clause[];
let templates: Record<string, Template>;

beforeAll(async () => {
  [documents, clauses, templates] = await Promise.all([
    loadSpecs(),
    loadStandardTerms(),
    loadTemplates(),
  ]);
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 9));
  vi.mocked(fetchTemplates).mockImplementation(async () => templates);
  // Each new document is saved under the next id.
  let saved = 0;
  vi.mocked(saveDocument).mockImplementation(async (id, { draft }) => ({
    id: id ?? ++saved,
    document: draft.document,
    parties: "",
    updatedAt: "2026-10-04T16:00:00+00:00",
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(downloadPdf).mockReset();
  vi.mocked(fetchTemplates).mockReset();
  vi.mocked(saveDocument).mockReset();
});

let replies = 0;

/** Sends a message, which the assistant answers with these turns, one per request. */
async function tell(...turns: object[]) {
  const reply = `Noted (${++replies}).`;
  const fetch = vi.fn();
  turns.forEach((turn, index) =>
    fetch.mockImplementationOnce(async () =>
      Response.json({ reply: index === turns.length - 1 ? reply : "", changes: {}, ...turn }),
    ),
  );
  vi.stubGlobal("fetch", fetch);
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Here you go" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(reply);
  return fetch;
}

/** Has the user choose a document, which the assistant starts by making these changes. */
async function start(document: string, changes: object = {}) {
  render(<Workspace documents={documents} clauses={clauses} />);
  await tell({ document }, { changes, settled: [] });
  return within(await screen.findByRole("article"));
}

const body = (fetch: ReturnType<typeof vi.fn>, index: number) =>
  JSON.parse(fetch.mock.calls[index][1].body as string);

describe("Workspace", () => {
  test("starts with no agreement and lists the ones it can draft", () => {
    render(<Workspace documents={documents} clauses={clauses} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Draft an agreement");
    expect(screen.queryByRole("article")).toBeNull();
    expect(
      within(screen.getByRole("main"))
        .getAllByRole("listitem")
        .map((item) => item.textContent),
    ).toEqual(documents.map((document) => document.name));
    expect((screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(fetchTemplates).not.toHaveBeenCalled();
  });

  test("leaves the agreement out of the server render, which has no document yet", () => {
    const html = renderToString(<Workspace documents={documents} clauses={clauses} />);

    expect(html).not.toContain("<article");
    // The greeting needs no request, so it is there from the start.
    expect(html).toContain("Which do you need?");
  });

  describe("drafting the Mutual NDA", () => {
    test("starts with today's date and one-year terms", async () => {
      const agreement = await start("mutual-nda");

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mutual NDA");
      expect(agreement.getByText("October 4, 2026")).toBeDefined();
      expect(agreement.getAllByText("1 year")).toHaveLength(2);
      expect(agreement.getByText("None.")).toBeDefined();
      expect(fetchTemplates).not.toHaveBeenCalled();
    });

    test("shows what the assistant fills in from the conversation", async () => {
      const agreement = await start("mutual-nda", { purpose: "Exploring a joint venture." });

      await tell({
        changes: {
          effectiveDate: "2027-01-15",
          governingLaw: "Delaware",
          jurisdiction: "New Castle, DE",
          modifications: "Section 7 does not apply.",
        },
      });

      expect(agreement.getByText("Exploring a joint venture.")).toBeDefined();
      expect(agreement.getByText("January 15, 2027")).toBeDefined();
      expect(agreement.getByText("Delaware")).toBeDefined();
      expect(agreement.getByText("New Castle, DE")).toBeDefined();
      expect(agreement.getByText("Section 7 does not apply.")).toBeDefined();
      expect(agreement.queryByText("None.")).toBeNull();
    });

    test("keeps earlier answers when later ones arrive", async () => {
      const agreement = await start("mutual-nda");

      await tell({ changes: { governingLaw: "Delaware", party1: { company: "Acme Inc." } } });
      const fetch = await tell({
        changes: { jurisdiction: "New Castle, DE", party1: { name: "Ada Lovelace" } },
      });

      expect(agreement.getByText("Delaware")).toBeDefined();
      expect(agreement.getByText("New Castle, DE")).toBeDefined();
      expect(agreement.getByText("Acme Inc.")).toBeDefined();
      expect(agreement.getByText("Ada Lovelace")).toBeDefined();
      // The assistant is sent the agreement as it now stands.
      expect(body(fetch, 0).form.governingLaw).toBe("Delaware");
      expect(body(fetch, 0).today).toBe("2026-10-04");
    });

    test("puts each party's details in its own signature column", async () => {
      const agreement = await start("mutual-nda", {
        party1: { company: "Acme Inc.", name: "Ada Lovelace" },
        party2: { company: "Globex LLC", noticeAddress: "legal@globex.example" },
      });

      const cells = (label: string) =>
        within(agreement.getByRole("row", { name: new RegExp(`^${label}`) }))
          .getAllByRole("cell")
          .map((cell) => cell.textContent);

      expect(cells("Company")).toEqual(["Acme Inc.", "Globex LLC"]);
      expect(cells("Print Name")).toEqual(["Ada Lovelace", ""]);
      expect(cells("Notice Address")).toEqual(["", "legal@globex.example"]);
    });

    test("ticks the selected term options and keeps the template wording for the others", async () => {
      const agreement = await start("mutual-nda", { mndaTermYears: "3", confidentialityYears: "5" });
      const marked = (marker: string) =>
        agreement.getAllByText(marker).map((element) => element.parentElement?.textContent);

      expect(marked("Selected:")).toEqual([
        expect.stringContaining("Expires 3 years from Effective Date."),
        expect.stringContaining("5 years from Effective Date, but in the case of trade secrets"),
      ]);

      await tell({ changes: { mndaTerm: "until-terminated", confidentialityTerm: "perpetuity" } });

      expect(marked("Selected:")).toEqual([
        expect.stringContaining("Continues until terminated"),
        expect.stringContaining("In perpetuity."),
      ]);
      expect(marked("Not selected:")).toEqual([
        expect.stringContaining("Expires 1 year(s) from Effective Date."),
        expect.stringContaining("1 year(s) from Effective Date, but in the case of trade secrets"),
      ]);
    });

    test("shows the Standard Terms word for word", async () => {
      const agreement = await start("mutual-nda");
      const markdown = await readFile(TEMPLATE_PATH, "utf8");
      const expected = markdown
        .split(/\r?\n/)
        .filter((line) => /^\d+\./.test(line))
        .map((line) =>
          line
            .replace(/^\d+\.\s+/, "")
            .replace(/<\/?span[^>]*>/g, "")
            .replaceAll("**", ""),
        );

      const standardTerms = agreement.getByRole("heading", { name: "Standard Terms" })
        .parentElement as HTMLElement;
      const rendered = within(standardTerms)
        .getAllByRole("listitem")
        .map((item) => item.textContent);

      expect(rendered).toEqual(expected);
    });
  });

  describe("drafting another document", () => {
    test("shows the agreement with what the assistant fills in", async () => {
      const agreement = await start("pilot-agreement", { providerCompany: "Acme Inc." });

      await tell({ changes: { customerCompany: "Globex LLC", pilotPeriod: "90 days" } });

      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pilot Agreement");
      expect(agreement.getByRole("heading", { level: 2, name: "Pilot Agreement" })).toBeDefined();
      const paragraphs = [...screen.getByRole("article").querySelectorAll("p")];
      const access = paragraphs.find((paragraph) => paragraph.textContent?.startsWith("1.1 "));
      expect(access?.textContent).toContain(
        "During the Pilot Period (90 days) and subject to the terms of this Agreement, Globex LLC may access",
      );
      expect(agreement.getAllByText("Acme Inc.").length).toBeGreaterThan(5);
    });

    test("sends the assistant the agreement as it now stands", async () => {
      await start("pilot-agreement", { providerCompany: "Acme Inc." });

      const fetch = await tell({ changes: {} });

      expect(fetch.mock.calls[0][0]).toBe("/api/draft");
      expect(body(fetch, 0)).toMatchObject({
        document: "pilot-agreement",
        values: { providerCompany: "Acme Inc." },
      });
    });

    test("says the agreement is loading until its text arrives", async () => {
      let arrive: (templates: Record<string, Template>) => void = () => {};
      vi.mocked(fetchTemplates).mockReturnValue(new Promise((resolve) => (arrive = resolve)));
      render(<Workspace documents={documents} clauses={clauses} />);

      await tell({ document: "csa" }, {});

      expect(within(screen.getByRole("main")).getByRole("status").textContent).toBe(
        "Loading the Cloud Service Agreement…",
      );
      const download = screen.getByRole("button", { name: "Download PDF" }) as HTMLButtonElement;
      expect(download.disabled).toBe(true);

      arrive(templates);

      expect(await screen.findByRole("article")).toBeDefined();
      expect(download.disabled).toBe(false);
    });

    test("offers to try again when the agreement's text cannot be loaded", async () => {
      vi.mocked(fetchTemplates).mockRejectedValueOnce(new Error("offline"));
      render(<Workspace documents={documents} clauses={clauses} />);

      await tell({ document: "csa" }, {});
      const alert = await screen.findByRole("alert");

      expect(alert.textContent).toContain("Cloud Service Agreement couldn’t be loaded");
      fireEvent.click(within(alert).getByRole("button", { name: "Try again" }));

      const agreement = within(await screen.findByRole("article"));
      expect(agreement.getAllByRole("heading", { level: 2 })[0].textContent).toBe(
        "Cloud Service Agreement",
      );
    });

    test("replaces the agreement when the user asks for a different one", async () => {
      await start("pilot-agreement", { providerCompany: "Acme Inc." });

      const fetch = await tell({ document: "mutual-nda" }, { changes: {}, settled: [] });

      const agreement = within(screen.getByRole("article"));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Mutual NDA");
      expect(agreement.getByText("Mutual Non-Disclosure Agreement")).toBeDefined();
      expect(agreement.queryByText("Acme Inc.")).toBeNull();
      expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/draft", "/api/chat"]);
    });
  });

  test.each([
    ["mutual-nda", {}, "Mutual NDA"],
    [
      "mutual-nda",
      { party1: { company: " Acme Inc. " }, party2: { company: "Globex LLC" } },
      "Mutual NDA - Acme Inc. and Globex LLC",
    ],
    ["mutual-nda", { party1: { company: "   " }, party2: { company: "Globex LLC" } }, "Mutual NDA - Globex LLC"],
    ["pilot-agreement", {}, "Pilot Agreement"],
    ["pilot-agreement", { providerCompany: "Acme Inc." }, "Pilot Agreement - Acme Inc."],
    [
      "partnership-agreement",
      { partnerCompany: "Globex LLC", companyCompany: "Acme Inc." },
      "Partnership Agreement - Acme Inc. and Globex LLC",
    ],
  ])("downloads the %s with %j as a PDF named %j", async (document, changes, name) => {
    await start(document, changes);

    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(downloadPdf).toHaveBeenCalledExactlyOnceWith(screen.getByRole("article"), name);
  });

  test("warns that the agreement is a draft, beside it and not in it", async () => {
    const agreement = await start("pilot-agreement");

    expect(screen.getByRole("note").textContent).toBe(DISCLAIMER);
    // The PDF is made from the agreement, and carries the warning at the foot of each page.
    expect(agreement.queryByText(DISCLAIMER)).toBeNull();
  });

  test("shows the chat or the document on a phone, keeping both on the page", async () => {
    await start("pilot-agreement");
    const chat = screen.getByRole("complementary");
    const agreement = screen.getByRole("main");
    const hidden = (pane: HTMLElement) => pane.className.split(" ").includes("hidden");
    const pressed = (name: string) =>
      screen.getByRole("button", { name }).getAttribute("aria-pressed");
    expect([pressed("Chat"), pressed("Document")]).toEqual(["true", "false"]);
    expect([hidden(chat), hidden(agreement)]).toEqual([false, true]);

    fireEvent.click(screen.getByRole("button", { name: "Document" }));

    expect([pressed("Chat"), pressed("Document")]).toEqual(["false", "true"]);
    expect([hidden(chat), hidden(agreement)]).toEqual([true, false]);
    // Hidden, not gone: the conversation and the agreement are both still there.
    expect(within(chat).getByText(`Noted (${replies}).`)).toBeDefined();
    expect(within(agreement).getByRole("article")).toBeDefined();
  });

  describe("saving", () => {
    const saves = () =>
      vi.mocked(saveDocument).mock.calls.map(([id, state]) => ({
        id,
        document: state.draft.document,
        messages: state.messages.length,
      }));

    test("saves nothing until the user has chosen a document", async () => {
      render(<Workspace documents={documents} clauses={clauses} />);

      await tell({});

      expect(saveDocument).not.toHaveBeenCalled();
      expect(screen.queryByText("Saved")).toBeNull();
    });

    test("saves the agreement and its conversation after each reply", async () => {
      const onSaved = vi.fn();
      render(<Workspace documents={documents} clauses={clauses} onSaved={onSaved} />);

      await tell({ document: "pilot-agreement" }, { changes: { providerCompany: "Acme Inc." } });
      await screen.findByText("Saved");
      await tell({ changes: { customerCompany: "Globex LLC" } });
      await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));

      // A new document first, then over the same one.
      expect(saves()).toEqual([
        { id: null, document: "pilot-agreement", messages: 2 },
        { id: 1, document: "pilot-agreement", messages: 4 },
      ]);
      expect(vi.mocked(saveDocument).mock.calls[1][1].draft.values).toEqual({
        providerCompany: "Acme Inc.",
        customerCompany: "Globex LLC",
      });
      expect(onSaved).toHaveBeenCalledExactlyOnceWith(1);
    });

    test("saves a different document as a new one, leaving the first as it was", async () => {
      const onSaved = vi.fn();
      render(<Workspace documents={documents} clauses={clauses} onSaved={onSaved} />);
      await tell({ document: "pilot-agreement" }, {});

      await tell({ document: "mutual-nda" }, { changes: {}, settled: [] });
      await tell({ changes: { governingLaw: "Delaware" } });
      await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(3));

      expect(saves()).toEqual([
        { id: null, document: "pilot-agreement", messages: 2 },
        { id: null, document: "mutual-nda", messages: 2 },
        { id: 2, document: "mutual-nda", messages: 4 },
      ]);
      expect(onSaved.mock.calls).toEqual([[1], [2]]);
    });

    test("carries on with a saved document, saving over it", async () => {
      const opened: SavedDocument = {
        id: 7,
        document: "pilot-agreement",
        parties: "Acme Inc.",
        updatedAt: "2026-10-01T16:00:00+00:00",
        draft: {
          document: "pilot-agreement",
          form: defaultNdaForm,
          values: { providerCompany: "Acme Inc." },
          settled: [],
        },
        messages: [
          { role: "user", content: "A pilot for Acme" },
          { role: "assistant", content: "Who is the customer?" },
        ],
      };
      const onSaved = vi.fn();
      render(<Workspace documents={documents} clauses={clauses} opened={opened} onSaved={onSaved} />);

      const agreement = within(await screen.findByRole("article"));
      expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Pilot Agreement");
      expect(agreement.getAllByText("Acme Inc.").length).toBeGreaterThan(0);
      expect(screen.getByText("Who is the customer?")).toBeDefined();
      expect(screen.getByText("Saved")).toBeDefined();
      expect(screen.queryByText(/Which do you need/)).toBeNull();

      const fetch = await tell({ changes: { customerCompany: "Globex LLC" } });
      await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(1));

      expect(body(fetch, 0)).toMatchObject({
        document: "pilot-agreement",
        values: { providerCompany: "Acme Inc." },
        messages: [...opened.messages, { role: "user", content: "Here you go" }],
      });
      expect(saves()).toEqual([{ id: 7, document: "pilot-agreement", messages: 4 }]);
      // It already had its id.
      expect(onSaved).not.toHaveBeenCalled();
    });

    test("says when the agreement could not be saved, and saves it on request", async () => {
      vi.mocked(saveDocument).mockRejectedValueOnce(new Error("offline"));
      render(<Workspace documents={documents} clauses={clauses} />);

      await tell({ document: "pilot-agreement" }, {});

      expect(await screen.findByText("Not saved.")).toBeDefined();
      // The agreement is still there to work on.
      expect(screen.getByRole("article")).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByText("Saved")).toBeDefined();
      expect(saves()).toEqual([
        { id: null, document: "pilot-agreement", messages: 2 },
        { id: null, document: "pilot-agreement", messages: 2 },
      ]);
    });
  });
});
