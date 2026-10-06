import { readFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentSpec } from "@/lib/documents";
import { parseTemplate, type Template } from "@/lib/template";

// Shared with the backend, which asks the questions these documents need.
const SPECS_PATH = path.join(process.cwd(), "..", "documents", "specs.json");
const TEMPLATES_DIR = path.join(process.cwd(), "..", "templates");

/** Reads the documents the product can draft. Runs at build time only. */
export async function loadSpecs(): Promise<DocumentSpec[]> {
  const specs = JSON.parse(await readFile(SPECS_PATH, "utf8"));
  return specs.documents;
}

/** Reads the agreement text of every document drafted from its spec, by document id. */
export async function loadTemplates(): Promise<Record<string, Template>> {
  const templates: Record<string, Template> = {};
  for (const spec of await loadSpecs()) {
    if (spec.engine) continue;
    const file = path.join(TEMPLATES_DIR, spec.template);
    try {
      templates[spec.id] = parseTemplate(await readFile(file, "utf8"));
    } catch (error) {
      throw new Error(`Could not read ${file}`, { cause: error });
    }
  }
  return templates;
}
