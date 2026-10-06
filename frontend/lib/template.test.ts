// @vitest-environment node
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { resolveVariable, type DocumentSpec } from "@/lib/documents";
import { loadSpecs, loadTemplates } from "@/lib/load-documents";
import { parseTemplate, type Clause, type Inline, type Template } from "@/lib/template";

const text = (inlines: Inline[]): string =>
  inlines
    .map((inline) =>
      inline.type === "bold"
        ? text(inline.children)
        : inline.type === "variable"
          ? inline.name
          : inline.text,
    )
    .join("");

const variables = (inlines: Inline[]): string[] =>
  inlines.flatMap((inline) =>
    inline.type === "bold" ? variables(inline.children) : inline.type === "variable" ? [inline.name] : [],
  );

const flatten = (clauses: Clause[]): Clause[] =>
  clauses.flatMap((clause) => [clause, ...flatten(clause.children)]);

describe("parseTemplate", () => {
  const template = parseTemplate(
    [
      "# Pilot Agreement",
      "",
      '1. <span class="header_2" id="1">Pilot Access</span>',
      '    1. <span class="header_3" id="1.1">Access and Use.</span>  During the <span class="orderform_link">Pilot Period</span>, <span class="orderform_link" id="1.1.a">Customer</span> may use the Product.',
      '    2. <span class="header_3">Limits.</span>  <span id="1.2"></span>Customer will not:',
      "        a. sell the Product; or",
      "        b. copy it, unless:",
      "            i. the law allows it; and",
      "            ii. Provider agrees.",
      "2. Definitions",
      '    1. <span id="2.1">**"Affiliate"**</span> means an entity under common control.',
      '    2. **Each party’s liability is capped at the <span class="keyterms_link">General Cap Amount</span>.**',
      '    3. See <https://commonpaper.com/standards/pilot-agreement/1.1> or [the terms](commonpaper.com/terms).',
    ].join("\n"),
  );

  test("reads the title and the numbered clauses", () => {
    expect(template.title).toBe("Pilot Agreement");
    expect(template.clauses.map((clause) => [clause.label, clause.title])).toEqual([
      ["1.", "Pilot Access"],
      ["2.", undefined],
    ]);
    expect(text(template.clauses[1].body)).toBe("Definitions");
  });

  test("nests clauses by their indentation and labels them as they are cited", () => {
    const labels = flatten(template.clauses).map((clause) => clause.label);

    expect(labels).toEqual(["1.", "1.1", "1.2", "(a)", "(b)", "(i)", "(ii)", "2.", "2.1", "2.2", "2.3"]);
    expect(template.clauses[0].children[1].children[1].children).toHaveLength(2);
  });

  test("separates a clause's title from its text and marks the variables", () => {
    const [access, limits] = template.clauses[0].children;

    expect(access.title).toBe("Access and Use.");
    expect(access.body).toEqual([
      { type: "text", text: "During the " },
      { type: "variable", name: "Pilot Period" },
      { type: "text", text: ", " },
      { type: "variable", name: "Customer" },
      { type: "text", text: " may use the Product." },
    ]);
    // A span with only an id is an anchor, not text.
    expect(limits.body).toEqual([{ type: "text", text: "Customer will not:" }]);
  });

  test("reads bold text, including bold text with a variable inside", () => {
    const [affiliate, cap] = template.clauses[1].children;

    expect(affiliate.body).toEqual([
      { type: "bold", children: [{ type: "text", text: '"Affiliate"' }] },
      { type: "text", text: " means an entity under common control." },
    ]);
    expect(cap.body).toEqual([
      {
        type: "bold",
        children: [
          { type: "text", text: "Each party’s liability is capped at the " },
          { type: "variable", name: "General Cap Amount" },
          { type: "text", text: "." },
        ],
      },
    ]);
  });

  test("reads links, completing an address that has no scheme", () => {
    expect(template.clauses[1].children[2].body).toEqual([
      { type: "text", text: "See " },
      {
        type: "link",
        text: "https://commonpaper.com/standards/pilot-agreement/1.1",
        href: "https://commonpaper.com/standards/pilot-agreement/1.1",
      },
      { type: "text", text: " or " },
      { type: "link", text: "the terms", href: "https://commonpaper.com/terms" },
      { type: "text", text: "." },
    ]);
  });

  test.each([
    ["a line that is not a clause", "# T\n1. One\nSome stray text"],
    ["a clause indented too far", "# T\n1. One\n        a. Too deep"],
    ["indentation that is not a level", "# T\n1. One\n  1. Off"],
    ["markup it does not know", "# T\n1. One <em>two</em>"],
    ["bold text that never ends", "# T\n1. One **two"],
    ["no clauses", "# T"],
    ["no title", "1. One"],
  ])("refuses %s", (_, markdown) => {
    expect(() => parseTemplate(markdown)).toThrow();
  });
});

describe("the agreements in templates/", () => {
  let specs: DocumentSpec[];
  let templates: Record<string, Template>;

  beforeAll(async () => {
    specs = (await loadSpecs()).filter((spec) => !spec.engine);
    templates = await loadTemplates();
  });

  test("there is one for every document that is drafted from its spec", () => {
    expect(specs).toHaveLength(10);
    expect(Object.keys(templates)).toEqual(specs.map((spec) => spec.id));
    for (const spec of specs) expect(templates[spec.id].title).toBe(spec.name);
  });

  test("are read word for word", async () => {
    for (const spec of specs) {
      const markdown = await readFile(path.join(process.cwd(), "..", "templates", spec.template), "utf8");
      const expected = markdown
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.startsWith("#"))
        .map((line) =>
          line
            .replace(/^\s*(\d+|[a-z]+)\.\s+/, "")
            .replace(/<\/?span[^>]*>/g, "")
            .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
            .replace(/<(https?:[^>]+)>/g, "$1")
            .replaceAll("**", "")
            .replace(/\s+/g, " ")
            .trim(),
        );

      const read = flatten(templates[spec.id].clauses).map((clause) =>
        `${clause.title ?? ""} ${text(clause.body)}`.replace(/\s+/g, " ").trim(),
      );

      expect(read, spec.id).toEqual(expected);
    }
  });

  test("refer only to variables their document knows how to show", () => {
    for (const spec of specs) {
      const names = new Set(
        flatten(templates[spec.id].clauses).flatMap((clause) => variables(clause.body)),
      );
      const unknown = [...names].filter(
        (name) => resolveVariable(spec, {}, name).type === "unknown",
      );

      expect(names.size, spec.id).toBeGreaterThan(4);
      expect(unknown, spec.id).toEqual([]);
    }
  });
});
