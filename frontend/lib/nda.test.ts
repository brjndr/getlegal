import { afterEach, describe, expect, test, vi } from "vitest";
import { defaultNdaForm, formatDate, formatYears, todayIso } from "@/lib/nda";

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
