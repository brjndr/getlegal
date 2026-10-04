// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { loadStandardTerms, parseStandardTerms, type Clause } from "@/lib/standard-terms";

const TEMPLATE_PATH = path.join(process.cwd(), "..", "templates", "Mutual-NDA.md");

function clauseText(clause: Clause): string {
  return `${clause.title}. ${clause.body.map((segment) => segment.text).join("")}`;
}

/** The numbered clauses of the template as plain text, derived without the parser under test. */
async function templateClauses(): Promise<string[]> {
  const markdown = await readFile(TEMPLATE_PATH, "utf8");
  return markdown
    .split(/\r?\n/)
    .filter((line) => /^\d+\./.test(line))
    .map((line) =>
      line
        .replace(/^\d+\.\s+/, "")
        .replace(/<\/?span[^>]*>/g, "")
        .replaceAll("**", ""),
    );
}

describe("parseStandardTerms", () => {
  const first = "1. **First**. One.";
  const second = "2. **Second**. Two.";

  test("skips headings, blank lines and the license notice", () => {
    const markdown = [
      "# Standard Terms",
      "",
      first,
      "",
      second,
      "",
      "Free to use under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).",
    ].join("\r\n");

    expect(parseStandardTerms(markdown)).toEqual([
      { title: "First", body: [{ type: "text", text: "One." }] },
      { title: "Second", body: [{ type: "text", text: "Two." }] },
    ]);
  });

  test("rejects a clause that runs onto a second line", () => {
    expect(() => parseStandardTerms(`${first}\nMore of clause one.\n${second}`)).toThrow(
      /Unrecognized line.*More of clause one/,
    );
  });

  test("rejects a clause whose heading is not in the expected format", () => {
    expect(() => parseStandardTerms(`${first}\n2. Second. Two.`)).toThrow(/Unrecognized line/);
  });

  test("rejects a missing or misnumbered clause", () => {
    expect(() => parseStandardTerms(`${first}\n3. **Third**. Three.`)).toThrow(
      /Expected clause 2 .* found clause 3/,
    );
  });

  test("rejects a document with no clauses", () => {
    expect(() => parseStandardTerms("# Standard Terms\n")).toThrow(/No clauses found/);
  });
});

describe("loadStandardTerms", () => {
  let clauses: Clause[];

  beforeAll(async () => {
    clauses = await loadStandardTerms();
  });

  test("finds every clause of the Mutual NDA in order", () => {
    expect(clauses.map((clause) => clause.title)).toEqual([
      "Introduction",
      "Use and Protection of Confidential Information",
      "Exceptions",
      "Disclosures Required by Law",
      "Term and Termination",
      "Return or Destruction of Confidential Information",
      "Proprietary Rights",
      "Disclaimer",
      "Governing Law and Jurisdiction",
      "Equitable Relief",
      "General",
    ]);
  });

  test("reproduces the template word for word", async () => {
    expect(clauses.map(clauseText)).toEqual(await templateClauses());
  });

  test("leaves no markup in the text", () => {
    for (const clause of clauses) {
      for (const segment of clause.body) {
        expect(segment.text).not.toMatch(/\*\*|<|>/);
        expect(segment.text).not.toBe("");
      }
    }
  });

  test("marks the terms that are defined on the Cover Page", () => {
    const coverPageTerms = new Set(
      clauses.flatMap((clause) =>
        clause.body
          .filter((segment) => segment.type === "coverPageTerm")
          .map((segment) => segment.text),
      ),
    );
    expect([...coverPageTerms].sort()).toEqual([
      "Effective Date",
      "Governing Law",
      "Jurisdiction",
      "MNDA Term",
      "Purpose",
      "Term of Confidentiality",
    ]);
  });

  test("marks the defined terms as bold", () => {
    const introduction = clauses[0].body
      .filter((segment) => segment.type === "bold")
      .map((segment) => segment.text);
    expect(introduction).toEqual([
      "MNDA",
      "Disclosing Party",
      "Receiving Party",
      "Confidential Information",
      "Cover Page",
    ]);
  });
});
