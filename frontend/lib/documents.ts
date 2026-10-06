import { formatDate } from "@/lib/nda";

export const NDA = "mutual-nda";
/** The value recorded for an optional term the user does not want. */
export const SKIPPED = "None";

export type PartySpec = {
  key: string;
  /** The party's role, which is also its name in the template, e.g. "Provider". */
  label: string;
};

export type FieldSpec = {
  key: string;
  label: string;
  kind?: "text" | "date";
  optional?: boolean;
  /** The template variables this field fills. Its label, unless given. */
  variables?: string[];
};

/** A document the product can draft, as described in documents/specs.json. */
export type DocumentSpec = {
  id: string;
  name: string;
  template: string;
  /** "nda" is the Mutual NDA, which has its own form and its own page. */
  engine?: "nda";
  parties?: PartySpec[];
  fields?: FieldSpec[];
  /** Template variables left as the defined terms they are. */
  terms?: string[];
};

/** A document's field values by key. A missing or blank value has not been given yet. */
export type Values = Record<string, string>;

export type PartyDetail = "Company" | "Name" | "Title" | "NoticeAddress";

export function partyValue(values: Values, party: PartySpec, detail: PartyDetail): string {
  return values[`${party.key}${detail}`]?.trim() ?? "";
}

/** A field's value as it reads in the document. */
export function fieldValue(values: Values, field: FieldSpec): string {
  const value = values[field.key]?.trim() ?? "";
  return field.kind === "date" ? formatDate(value) : value;
}

export type Resolved =
  /** A party's role, which its company's name replaces. `value` is "" until the user gives it. */
  | { type: "party"; value: string; placeholder: string; suffix: string }
  /** A term whose value is shown beside it. `value` is "" until the user gives it. */
  | { type: "field"; value: string; placeholder: string }
  /** The variable stays as the term it names, with nothing beside it. */
  | { type: "term" }
  | { type: "unknown" };

/** What to show where the template refers to a variable. */
export function resolveVariable(spec: DocumentSpec, values: Values, name: string): Resolved {
  const possessive = /^(.+?)(['’]s)$/.exec(name);
  const party = spec.parties?.find((party) => party.label === (possessive?.[1] ?? name));
  if (party) {
    return {
      type: "party",
      value: partyValue(values, party, "Company"),
      placeholder: party.label,
      suffix: possessive ? "’s" : "",
    };
  }
  const field = spec.fields?.find((field) => (field.variables ?? [field.label]).includes(name));
  if (field) {
    const value = fieldValue(values, field);
    // A term the user left out is defined as "none" by the agreement itself.
    if (value === SKIPPED) return { type: "term" };
    return { type: "field", value, placeholder: field.label };
  }
  return spec.terms?.includes(name) ? { type: "term" } : { type: "unknown" };
}
