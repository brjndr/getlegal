import { cleanup, render, screen } from "@testing-library/react";
import type { Content } from "pdfmake/interfaces";
import { afterEach, describe, expect, test, vi } from "vitest";
import { GeneratedDocument } from "@/components/generated-document";
import { NdaDocument } from "@/components/nda-document";
import { DISCLAIMER } from "@/lib/disclaimer";
import type { DocumentSpec } from "@/lib/documents";
import { defaultNdaForm } from "@/lib/nda";
import { downloadPdf, pdfDefinition } from "@/lib/pdf";
import { parseStandardTerms } from "@/lib/standard-terms";
import { parseTemplate } from "@/lib/template";

const pdfMake = vi.hoisted(() => {
  const download = vi.fn();
  return { download, createPdf: vi.fn<(...args: unknown[]) => unknown>(() => ({ download })) };
});
vi.mock("pdfmake/build/pdfmake", () => ({ default: pdfMake }));
vi.mock("pdfmake/build/vfs_fonts", () => ({ default: { "Roboto-Regular.ttf": "font" } }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

type Block = {
  text?: { text: string; bold?: boolean; link?: string }[];
  style?: string;
  margin?: number[];
  pageBreak?: string;
  ol?: Block[];
  table?: { body: Block[][] };
};

const words = (block: Block): string => (block.text ?? []).map((run) => run.text).join("");

function ndaBlocks(form = defaultNdaForm): Block[] {
  const clauses = parseStandardTerms(
    '1. **Introduction**. This MNDA covers the <span class="coverpage_link">Purpose</span>.\n' +
      "2. **Term**. It **ends** when it expires.",
  );
  render(<NdaDocument form={form} effectiveDate="2026-10-04" clauses={clauses} />);
  return pdfDefinition(screen.getByRole("article")).content as Block[];
}

const SPEC: DocumentSpec = {
  id: "pilot-agreement",
  name: "Pilot Agreement",
  template: "Pilot-Agreement.md",
  parties: [
    { key: "provider", label: "Provider" },
    { key: "customer", label: "Customer" },
  ],
  fields: [{ key: "pilotPeriod", label: "Pilot Period" }],
};

function generatedBlocks(): Block[] {
  const template = parseTemplate(
    [
      "# Pilot Agreement",
      '1. <span class="header_2">Pilot Access</span>',
      '    1. <span class="header_3">Access.</span>  During the <span class="orderform_link">Pilot Period</span>, <span class="orderform_link">Customer</span> may use it:',
      "        a. for evaluation; and",
      "            i. see <https://commonpaper.com/pilot>.",
    ].join("\n"),
  );
  const values = { pilotPeriod: "90 days", providerCompany: "Acme Inc." };
  render(<GeneratedDocument spec={SPEC} template={template} values={values} />);
  return pdfDefinition(screen.getByRole("article")).content as Block[];
}

describe("pdfDefinition", () => {
  test("starts with the title and the agreement's opening words", () => {
    const [title, intro] = ndaBlocks();

    expect(title).toMatchObject({ style: "heading" });
    expect(words(title)).toBe("Mutual Non-Disclosure Agreement");
    expect(words(intro)).toMatch(/^This Mutual Non-Disclosure Agreement \(the “MNDA”\) consists of/);
    expect(intro.text).toContainEqual({ text: "Cover Page", bold: true });
    expect(intro.text).toContainEqual({
      text: "commonpaper.com/standards/mutual-nda/1.0",
      link: "https://commonpaper.com/standards/mutual-nda/1.0",
      decoration: "underline",
    });
  });

  test("leaves a line to write on where a value is missing", () => {
    const blocks = ndaBlocks().map(words);

    expect(blocks).toContain("Governing Law: ______________");
    expect(blocks).toContain("Jurisdiction: ______________");
    expect(blocks.join(" ")).not.toContain("City or county and state");
  });

  test("shows which options are ticked, without the words meant for screen readers", () => {
    const blocks = ndaBlocks({ ...defaultNdaForm, mndaTerm: "until-terminated" }).map(words);

    expect(blocks).toContain("[   ]  Expires 1 year(s) from Effective Date.");
    expect(blocks).toContain(
      "[X]  Continues until terminated in accordance with the terms of the MNDA.",
    );
    expect(blocks.join(" ")).not.toContain("elected:");
  });

  test("lays out the signature table with room to sign", () => {
    const form = { ...defaultNdaForm, party1: { ...defaultNdaForm.party1, company: "Acme Inc." } };
    const table = ndaBlocks(form).find((block) => block.table)!.table!;
    const rows = table.body.map((row) => row.map(words));

    expect(rows[0]).toEqual(["", "Party 1", "Party 2"]);
    expect(rows[1]).toEqual(["Signature", "", ""]);
    expect(rows[4]).toEqual(["Company", "Acme Inc.", ""]);
    expect(rows[5][0]).toBe("Notice Address\nUse either email or postal address");
    const heights = (table as unknown as { heights: (row: number) => number | string }).heights;
    expect([heights(1), heights(2)]).toEqual([40, "auto"]);
  });

  test("starts the Standard Terms on a new page and numbers the Mutual NDA's clauses", () => {
    const blocks = ndaBlocks();
    const heading = blocks.find((block) => words(block) === "Standard Terms")!;
    const clauses = blocks.find((block) => block.ol)!.ol!;

    expect(heading).toMatchObject({ style: "heading", pageBreak: "before" });
    expect(blocks.filter((block) => block.pageBreak)).toHaveLength(1);
    expect(clauses.map(words)).toEqual([
      "Introduction. This MNDA covers the Purpose.",
      "Term. It ends when it expires.",
    ]);
    expect(clauses[1].text).toContainEqual({ text: "ends", bold: true });
  });

  test("sets out the clauses of the other documents by their depth", () => {
    const blocks = generatedBlocks();
    const terms = blocks.slice(blocks.findIndex((block) => words(block) === "Standard Terms") + 1);

    expect(terms.slice(0, 4).map((block) => [words(block), block.style, block.margin?.[0]])).toEqual([
      ["1. Pilot Access", "section", 0],
      ["1.1 Access. During the Pilot Period (90 days), ______________ may use it:", "block", 0],
      ["(a) for evaluation; and", "block", 18],
      ["(i) see https://commonpaper.com/pilot.", "block", 36],
    ]);
    expect(words(blocks[0])).toBe("Pilot Agreement");
  });

  test("warns at the foot of every page that the agreement is a draft", () => {
    render(<article />);
    const { footer, pageMargins } = pdfDefinition(screen.getByRole("article"));

    type Foot = { margin: number[]; columns: { text: string; noWrap?: boolean }[] };
    const foot = (footer as unknown as (page: number, pages: number) => Foot)(2, 7);

    expect(foot.columns.map((column) => column.text)).toEqual([DISCLAIMER, "Page 2 of 7"]);
    // Within the bottom margin, clear of the agreement's text.
    expect(foot.margin).toEqual([pageMargins, 16, pageMargins, 0]);
    expect(pageMargins).toBe(64);
  });

  test("uses a US Letter page", () => {
    render(<article />);

    expect(pdfDefinition(screen.getByRole("article"))).toMatchObject({
      pageSize: "LETTER",
      content: [] satisfies Content[],
    });
  });
});

describe("downloadPdf", () => {
  test("saves the agreement as a PDF file with the given name", async () => {
    render(
      <article>
        <h2>Pilot Agreement</h2>
      </article>,
    );

    await downloadPdf(screen.getByRole("article"), 'Pilot Agreement - Acme "Inc." / Globex: LLC ');

    expect(pdfMake.createPdf).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ content: [{ text: [{ text: "Pilot Agreement" }], style: "heading" }] }),
      undefined,
      undefined,
      { "Roboto-Regular.ttf": "font" },
    );
    expect(pdfMake.download).toHaveBeenCalledExactlyOnceWith(
      "Pilot Agreement - Acme Inc.  Globex LLC.pdf",
    );
  });
});
