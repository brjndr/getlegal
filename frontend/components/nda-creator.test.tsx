import { readFile } from "node:fs/promises";
import path from "node:path";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";
import { NdaCreator } from "@/components/nda-creator";
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

function renderCreator() {
  render(<NdaCreator clauses={clauses} />);
  return {
    agreement: within(screen.getByRole("article")),
    party: (name: "Party 1" | "Party 2") =>
      within(screen.getByRole("group", { name })),
  };
}

function type(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
}

describe("NdaCreator", () => {
  test("starts with today's date and one-year terms", () => {
    const { agreement } = renderCreator();

    expect(agreement.getByText("October 4, 2026")).toBeDefined();
    expect(agreement.getAllByText("1 year")).toHaveLength(2);
    expect(agreement.getByText("None.")).toBeDefined();
  });

  test("shows what is typed into the form in the agreement", () => {
    const { agreement } = renderCreator();

    type(
      screen.getByLabelText("How confidential information may be used"),
      "Exploring a joint venture.",
    );
    type(screen.getByLabelText("Effective date"), "2027-01-15");
    type(screen.getByLabelText("State whose laws apply"), "Delaware");
    type(screen.getByLabelText("Where disputes are heard"), "New Castle, DE");
    type(screen.getByLabelText("Modifications"), "Section 7 does not apply.");

    expect(agreement.getByText("Exploring a joint venture.")).toBeDefined();
    expect(agreement.getByText("January 15, 2027")).toBeDefined();
    expect(agreement.getByText("Delaware")).toBeDefined();
    expect(agreement.getByText("New Castle, DE")).toBeDefined();
    expect(agreement.getByText("Section 7 does not apply.")).toBeDefined();
    expect(agreement.queryByText("None.")).toBeNull();
  });

  test("puts each party's details in its own signature column", () => {
    const { agreement, party } = renderCreator();

    type(party("Party 1").getByLabelText("Company"), "Acme Inc.");
    type(party("Party 1").getByLabelText("Signer’s name"), "Ada Lovelace");
    type(party("Party 2").getByLabelText("Company"), "Globex LLC");
    type(party("Party 2").getByLabelText("Notice address"), "legal@globex.example");

    const cells = (label: string) =>
      within(agreement.getByRole("row", { name: new RegExp(`^${label}`) }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);

    expect(cells("Company")).toEqual(["Acme Inc.", "Globex LLC"]);
    expect(cells("Print Name")).toEqual(["Ada Lovelace", ""]);
    expect(cells("Notice Address")).toEqual(["", "legal@globex.example"]);
  });

  test("writes out the chosen number of years", () => {
    const { agreement } = renderCreator();

    type(screen.getByLabelText("Years until the NDA expires"), "3");
    type(screen.getByLabelText("Years confidential information stays protected"), "5");

    expect(agreement.getByText("3 years")).toBeDefined();
    expect(agreement.getByText("5 years")).toBeDefined();
  });

  test("asks for a number of years when the field is cleared", () => {
    const { agreement } = renderCreator();

    type(screen.getByLabelText("Years until the NDA expires"), "");

    expect(agreement.getByText("number of years")).toBeDefined();
    expect(agreement.getAllByText("1 year")).toHaveLength(1);
  });

  test("ticks the selected term options", () => {
    const { agreement } = renderCreator();
    const selected = () =>
      agreement
        .getAllByText("Selected:")
        .map((marker) => marker.parentElement?.textContent);

    expect(selected()).toEqual([
      expect.stringContaining("Expires 1 year from Effective Date."),
      expect.stringContaining("1 year from Effective Date, but in the case of trade secrets"),
    ]);

    fireEvent.click(screen.getByLabelText("Continues until either party ends it"));
    fireEvent.click(screen.getByLabelText("Forever"));

    expect(selected()).toEqual([
      expect.stringContaining("Continues until terminated"),
      expect.stringContaining("In perpetuity."),
    ]);
    expect(
      (screen.getByLabelText("Years until the NDA expires") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  test("shows the Standard Terms word for word", async () => {
    const { agreement } = renderCreator();
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

  test("asks for the effective date when it is cleared", () => {
    const { agreement } = renderCreator();

    type(screen.getByLabelText("Effective date"), "");

    expect(agreement.getByText("Effective date", { selector: "span" })).toBeDefined();
    expect(agreement.queryByText("October 4, 2026")).toBeNull();
  });

  test("marks every value that is still missing", () => {
    const { agreement } = renderCreator();

    type(screen.getByLabelText("How confidential information may be used"), "   ");
    type(screen.getByLabelText("Years confidential information stays protected"), "0");

    expect(agreement.getByText("Describe the purpose")).toBeDefined();
    expect(agreement.getByText("State")).toBeDefined();
    expect(agreement.getByText("City or county and state")).toBeDefined();
    expect(agreement.getByText("number of years")).toBeDefined();
  });

  test("keeps the template wording for the options that are not selected", () => {
    const { agreement } = renderCreator();
    const notSelected = () =>
      agreement
        .getAllByText("Not selected:")
        .map((marker) => marker.parentElement?.textContent);

    type(screen.getByLabelText("Years until the NDA expires"), "3");
    type(screen.getByLabelText("Years confidential information stays protected"), "5");
    fireEvent.click(screen.getByLabelText("Continues until either party ends it"));
    fireEvent.click(screen.getByLabelText("Forever"));

    expect(notSelected()).toEqual([
      expect.stringContaining("Expires 1 year(s) from Effective Date."),
      expect.stringContaining("1 year(s) from Effective Date, but in the case of trade secrets"),
    ]);
  });

  test("leaves the date out of the server render so hydration matches", () => {
    const html = renderToString(<NdaCreator clauses={clauses} />);

    expect(html).not.toContain("October 4, 2026");
    expect(html).toContain("Effective date</span>");
  });

  test.each([
    ["", "", "Mutual NDA"],
    [" Acme Inc. ", "Globex LLC", "Mutual NDA - Acme Inc. and Globex LLC"],
    ["Acme Inc.", "", "Mutual NDA - Acme Inc."],
    ["   ", "Globex LLC", "Mutual NDA - Globex LLC"],
  ])("names the PDF for companies %j and %j", (company1, company2, expected) => {
    const { party } = renderCreator();
    document.title = "Mutual NDA creator";
    let titleWhilePrinting = "";
    const print = vi.fn(() => {
      titleWhilePrinting = document.title;
    });
    vi.stubGlobal("print", print);

    type(party("Party 1").getByLabelText("Company"), company1);
    type(party("Party 2").getByLabelText("Company"), company2);
    fireEvent.click(screen.getByRole("button", { name: "Download PDF" }));

    expect(print).toHaveBeenCalledOnce();
    expect(titleWhilePrinting).toBe(expected);
    // The dialog may still be open after print() returns.
    expect(document.title).toBe(expected);

    fireEvent(window, new Event("afterprint"));

    expect(document.title).toBe("Mutual NDA creator");
  });
});
