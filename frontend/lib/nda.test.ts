import { afterEach, describe, expect, test, vi } from "vitest";
import {
  applyChanges,
  defaultNdaForm,
  formatDate,
  formatYears,
  todayIso,
  type NdaChanges,
} from "@/lib/nda";

describe("formatDate", () => {
  test("writes an ISO date out in full", () => {
    expect(formatDate("2026-10-04")).toBe("October 4, 2026");
  });

  test("keeps the calendar day whatever the timezone", () => {
    // Parsing "2026-01-01" as UTC would show December 31 west of Greenwich.
    expect(formatDate("2026-01-01")).toBe("January 1, 2026");
    expect(formatDate("2026-12-31")).toBe("December 31, 2026");
  });

  test("handles a leap day", () => {
    expect(formatDate("2028-02-29")).toBe("February 29, 2028");
  });

  test.each(["0002-10-04", "0026-10-04", "0202-10-04"])(
    "returns an empty string while the year is still being typed (%j)",
    (value) => {
      expect(formatDate(value)).toBe("");
    },
  );

  test.each(["", "today", "2026-10", "10/04/2026", "2026-10-04T00:00:00Z", " 2026-10-04"])(
    "returns an empty string for %j",
    (value) => {
      expect(formatDate(value)).toBe("");
    },
  );
});

describe("formatYears", () => {
  test("uses the singular for one year", () => {
    expect(formatYears("1")).toBe("1 year");
  });

  test("uses the plural for more than one year", () => {
    expect(formatYears("2")).toBe("2 years");
    expect(formatYears("10")).toBe("10 years");
  });

  test("ignores surrounding whitespace and leading zeros", () => {
    expect(formatYears(" 3 ")).toBe("3 years");
    expect(formatYears("01")).toBe("1 year");
  });

  test.each(["", " ", "0", "-1", "1.5", "one", "2 years", "1e3"])(
    "returns an empty string for %j",
    (value) => {
      expect(formatYears(value)).toBe("");
    },
  );
});

describe("todayIso", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test("pads the month and day", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 0, 5, 12));
    expect(todayIso()).toBe("2026-01-05");
  });

  test("uses the local date, not the UTC one", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 31, 23, 59));
    expect(todayIso()).toBe("2026-12-31");
  });

  test("round-trips through formatDate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 9));
    expect(formatDate(todayIso())).toBe("October 4, 2026");
  });
});

describe("defaultNdaForm", () => {
  test("starts with terms that render as a complete sentence", () => {
    expect(formatYears(defaultNdaForm.mndaTermYears)).toBe("1 year");
    expect(formatYears(defaultNdaForm.confidentialityYears)).toBe("1 year");
  });

  test("leaves the effective date to be resolved as today", () => {
    expect(defaultNdaForm.effectiveDate).toBeNull();
  });
});

describe("applyChanges", () => {
  test("changes only the fields it is given", () => {
    const form = applyChanges(defaultNdaForm, {
      governingLaw: "Delaware",
      effectiveDate: "2027-01-15",
      mndaTerm: "until-terminated",
      confidentialityYears: "5",
    });

    expect(form).toEqual({
      ...defaultNdaForm,
      governingLaw: "Delaware",
      effectiveDate: "2027-01-15",
      mndaTerm: "until-terminated",
      confidentialityYears: "5",
    });
  });

  test("changes part of a party without losing the rest", () => {
    const first = applyChanges(defaultNdaForm, {
      party1: { company: "Acme Inc.", name: "Ada Lovelace" },
    });

    const second = applyChanges(first, {
      party1: { title: "CEO" },
      party2: { company: "Globex LLC" },
    });

    expect(second.party1).toEqual({
      company: "Acme Inc.",
      name: "Ada Lovelace",
      title: "CEO",
      noticeAddress: "",
    });
    expect(second.party2.company).toBe("Globex LLC");
  });

  test("can empty a text field", () => {
    const form = applyChanges(
      { ...defaultNdaForm, modifications: "Section 7 does not apply." },
      { modifications: "" },
    );

    expect(form.modifications).toBe("");
  });

  test("leaves the original form untouched", () => {
    applyChanges(defaultNdaForm, { governingLaw: "Delaware", party1: { company: "Acme Inc." } });

    expect(defaultNdaForm.governingLaw).toBe("");
    expect(defaultNdaForm.party1.company).toBe("");
  });

  test.each<[string, object]>([
    ["a date that does not exist", { effectiveDate: "2026-02-30" }],
    ["a date in another format", { effectiveDate: "01/15/2027" }],
    ["an empty date", { effectiveDate: "" }],
    ["zero years", { mndaTermYears: "0", confidentialityYears: "0" }],
    ["years that are not a number", { mndaTermYears: "three" }],
    ["years as a number", { confidentialityYears: 5 }],
    ["an unknown term", { mndaTerm: "forever", confidentialityTerm: "expires" }],
    ["text that is not a string", { purpose: null, governingLaw: 7, party1: { company: null } }],
    ["a party that is not an object", { party1: "Acme Inc.", party2: null }],
    ["a field that does not exist", { signature: "Ada" }],
  ])("ignores %s", (_, changes) => {
    expect(applyChanges(defaultNdaForm, changes as NdaChanges)).toEqual(defaultNdaForm);
  });
});
