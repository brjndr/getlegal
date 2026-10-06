import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, test } from "vitest";
import { NdaDocument } from "@/components/nda-document";
import { defaultNdaForm, type NdaForm } from "@/lib/nda";

afterEach(cleanup);

function renderDocument(form: Partial<NdaForm> = {}, effectiveDate = "2026-10-04") {
  render(
    <NdaDocument form={{ ...defaultNdaForm, ...form }} effectiveDate={effectiveDate} clauses={[]} />,
  );
  return within(screen.getByRole("article"));
}

describe("NdaDocument", () => {
  test("marks every value that is still missing", () => {
    const agreement = renderDocument({ purpose: "   ", confidentialityYears: "0" });

    expect(agreement.getByText("Describe the purpose")).toBeDefined();
    expect(agreement.getByText("State")).toBeDefined();
    expect(agreement.getByText("City or county and state")).toBeDefined();
    expect(agreement.getByText("number of years")).toBeDefined();
  });

  test("asks for a number of years when there isn't one", () => {
    const agreement = renderDocument({ mndaTermYears: "" });

    expect(agreement.getByText("number of years")).toBeDefined();
    expect(agreement.getAllByText("1 year")).toHaveLength(1);
  });

  test("asks for the effective date when there isn't one", () => {
    const agreement = renderDocument({}, "");

    expect(agreement.getByText("Effective date", { selector: "span" })).toBeDefined();
  });

  test("says there are no modifications until some are given", () => {
    expect(renderDocument().getByText("None.")).toBeDefined();
    cleanup();

    const agreement = renderDocument({ modifications: "Section 7 does not apply." });

    expect(agreement.getByText("Section 7 does not apply.")).toBeDefined();
    expect(agreement.queryByText("None.")).toBeNull();
  });
});
