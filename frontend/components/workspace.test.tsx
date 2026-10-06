import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Workspace } from "@/components/workspace";
import { fetchTemplates } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import { loadSpecs, loadTemplates } from "@/lib/load-documents";
import { downloadPdf } from "@/lib/pdf";
import { loadStandardTerms, type Clause } from "@/lib/standard-terms";
import type { Template } from "@/lib/template";

vi.mock("@/lib/pdf", () => ({ downloadPdf: vi.fn() }));
vi.mock("@/lib/api", async (original) => ({
  ...(await original<typeof import("@/lib/api")>()),
  fetchTemplates: vi.fn(),
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
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.mocked(downloadPdf).mockReset();
  vi.mocked(fetchTemplates).mockReset();
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

  test("shows extra header content beside the download button", () => {
    render(
      <Workspace documents={documents} clauses={clauses} headerExtra={<button>Sign out</button>} />,
    );

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "Sign out" })).toBeDefined();
    expect(header.getByRole("button", { name: "Download PDF" })).toBeDefined();
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

      expect(screen.getByRole("main").textContent).toBe("Loading the Cloud Service Agreement…");
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
});
