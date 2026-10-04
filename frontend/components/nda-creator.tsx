"use client";

import { useState, useSyncExternalStore } from "react";
import { NdaDocument } from "@/components/nda-document";
import { NdaFormFields } from "@/components/nda-form";
import { defaultNdaForm, todayIso, type NdaForm } from "@/lib/nda";
import type { Clause } from "@/lib/standard-terms";

const subscribeToNothing = () => () => {};

/** Today's date in the browser's timezone; empty while prerendering so hydration matches. */
function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, todayIso, () => "");
}

function pdfTitle(form: NdaForm): string {
  const companies = [form.party1.company, form.party2.company]
    .map((company) => company.trim())
    .filter(Boolean);
  return companies.length > 0
    ? `Mutual NDA - ${companies.join(" and ")}`
    : "Mutual NDA";
}

export function NdaCreator({ clauses }: { clauses: Clause[] }) {
  const [form, setForm] = useState(defaultNdaForm);
  const today = useToday();
  const effectiveDate = form.effectiveDate ?? today;

  function downloadPdf() {
    // Browsers suggest the page title as the PDF file name.
    const previousTitle = document.title;
    document.title = pdfTitle(form);
    // Not every browser waits in print() until the dialog closes, so restore the title afterwards.
    window.addEventListener(
      "afterprint",
      () => {
        document.title = previousTitle;
      },
      { once: true },
    );
    window.print();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-rule bg-panel px-4 sm:px-6 print:hidden">
        <h1 className="font-serif text-2xl font-medium tracking-tight">
          Mutual NDA
        </h1>
        <div className="flex items-center gap-4">
          <p className="hidden text-sm text-muted md:block">
            Choose “Save as PDF” in the print dialog.
          </p>
          <button
            type="button"
            onClick={downloadPdf}
            className="rounded-md bg-pen px-4 py-2 text-sm font-semibold text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Download PDF
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[26rem_minmax(0,1fr)]">
        <aside className="border-b border-rule bg-panel lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:overflow-y-auto lg:border-r lg:border-b-0 print:hidden">
          <NdaFormFields
            form={form}
            effectiveDate={effectiveDate}
            onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          />
        </aside>
        <main className="px-3 py-6 sm:p-8 xl:p-12 print:p-0">
          <NdaDocument
            form={form}
            effectiveDate={effectiveDate}
            clauses={clauses}
          />
        </main>
      </div>
    </div>
  );
}
