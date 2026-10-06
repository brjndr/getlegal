"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { Loading } from "@/components/brand";
import { DraftChat, type Turn } from "@/components/draft-chat";
import { GeneratedDocument } from "@/components/generated-document";
import { articleClass, NdaDocument } from "@/components/nda-document";
import { fetchTemplates, type SavedDocument } from "@/lib/api";
import { DISCLAIMER } from "@/lib/disclaimer";
import { NDA, partyValue, type DocumentSpec } from "@/lib/documents";
import { emptyDraft, type Draft } from "@/lib/draft";
import { todayIso } from "@/lib/nda";
import { downloadPdf } from "@/lib/pdf";
import type { Clause } from "@/lib/standard-terms";
import { buttonClass, focusClass, linkClass, noticeClass } from "@/lib/styles";
import { useAutosave, type SaveStatus } from "@/lib/use-autosave";
import { useLoad } from "@/lib/use-load";

const subscribeToNothing = () => () => {};

/** Today's date in the browser's timezone; empty while prerendering so hydration matches. */
function useToday(): string {
  return useSyncExternalStore(subscribeToNothing, todayIso, () => "");
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

/** Says whether the document is safely kept, beside its title. */
function Saving({ status, onRetry }: { status: SaveStatus; onRetry: () => void }) {
  return (
    <p aria-live="polite" className="shrink-0 text-xs text-muted">
      {status === "saving" && "Saving…"}
      {status === "saved" && "Saved"}
      {status === "failed" && (
        <>
          <span className="text-danger">Not saved.</span>{" "}
          <button type="button" onClick={onRetry} className={linkClass}>
            Try again
          </button>
        </>
      )}
    </p>
  );
}

const VIEWS = { chat: "Chat", document: "Document" } as const;

export function Workspace({
  documents,
  clauses,
  opened,
  onSaved,
}: {
  /** The documents that can be drafted. */
  documents: DocumentSpec[];
  /** The Standard Terms of the Mutual NDA. */
  clauses: Clause[];
  /** A document the user saved earlier, to carry on with. */
  opened?: SavedDocument;
  /** Called with the id a document is saved under, when it is first saved. */
  onSaved?: (id: number) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => opened?.draft ?? emptyDraft());
  // A phone has room for one of the two at a time.
  const [view, setView] = useState<keyof typeof VIEWS>("chat");
  const { status, save, retry: saveAgain } = useAutosave(opened?.id ?? null, onSaved);
  const today = useToday();
  const page = useRef<HTMLElement>(null);
  const spec = documents.find((document) => document.id === draft.document);
  // The agreement text of the documents drafted from a spec, once one of them is wanted.
  const wanted = spec !== undefined && !spec.engine;
  const { data: templates, failed, retry } = useLoad(wanted ? fetchTemplates : null);
  const template = spec && templates?.[spec.id];
  const { title, file } = titles(spec, draft);
  const ready = spec !== undefined && (spec.id === NDA || template !== undefined);

  function keep({ draft, messages, started }: Turn) {
    setDraft(draft);
    const { document } = draft;
    // There is nothing to keep until the user has chosen a document.
    if (document !== null) save({ draft: { ...draft, document }, messages }, started);
  }

  function download() {
    const article = page.current?.querySelector("article");
    if (article) downloadPdf(article, file);
  }

  return (
    <div>
      <div className="sticky top-14 z-10 border-b border-rule bg-panel print:hidden">
        <div className="flex h-12 items-center gap-3 px-4 sm:px-6">
          <h1 className="truncate font-serif text-xl font-medium tracking-tight">{title}</h1>
          <Saving status={status} onRetry={saveAgain} />
          <button
            type="button"
            onClick={download}
            disabled={!ready}
            className={`${buttonClass} ml-auto shrink-0 py-1.5`}
          >
            Download PDF
          </button>
        </div>
        <div className="grid h-11 grid-cols-2 gap-1 border-t border-rule px-4 py-1.5 sm:px-6 lg:hidden">
          {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((name) => (
            <button
              key={name}
              type="button"
              aria-pressed={view === name}
              onClick={() => setView(name)}
              className={`rounded-md text-sm font-medium ${focusClass} ${
                view === name ? "bg-paper text-ink shadow-sm" : "text-muted hover:text-ink"
              }`}
            >
              {VIEWS[name]}
            </button>
          ))}
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[26rem_minmax(0,1fr)]">
        {/* A fixed height, so the conversation scrolls inside it and the message box stays put. */}
        {/* Both stay on the page when a phone shows only one: the PDF is made from the document. */}
        <aside
          className={`h-[calc(100dvh-9.25rem)] bg-panel lg:sticky lg:top-[6.5rem] lg:block lg:h-[calc(100dvh-6.5rem)] lg:border-r lg:border-rule print:hidden ${
            view === "chat" ? "" : "hidden"
          }`}
        >
          <DraftChat documents={documents} draft={draft} opened={opened?.messages} onTurn={keep} />
        </aside>
        <main
          ref={page}
          className={`px-3 py-6 sm:p-8 lg:block xl:p-12 print:block print:p-0 ${
            view === "document" ? "" : "hidden"
          }`}
        >
          <p role="note" className={`${noticeClass} mx-auto mb-5 max-w-[8.5in] print:hidden`}>
            {DISCLAIMER}
          </p>
          {spec === undefined ? (
            <section className={articleClass}>
              <h2 className="text-3xl leading-tight font-medium tracking-tight">
                Your agreement will appear here
              </h2>
              <p className="mt-5">
                Tell the assistant what you need and it will start one of these documents, then
                fill it in as you answer its questions:
              </p>
              <ul className="mt-6 grid gap-2 font-sans text-sm sm:grid-cols-2">
                {documents.map((document) => (
                  <li key={document.id} className="rounded-md border border-rule bg-panel px-3 py-2">
                    {document.name}
                  </li>
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
            <section className={articleClass}>
              <Loading>{`Loading the ${spec.name}…`}</Loading>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
