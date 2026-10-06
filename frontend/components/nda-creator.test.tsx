import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { NdaCreator } from "@/components/nda-creator";
import type { NdaChanges } from "@/lib/nda";
import { loadStandardTerms, type Clause } from "@/lib/standard-terms";

const TEMPLATE_PATH = path.join(process.cwd(), "..", "templates", "Mutual-NDA.md");

let clauses: Clause[];

beforeAll(async () => {
  clauses = await loadStandardTerms();
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 4, 9));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

let replies = 0;

function renderCreator() {
  render(<NdaCreator clauses={clauses} />);
  return within(screen.getByRole("article"));
}

/** Sends a message that the assistant answers by making these changes to the agreement. */
async function tell(changes: NdaChanges) {
  const reply = `Noted (${++replies}).`;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ reply, changes, settled: [] })),
  );
  fireEvent.change(screen.getByLabelText("Message"), { target: { value: "Here you go" } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
  await screen.findByText(reply);
}

describe("NdaCreator", () => {
  test("starts with today's date and one-year terms", () => {
    const agreement = renderCreator();

    expect(agreement.getByText("October 4, 2026")).toBeDefined();
    expect(agreement.getAllByText("1 year")).toHaveLength(2);
    expect(agreement.getByText("None.")).toBeDefined();
  });

  test("shows what the assistant fills in from the conversation", async () => {
    const agreement = renderCreator();

    await tell({
      purpose: "Exploring a joint venture.",
      effectiveDate: "2027-01-15",
      governingLaw: "Delaware",
      jurisdiction: "New Castle, DE",
      modifications: "Section 7 does not apply.",
    });

    expect(agreement.getByText("Exploring a joint venture.")).toBeDefined();
    expect(agreement.getByText("January 15, 2027")).toBeDefined();
    expect(agreement.getByText("Delaware")).toBeDefined();
    expect(agreement.getByText("New Castle, DE")).toBeDefined();
    expect(agreement.getByText("Section 7 does not apply.")).toBeDefined();
    expect(agreement.queryByText("None.")).toBeNull();
  });

  test("keeps earlier answers when later ones arrive", async () => {
    const agreement = renderCreator();

    await tell({ governingLaw: "Delaware", party1: { company: "Acme Inc." } });
    await tell({ jurisdiction: "New Castle, DE", party1: { name: "Ada Lovelace" } });

    expect(agreement.getByText("Delaware")).toBeDefined();
    expect(agreement.getByText("New Castle, DE")).toBeDefined();
    expect(agreement.getByText("Acme Inc.")).toBeDefined();
    expect(agreement.getByText("Ada Lovelace")).toBeDefined();
  });

  test("sends the assistant the agreement as it now stands", async () => {
    renderCreator();
    await tell({ governingLaw: "Delaware" });

    await tell({});

    const request = JSON.parse(vi.mocked(fetch).mock.calls[0][1]?.body as string);
    expect(request.form.governingLaw).toBe("Delaware");
    expect(request.today).toBe("2026-10-04");
  });

  test("puts each party's details in its own signature column", async () => {
    const agreement = renderCreator();

    await tell({
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

  test("writes out the chosen number of years", async () => {
    const agreement = renderCreator();

    await tell({ mndaTermYears: "3", confidentialityYears: "5" });

    expect(agreement.getByText("3 years")).toBeDefined();
    expect(agreement.getByText("5 years")).toBeDefined();
  });

  test("ticks the selected term options and keeps the template wording for the others", async () => {
    const agreement = renderCreator();
    const marked = (marker: string) =>
      agreement.getAllByText(marker).map((element) => element.parentElement?.textContent);

    expect(marked("Selected:")).toEqual([
      expect.stringContaining("Expires 1 year from Effective Date."),
      expect.stringContaining("1 year from Effective Date, but in the case of trade secrets"),
    ]);

    await tell({
      mndaTerm: "until-terminated",
      mndaTermYears: "3",
      confidentialityTerm: "perpetuity",
      confidentialityYears: "5",
    });

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
    const agreement = renderCreator();
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

  test("leaves the date out of the server render so hydration matches", () => {
    const html = renderToString(<NdaCreator clauses={clauses} />);

    expect(html).not.toContain("October 4, 2026");
    expect(html).toContain("Effective date</span>");
    // The greeting needs no request, so it is there from the start.
    expect(html).toContain("which two companies are entering into the NDA?");
  });

  test("shows extra header content beside the download button", () => {
    render(<NdaCreator clauses={clauses} headerExtra={<button>Sign out</button>} />);

    const header = within(screen.getByRole("banner"));
    expect(header.getByRole("button", { name: "Sign out" })).toBeDefined();
    expect(header.getByRole("button", { name: "Download PDF" })).toBeDefined();
  });

  test.each([
    ["", "", "Mutual NDA"],
    [" Acme Inc. ", "Globex LLC", "Mutual NDA - Acme Inc. and Globex LLC"],
    ["Acme Inc.", "", "Mutual NDA - Acme Inc."],
    ["   ", "Globex LLC", "Mutual NDA - Globex LLC"],
  ])("names the PDF for companies %j and %j", async (company1, company2, expected) => {
    renderCreator();
    document.title = "Mutual NDA creator";
    let titleWhilePrinting = "";
    const print = vi.fn(() => {
      titleWhilePrinting = document.title;
    });
    vi.stubGlobal("print", print);

    await tell({ party1: { company: company1 }, party2: { company: company2 } });
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toBe(expected);
    // The dialog may still be open after print() returns.
    expect(document.title).toBe(expected);

    fireEvent(window, new Event("afterprint"));

    expect(document.title).toBe("Mutual NDA creator");
  });
});
