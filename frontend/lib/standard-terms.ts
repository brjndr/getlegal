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

const CLAUSE = /^(\d+)\.\s+\*\*(.+?)\*\*\.\s+(.+)$/;
const HEADING = /^#+\s/;
const LICENSE_NOTICE = /creativecommons\.org\/licenses/;
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

/**
 * Splits the Standard Terms into numbered clauses. Throws on any line it can't
 * place, so agreement text is never left out without anyone noticing.
 */
export function parseStandardTerms(markdown: string): Clause[] {
  const clauses: Clause[] = [];
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || HEADING.test(line) || LICENSE_NOTICE.test(line)) continue;
    const match = CLAUSE.exec(line);
    if (!match) {
      throw new Error(`Unrecognized line in the Standard Terms: "${line.slice(0, 60)}"`);
    }
    if (Number(match[1]) !== clauses.length + 1) {
      throw new Error(
        `Expected clause ${clauses.length + 1} in the Standard Terms but found clause ${match[1]}`,
      );
    }
    clauses.push({ title: match[2], body: parseBody(match[3]) });
  }
  if (clauses.length === 0) {
    throw new Error("No clauses found in the Standard Terms");
  }
  return clauses;
}

/** Reads the Common Paper Mutual NDA Standard Terms from the repo's templates. */
export async function loadStandardTerms(): Promise<Clause[]> {
  const markdown = await readFile(STANDARD_TERMS_PATH, "utf8");
  try {
    return parseStandardTerms(markdown);
  } catch (error) {
    throw new Error(`Could not read ${STANDARD_TERMS_PATH}`, { cause: error });
  }
}
