export type Party = {
  name: string;
  title: string;
  company: string;
  noticeAddress: string;
};

export type NdaForm = {
  purpose: string;
  /** ISO date (yyyy-mm-dd). `null` means "today", resolved in the browser. */
  effectiveDate: string | null;
  mndaTerm: "expires" | "until-terminated";
  mndaTermYears: string;
  confidentialityTerm: "years" | "perpetuity";
  confidentialityYears: string;
  governingLaw: string;
  jurisdiction: string;
  modifications: string;
  party1: Party;
  party2: Party;
};

export type PartyKey = "party1" | "party2";

/** Some of the fields of an NdaForm, with new values. */
export type NdaChanges = Partial<Omit<NdaForm, PartyKey>> & {
  [key in PartyKey]?: Partial<Party>;
};

const emptyParty: Party = { name: "", title: "", company: "", noticeAddress: "" };

export const defaultNdaForm: NdaForm = {
  purpose:
    "Evaluating whether to enter into a business relationship with the other party.",
  effectiveDate: null,
  mndaTerm: "expires",
  mndaTermYears: "1",
  confidentialityTerm: "years",
  confidentialityYears: "1",
  governingLaw: "",
  jurisdiction: "",
  modifications: "",
  party1: emptyParty,
  party2: emptyParty,
};

export function todayIso(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** "2026-10-04" -> "October 4, 2026". Returns "" for anything that isn't a date with a four-digit year. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
  // A date input reports "0002-10-04" while the year is being typed, and Date reads years below 100 as 19xx.
  if (Number(year) < 1000) return "";
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** "1" -> "1 year", "3" -> "3 years". Returns "" unless it's a whole number of at least 1. */
export function formatYears(years: string): string {
  if (!/^\d+$/.test(years.trim())) return "";
  const count = Number(years);
  if (count < 1) return "";
  return `${count} ${count === 1 ? "year" : "years"}`;
}

const TEXT_FIELDS = ["purpose", "governingLaw", "jurisdiction", "modifications"] as const;
const PARTY_FIELDS = ["name", "title", "company", "noticeAddress"] as const;

function isDate(value: unknown): value is string {
  if (typeof value !== "string" || formatDate(value) === "") return false;
  // Date rolls an impossible day over into the next month.
  const [, month, day] = value.split("-").map(Number);
  const date = new Date(`${value}T00:00`);
  return date.getMonth() === month - 1 && date.getDate() === day;
}

const isYears = (value: unknown): value is string =>
  typeof value === "string" && formatYears(value) !== "";

/**
 * Returns the form with the changes applied. The changes come from a language
 * model, so any value that would not make sense in the form is left out.
 */
export function applyChanges(form: NdaForm, changes: NdaChanges): NdaForm {
  const next = { ...form };
  for (const field of TEXT_FIELDS) {
    if (typeof changes[field] === "string") next[field] = changes[field];
  }
  if (isDate(changes.effectiveDate)) next.effectiveDate = changes.effectiveDate;
  if (changes.mndaTerm === "expires" || changes.mndaTerm === "until-terminated") {
    next.mndaTerm = changes.mndaTerm;
  }
  if (isYears(changes.mndaTermYears)) next.mndaTermYears = changes.mndaTermYears;
  if (changes.confidentialityTerm === "years" || changes.confidentialityTerm === "perpetuity") {
    next.confidentialityTerm = changes.confidentialityTerm;
  }
  if (isYears(changes.confidentialityYears)) {
    next.confidentialityYears = changes.confidentialityYears;
  }
  for (const key of ["party1", "party2"] as const) {
    const party = { ...form[key] };
    for (const field of PARTY_FIELDS) {
      const value = changes[key]?.[field];
      if (typeof value === "string") party[field] = value;
    }
    next[key] = party;
  }
  return next;
}
