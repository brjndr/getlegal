import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";

type Run = ContentText & { text: string };

const BLANK = "______________";
const INDENT_POINTS = 18;

/** The text inside an element, as runs that keep its bold text and links. */
function runs(node: Node, style: Partial<Run> = {}): Run[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const keepsLines = node.parentElement?.closest(".whitespace-pre-wrap");
    const text = keepsLines ? (node.textContent ?? "") : (node.textContent ?? "").replace(/\s+/g, " ");
    return text ? [{ ...style, text }] : [];
  }
  if (!(node instanceof HTMLElement) || node.classList.contains("sr-only")) return [];
  // A value the user has not given yet is a line to write on.
  if (node.hasAttribute("data-blank")) return [{ ...style, text: BLANK }];
  if (node.hasAttribute("data-checkbox")) {
    return [{ ...style, text: node.textContent?.trim() ? "[X]  " : "[   ]  " }];
  }
  const inner = { ...style };
  if (node.tagName === "STRONG" || node.tagName === "TH") inner.bold = true;
  if (node instanceof HTMLAnchorElement) {
    inner.link = node.href;
    inner.decoration = "underline";
  }
  const text = [...node.childNodes].flatMap((child) => runs(child, inner));
  // A note set on its own line under a label.
  return node.tagName === "SPAN" && node.classList.contains("block")
    ? [{ ...style, text: "\n" }, ...text]
    : text;
}

/** Tidies the spaces that the page's layout leaves at the ends of a paragraph. */
function paragraph(element: HTMLElement): Run[] {
  const text = runs(element);
  if (text.length > 0) {
    text[0] = { ...text[0], text: text[0].text.trimStart() };
    text[text.length - 1] = { ...text.at(-1)!, text: text.at(-1)!.text.trimEnd() };
  }
  return text.filter((run) => run.text);
}

function table(element: HTMLTableElement): Content {
  const rows = [...element.rows];
  const columns = Math.max(...rows.map((row) => row.cells.length));
  return {
    style: "block",
    table: {
      widths: ["25%", ...Array(columns - 1).fill("*")],
      // Room to sign in a row that has nothing printed in it.
      heights: (row: number) => (rows[row].textContent?.trim() === "Signature" ? 40 : "auto"),
      body: rows.map((row) => [...row.cells].map((cell) => ({ text: paragraph(cell) }))),
    },
    layout: { hLineColor: () => "#c9cfcb", vLineColor: () => "#c9cfcb" },
  };
}

function blocks(element: Element): Content[] {
  return [...element.children].flatMap((child): Content[] => {
    if (!(child instanceof HTMLElement) || child.classList.contains("sr-only")) return [];
    const content = block(child);
    // The first block of a section that starts a new page carries the break.
    if (child.hasAttribute("data-page-break") && content.length > 0) {
      content[0] = { ...(content[0] as object), pageBreak: "before" } as Content;
    }
    return content;
  });
}

function block(element: HTMLElement): Content[] {
  switch (element.tagName) {
    case "H2":
      return [{ text: paragraph(element), style: "heading" }];
    case "H3":
      return [{ text: paragraph(element), style: "subheading" }];
    case "P":
    case "LI": {
      // How deep a clause sits: "0" for a section's heading, then its clauses and their items.
      const depth = element.dataset.indent;
      const text = paragraph(element);
      if (text.length === 0) return [];
      return [
        {
          text,
          style: depth === "0" ? "section" : "block",
          margin: [Math.max(Number(depth ?? 0) - 1, 0) * INDENT_POINTS, 0, 0, 6],
        },
      ];
    }
    case "OL":
      return [{ ol: [...element.children].map((item) => ({ text: paragraph(item as HTMLElement) })), style: "block" }];
    case "TABLE":
      return [table(element as HTMLTableElement)];
    default:
      return blocks(element);
  }
}

/** Lays out an agreement shown on the page as a PDF, with the same words in the same order. */
export function pdfDefinition(article: HTMLElement): TDocumentDefinitions {
  return {
    pageSize: "LETTER",
    pageMargins: 64,
    content: blocks(article),
    defaultStyle: { fontSize: 10.5, lineHeight: 1.3 },
    styles: {
      heading: { fontSize: 20, bold: true, margin: [0, 0, 0, 12] },
      subheading: { fontSize: 11.5, bold: true, margin: [0, 12, 0, 4] },
      section: { bold: true, fontSize: 11.5 },
      block: { margin: [0, 0, 0, 6] },
    },
  };
}

/** Saves the agreement as a PDF file, in the browser. */
export async function downloadPdf(article: HTMLElement, name: string): Promise<void> {
  // Loaded only now: the PDF library and its fonts are far larger than the rest of the page.
  const [{ default: pdfMake }, { default: fonts }] = await Promise.all([
    import("pdfmake/build/pdfmake"),
    import("pdfmake/build/vfs_fonts"),
  ]);
  const fileName = `${name.replace(/[\\/:*?"<>|]/g, "").trim()}.pdf`;
  pdfMake.createPdf(pdfDefinition(article), undefined, undefined, fonts).download(fileName);
}
