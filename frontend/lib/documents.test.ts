import { describe, expect, test } from "vitest";
import { fieldValue, partyValue, resolveVariable, type DocumentSpec } from "@/lib/documents";

const SPEC: DocumentSpec = {
  id: "partnership-agreement",
  name: "Partnership Agreement",
  template: "Partnership-Agreement.md",
  parties: [
    { key: "company", label: "Company" },
    { key: "partner", label: "Partner" },
  ],
  terms: ["Partner Covered Claim"],
  fields: [
    { key: "product", label: "Product", variables: [] },
    { key: "territory", label: "Territory" },
    { key: "endDate", label: "End Date", kind: "date" },
    { key: "dpa", label: "DPA", optional: true },
    {
      key: "companyCoveredClaims",
      label: "Company Covered Claims",
      variables: ["Company Covered Claim"],
    },
  ],
};
const VALUES = { companyCompany: " Acme Inc. ", territory: " worldwide ", endDate: "2027-01-15" };

describe("resolveVariable", () => {
  test("puts a party's company where the template names its role", () => {
    expect(resolveVariable(SPEC, VALUES, "Company")).toEqual({
      type: "party",
      value: "Acme Inc.",
      placeholder: "Company",
      suffix: "",
    });
  });

  test.each(["Partner's", "Partner’s"])("keeps the possessive of %s", (name) => {
    expect(resolveVariable(SPEC, VALUES, name)).toEqual({
      type: "party",
      value: "",
      placeholder: "Partner",
      suffix: "’s",
    });
  });

  test("puts a field's value where the template names it", () => {
    expect(resolveVariable(SPEC, VALUES, "Territory")).toEqual({
      type: "field",
      value: "worldwide",
      placeholder: "Territory",
    });
    expect(resolveVariable(SPEC, VALUES, "End Date")).toMatchObject({ value: "January 15, 2027" });
    expect(resolveVariable(SPEC, {}, "End Date")).toMatchObject({
      value: "",
      placeholder: "End Date",
    });
  });

  test("goes by the variables a field lists when it lists any", () => {
    const values = { companyCoveredClaims: "IP claims" };

    expect(resolveVariable(SPEC, values, "Company Covered Claim")).toMatchObject({
      value: "IP claims",
      placeholder: "Company Covered Claims",
    });
    expect(resolveVariable(SPEC, values, "Company Covered Claims").type).toBe("unknown");
    expect(resolveVariable(SPEC, { product: "Widgets" }, "Product").type).toBe("unknown");
  });

  test("leaves a term the user left out as the term it is", () => {
    expect(resolveVariable(SPEC, { dpa: "None" }, "DPA")).toEqual({ type: "term" });
    expect(resolveVariable(SPEC, VALUES, "Partner Covered Claim")).toEqual({ type: "term" });
  });

  test("does not know a variable the document does not mention", () => {
    const bare = { ...SPEC, parties: undefined, fields: undefined };

    expect(resolveVariable(SPEC, VALUES, "Jurisdiction")).toEqual({ type: "unknown" });
    expect(resolveVariable(bare, {}, "Company")).toEqual({ type: "unknown" });
  });
});

describe("values", () => {
  test("are read without the spaces around them", () => {
    expect(partyValue(VALUES, SPEC.parties![0], "Company")).toBe("Acme Inc.");
    expect(partyValue(VALUES, SPEC.parties![1], "NoticeAddress")).toBe("");
    expect(fieldValue(VALUES, SPEC.fields![1])).toBe("worldwide");
  });

  test("show a date in words, and nothing for a date that is not one", () => {
    expect(fieldValue(VALUES, SPEC.fields![2])).toBe("January 15, 2027");
    expect(fieldValue({ endDate: "soon" }, SPEC.fields![2])).toBe("");
  });
});
