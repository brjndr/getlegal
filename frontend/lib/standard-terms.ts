import { readFile } from "node:fs/promises";
import path from "node:path";

export type TermSegment =
  | { type: "text"; text: string }
  | { type: "bold"; text: string }
  /** A term defined on the Cover Page, e.g. "Purpose" or "Governing Law". */
  | { type: "coverPageTerm"; text: string };

export type Clause = {
  title: string;
  body: TermSegment[];
};

// The templates live at the repo root so there is one source of truth for the agreement text.
const STANDARD_TERMS_PATH = path.join(
  process.cwd(),
  "..",
  "templates",
  "Mutual-NDA.md",
);

const CLAUSE = /^\d+\.\s+\*\*(.+?)\*\*\.\s+(.+)$/;
const INLINE = /<span class="coverpage_link">(.+?)<\/span>|\*\*(.+?)\*\*/g;

function parseBody(body: string): TermSegment[] {
  const segments: TermSegment[] = [];
  let cursor = 0;
  for (const match of body.matchAll(INLINE)) {
    if (match.index > cursor) {
      segments.push({ type: "text", text: body.slice(cursor, match.index) });
    }
    segments.push(
      match[1] !== undefined
        ? { type: "coverPageTerm", text: match[1] }
        : { type: "bold", text: match[2] },
    );
    cursor = match.index + match[0].length;
  }
  if (cursor < body.length) {
    segments.push({ type: "text", text: body.slice(cursor) });
  }
  return segments;
}

/** Reads the Common Paper Mutual NDA Standard Terms and splits them into numbered clauses. */
export async function loadStandardTerms(): Promise<Clause[]> {
  const markdown = await readFile(STANDARD_TERMS_PATH, "utf8");
  const clauses: Clause[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const match = CLAUSE.exec(line.trim());
    if (match) {
      clauses.push({ title: match[1], body: parseBody(match[2]) });
    }
  }
  if (clauses.length === 0) {
    throw new Error(`No clauses found in ${STANDARD_TERMS_PATH}`);
  }
  return clauses;
}
