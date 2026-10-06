export type Inline =
  | { type: "text"; text: string }
  | { type: "bold"; children: Inline[] }
  /** A term the Cover Page defines, e.g. "Governing Law" or "Customer's". */
  | { type: "variable"; name: string }
  | { type: "link"; text: string; href: string };

export type Clause = {
  /** The number or letter shown beside the clause, e.g. "1.", "1.2", "(a)" or "(i)". */
  label: string;
  title?: string;
  body: Inline[];
  children: Clause[];
};

export type Template = {
  title: string;
  clauses: Clause[];
};

const ITEM = /^( *)(\d+|[a-z]+)\.\s+(.*)$/;
const HEADING = /^#\s+(.+)$/;
const TITLE = /^<span class="header_\d"[^>]*>(.*?)<\/span>\s*/;
const VARIABLE = /<span class="[a-z]+_link"[^>]*>([^<]+)<\/span>/g;
const OTHER_SPAN = /<\/?span[^>]*>/g;
// Stands in for a variable while the rest of the line is read: \u0001name\u0001.
const TOKEN = /\u0001([^\u0001]+)\u0001|<(https?:\/\/[^>\s]+)>|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseText(text: string): Inline[] {
  const inlines: Inline[] = [];
  let cursor = 0;
  const addText = (end: number) => {
    if (end > cursor) inlines.push({ type: "text", text: text.slice(cursor, end) });
  };
  for (const match of text.matchAll(TOKEN)) {
    addText(match.index);
    const [whole, variable, address, linkText, linkTarget] = match;
    if (variable !== undefined) {
      inlines.push({ type: "variable", name: variable });
    } else {
      const href = address ?? linkTarget;
      // One template writes a link's address without its scheme.
      inlines.push({
        type: "link",
        text: linkText ?? address,
        href: /^https?:\/\//.test(href) ? href : `https://${href}`,
      });
    }
    cursor = match.index + whole.length;
  }
  addText(text.length);
  return inlines;
}

function parseInline(source: string): Inline[] {
  // Spans that only carry an id are anchors for links within the original web page.
  const text = source.replace(VARIABLE, "\u0001$1\u0001").replace(OTHER_SPAN, "");
  if (/<\/?[a-z]/i.test(text.replace(/<https?:\/\/[^>\s]+>/g, ""))) {
    throw new Error(`Unrecognized markup: "${source.slice(0, 80)}"`);
  }
  const parts = text.split("**");
  if (parts.length % 2 === 0) {
    throw new Error(`Unfinished bold text: "${source.slice(0, 80)}"`);
  }
  return parts.flatMap((part, index): Inline[] => {
    const children = parseText(part);
    if (index % 2 === 0) return children;
    return children.length > 0 ? [{ type: "bold", children }] : [];
  });
}

function label(depth: number, marker: string, parent: string): string {
  if (depth === 0) return `${marker}.`;
  if (depth === 1) return `${parent}${marker}`;
  return `(${marker})`;
}

/**
 * Reads a Common Paper agreement: numbered clauses nested by indentation, with
 * the terms a Cover Page defines marked up as variables. Throws on any line it
 * can't place, so agreement text is never left out without anyone noticing.
 */
export function parseTemplate(markdown: string): Template {
  let title = "";
  const clauses: Clause[] = [];
  // The clause each deeper line belongs to, by depth.
  const open: Clause[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const heading = HEADING.exec(line);
    if (heading && !title) {
      title = heading[1].trim();
      continue;
    }
    const item = ITEM.exec(line);
    if (!item) {
      throw new Error(`Unrecognized line: "${line.slice(0, 80)}"`);
    }
    const depth = item[1].length / 4;
    if (!Number.isInteger(depth) || depth > open.length) {
      throw new Error(`Unexpected indentation: "${line.slice(0, 80)}"`);
    }
    let rest = item[3];
    let clauseTitle: string | undefined;
    const titled = TITLE.exec(rest);
    if (titled) {
      clauseTitle = titled[1].replace(OTHER_SPAN, "").trim();
      rest = rest.slice(titled[0].length);
      // One title's full stop was left outside its span.
      if (rest.startsWith(".")) {
        clauseTitle += ".";
        rest = rest.slice(1);
      }
    }
    const clause: Clause = {
      label: label(depth, item[2], open[0]?.label ?? ""),
      ...(clauseTitle ? { title: clauseTitle } : {}),
      body: parseInline(rest.trim()),
      children: [],
    };
    (depth === 0 ? clauses : open[depth - 1].children).push(clause);
    open.length = depth;
    open.push(clause);
  }
  if (!title || clauses.length === 0) {
    throw new Error("The template has no title or no clauses");
  }
  return { title, clauses };
}
