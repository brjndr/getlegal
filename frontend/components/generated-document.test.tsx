import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { GeneratedDocument } from "@/components/generated-document";
import type { DocumentSpec, Values } from "@/lib/documents";
import { parseTemplate } from "@/lib/template";

afterEach(cleanup);

const SPEC: DocumentSpec = {
  id: "pilot-agreement",
  name: "Pilot Agreement",
  template: "Pilot-Agreement.md",
  parties: [
    { key: "provider", label: "Provider" },
    { key: "customer", label: "Customer" },
  ],
  terms: ["Notice Address"],
  fields: [
    { key: "product", label: "Product", variables: [] },
    { key: "pilotPeriod", label: "Pilot Period" },
    { key: "effectiveDate", label: "Effective Date", kind: "date" },
    { key: "dpa", label: "DPA", optional: true },
  ],
};

const TEMPLATE = parseTemplate(
  [
    "# Pilot Agreement",
    '1. <span class="header_2" id="1">Pilot Access</span>',
    '    1. <span class="header_3" id="1.1">Access.</span>  During the <span class="orderform_link">Pilot Period</span>, <span class="orderform_link">Customer</span> may use <span class="orderform_link">Provider\'s</span> Product from the <span class="orderform_link">Effective Date</span>.',
    "        a. **No resale.** See <https://commonpaper.com/pilot>.",
    '    2. <span class="header_3" id="1.2">Privacy.</span>  The <span class="orderform_link">DPA</span> applies. Notices go to the <span class="orderform_link">Notice Address</span>.',
  ].join("\n"),
);

const VALUES: Values = {
  providerCompany: "Acme Inc.",
  providerName: "Ada Lovelace",
  customerCompany: "Globex LLC",
  customerNoticeAddress: "legal@globex.example",
  product: "Widget Cloud",
  pilotPeriod: "90 days",
  effectiveDate: "2027-01-15",
  dpa: "None",
};

function renderDocument(values: Values = VALUES) {
  render(<GeneratedDocument spec={SPEC} template={TEMPLATE} values={values} />);
  return within(screen.getByRole("article"));
}

/** The text of the paragraph that starts with this clause number. */
function clause(label: string): string {
  const paragraphs = [...screen.getByRole("article").querySelectorAll("p[data-indent]")];
  return paragraphs.find((paragraph) => paragraph.textContent?.startsWith(label))?.textContent ?? "";
}

describe("GeneratedDocument", () => {
  test("names the document and what it consists of", () => {
    const agreement = renderDocument();

    expect(agreement.getByRole("heading", { level: 2, name: "Pilot Agreement" })).toBeDefined();
    expect(agreement.getByText(/the Common Paper Pilot Agreement Standard Terms \(“/)).toBeDefined();
    expect(agreement.getByText(/free to use under/).textContent).toContain("CC BY 4.0");
  });

  test("lists each term on the cover page with the user's value", () => {
    const agreement = renderDocument();
    const term = (title: string) =>
      agreement.getByRole("heading", { level: 3, name: title }).parentElement?.textContent;

    expect(term("Product")).toBe("ProductWidget Cloud");
    expect(term("Pilot Period")).toBe("Pilot Period90 days");
    expect(term("Effective Date")).toBe("Effective DateJanuary 15, 2027");
    // A term the user left out says so.
    expect(term("DPA")).toBe("DPANone");
  });

  test("marks every value that is still missing", () => {
    const agreement = renderDocument({ pilotPeriod: "  " });
    const blanks = [...screen.getByRole("article").querySelectorAll("[data-blank]")];

    expect(agreement.getAllByText("Pilot Period", { selector: "[data-blank]" })).toHaveLength(2);
    expect(blanks.map((blank) => blank.textContent)).toEqual([
      "Product",
      "Pilot Period",
      "Effective Date",
      "DPA",
      "Pilot Period",
      "Customer",
      "Provider",
      "Effective Date",
      "DPA",
    ]);
  });

  test("puts each party's details in its own signature column", () => {
    const agreement = renderDocument();
    const cells = (label: string) =>
      within(agreement.getByRole("row", { name: new RegExp(`^${label}`) }))
        .getAllByRole("cell")
        .map((cell) => cell.textContent);

    expect(
      agreement.getAllByRole("columnheader").map((heading) => heading.textContent),
    ).toEqual(["Provider", "Customer"]);
    expect(cells("Company")).toEqual(["Acme Inc.", "Globex LLC"]);
    expect(cells("Print Name")).toEqual(["Ada Lovelace", ""]);
    expect(cells("Notice Address")).toEqual(["", "legal@globex.example"]);
  });

  test("names the parties and shows each value beside its term in the Standard Terms", () => {
    renderDocument();

    expect(clause("1.1")).toBe(
      "1.1 Access. During the Pilot Period (90 days), Globex LLC may use Acme Inc.’s Product from the Effective Date (January 15, 2027).",
    );
  });

  test("keeps a term as it is when the user left it out or it has no value of its own", () => {
    renderDocument();

    expect(clause("1.2")).toBe("1.2 Privacy. The DPA applies. Notices go to the Notice Address.");
  });

  test("sets out the clauses by number, with their titles, bold text and links", () => {
    const agreement = renderDocument();
    const terms = agreement.getByRole("heading", { name: "Standard Terms" }).parentElement!;
    const paragraphs = [...terms.querySelectorAll("p")];

    expect(paragraphs.map((paragraph) => paragraph.dataset.indent)).toEqual(["0", "1", "2", "1"]);
    expect(clause("1.")).toBe("1. Pilot Access ");
    expect(clause("(a)")).toBe("(a) No resale. See https://commonpaper.com/pilot.");
    expect(within(terms).getByText("No resale.").tagName).toBe("STRONG");
    expect(within(terms).getByRole("link").getAttribute("href")).toBe("https://commonpaper.com/pilot");
  });
});
