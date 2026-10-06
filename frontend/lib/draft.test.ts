import { describe, expect, test } from "vitest";
import { applyTurn, emptyDraft } from "@/lib/draft";
import { defaultNdaForm } from "@/lib/nda";

describe("emptyDraft", () => {
  test("has no document until one is chosen", () => {
    expect(emptyDraft()).toEqual({ document: null, form: defaultNdaForm, values: {}, settled: [] });
    expect(emptyDraft("csa").document).toBe("csa");
  });
});

describe("applyTurn", () => {
  test("adds the values the assistant filled in to the ones already there", () => {
    const draft = { ...emptyDraft("pilot-agreement"), values: { product: "Widgets", fees: "$1" } };

    const next = applyTurn(draft, {
      reply: "Noted.",
      changes: { fees: "$2", pilotPeriod: "90 days" },
    });

    expect(next.values).toEqual({ product: "Widgets", fees: "$2", pilotPeriod: "90 days" });
    expect(draft.values.fees).toBe("$1");
  });

  test("leaves out anything that is not text", () => {
    const changes = { product: "Widgets", fees: 5, pilotPeriod: null, party1: { company: "Acme" } };

    const next = applyTurn(emptyDraft("pilot-agreement"), { reply: "", changes: changes as never });

    expect(next.values).toEqual({ product: "Widgets" });
  });

  test("fills in the Mutual NDA's form and keeps what the user has settled", () => {
    const next = applyTurn(emptyDraft("mutual-nda"), {
      reply: "Noted.",
      changes: { governingLaw: "Delaware", party1: { company: "Acme Inc." }, mndaTermYears: "0" },
      settled: ["purpose"],
    });

    expect(next.form.governingLaw).toBe("Delaware");
    expect(next.form.party1.company).toBe("Acme Inc.");
    // The form's own checks still apply.
    expect(next.form.mndaTermYears).toBe("1");
    expect(next.settled).toEqual(["purpose"]);
    expect(next.values).toEqual({});
  });

  test("keeps the settled defaults when the assistant does not report them", () => {
    const draft = { ...emptyDraft("mutual-nda"), settled: ["purpose"] };

    expect(applyTurn(draft, { reply: "Noted.", changes: {} }).settled).toEqual(["purpose"]);
  });
});
