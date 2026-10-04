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

/** "2026-10-04" -> "October 4, 2026". Returns "" for anything that isn't a date. */
export function formatDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return "";
  const [, year, month, day] = match;
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
