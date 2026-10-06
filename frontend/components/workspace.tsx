"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { DraftChat } from "@/components/draft-chat";
import { GeneratedDocument } from "@/components/generated-document";
import { articleClass, NdaDocument } from "@/components/nda-document";
import { fetchTemplates } from "@/lib/api";
import { NDA, partyValue, type DocumentSpec } from "@/lib/documents";
import { emptyDraft, type Draft } from "@/lib/draft";
import { todayIso } from "@/lib/nda";
import { downloadPdf } from "@/lib/pdf";
import type { Clause } from "@/lib/standard-terms";
import { buttonClass } from "@/lib/styles";
import type { Template } from "@/lib/template";

const subscribeToNothing = () => () => {};

/** Today's date in the browser's timezone; empty while prerendering so hydration matches. */
function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, todayIso, () => "");
}

/** The agreement text of the documents drafted from a spec, once it is `wanted`. */
function useTemplates(wanted: boolean) {
  const [templates, setTemplates] = useState<Record<string, Template> | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!wanted) return;
    let current = true;
    fetchTemplates().then(
      (loaded) => current && setTemplates(loaded),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [wanted, attempt]);

  function retry() {
    setFailed(false);
    setAttempt((count) => count + 1);
  }

  return { templates, failed, retry };
}

/** What the header and the PDF file are called, e.g. "Pilot Agreement - Acme Inc. and Globex LLC". */
function titles(spec: DocumentSpec | undefined, draft: Draft): { title: string; file: string } {
  if (!spec) return { title: "Draft an agreement", file: "" };
  const title = spec.id === NDA ? "Mutual NDA" : spec.name;
  const companies = (
    spec.id === NDA
      ? [draft.form.party1.company, draft.form.party2.company]
      : (spec.parties ?? []).map((party) => partyValue(draft.values, party, "Company"))
  )
    .map((company) => company.trim())
    .filter(Boolean);
  return { title, file: [title, companies.join(" and ")].filter(Boolean).join(" - ") };
}

export function Workspace({
  documents,
  clauses,
  headerExtra,
}: {
  /** The documents that can be drafted. */
  documents: DocumentSpec[];
  /** The Standard Terms of the Mutual NDA. */
  clauses: Clause[];
  /** Shown in the header beside the download button. */
  headerExtra?: ReactNode;
}) {
  const [draft, setDraft] = useState(emptyDraft);
  const today = useToday();
  const page = useRef<HTMLElement>(null);
  const spec = documents.find((document) => document.id === draft.document);
  const { templates, failed, retry } = useTemplates(spec !== undefined && !spec.engine);
  const template = spec && templates?.[spec.id];
  const { title, file } = titles(spec, draft);
  const ready = spec !== undefined && (spec.id === NDA || template !== undefined);

  function download() {
    const article = page.current?.querySelector("article");
    if (article) downloadPdf(article, file);
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between gap-4 border-b border-rule bg-panel px-4 sm:px-6 print:hidden">
        <h1 className="truncate font-serif text-2xl font-medium tracking-tight">{title}</h1>
        <div className="flex shrink-0 items-center gap-4">
          {headerExtra}
          <button type="button" onClick={download} disabled={!ready} className={buttonClass}>
            Download PDF
          </button>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* A fixed height, so the conversation scrolls inside it and the message box stays put. */}
        <aside className="h-[28rem] max-h-[70dvh] border-b border-rule bg-panel lg:sticky lg:top-16 lg:h-[calc(100dvh-4rem)] lg:max-h-none lg:border-r lg:border-b-0 print:hidden">
          <DraftChat documents={documents} draft={draft} onDraft={setDraft} />
        </aside>
        <main ref={page} className="px-3 py-6 sm:p-8 xl:p-12 print:p-0">
          {spec === undefined ? (
            <section className={articleClass}>
              <h2 className="text-3xl leading-tight font-medium tracking-tight">
                Your agreement will appear here
              </h2>
              <p className="mt-5">
                Tell the assistant what you need and it will start one of these documents, then
                fill it in as you answer its questions:
              </p>
              <ul className="mt-4 list-disc space-y-1 pl-6">
                {documents.map((document) => (
                  <li key={document.id}>{document.name}</li>
                ))}
              </ul>
            </section>
          ) : spec.id === NDA ? (
            <NdaDocument
              form={draft.form}
              effectiveDate={draft.form.effectiveDate ?? today}
              clauses={clauses}
            />
          ) : template ? (
            <GeneratedDocument spec={spec} template={template} values={draft.values} />
          ) : failed ? (
            <section role="alert" className={articleClass}>
              <p>The text of the {spec.name} couldn’t be loaded.</p>
              <button type="button" onClick={retry} className={`${buttonClass} mt-4`}>
                Try again
              </button>
            </section>
          ) : (
            <section role="status" className={articleClass}>
              Loading the {spec.name}…
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
