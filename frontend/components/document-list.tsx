"use client";

import Link from "next/link";
import { useState } from "react";
import { Loading } from "@/components/brand";
import { deleteDocument, listDocuments, type SavedSummary } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import { useLoad } from "@/lib/use-load";
import {
  buttonClass,
  cardClass,
  dangerButtonClass,
  errorClass,
  linkClass,
  quietButtonClass,
} from "@/lib/styles";

const WHEN = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

/** The documents the user has drafted, to open again or delete. */
export function DocumentList({ documents }: { documents: DocumentSpec[] }) {
  const { data: saved, setData: setSaved, failed, retry } = useLoad(listDocuments);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">My documents</h1>
          <p className="mt-1 text-sm text-muted">
            Every agreement you draft is kept here. Open one to carry on where you left off.
          </p>
        </div>
        <Link href="/" className={`${buttonClass} shrink-0`}>
          New document
        </Link>
      </div>

      <div className="mt-8">
        {!saved && !failed && <Loading>Loading your documents…</Loading>}
        {failed && (
          <section role="alert" className={`${cardClass} space-y-4 p-6 text-sm`}>
            <p>Your documents couldn’t be loaded. Check your connection.</p>
            <button type="button" onClick={retry} className={buttonClass}>
              Try again
            </button>
          </section>
        )}
        {saved?.length === 0 && (
          <section className={`${cardClass} px-6 py-12 text-center`}>
            <h2 className="font-serif text-xl font-medium">No documents yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
              Tell the assistant what you need and your agreement is saved here as you draft it.
            </p>
            <Link href="/" className={`${buttonClass} mt-6 inline-block`}>
              Draft your first agreement
            </Link>
          </section>
        )}
        {saved && saved.length > 0 && (
          <ul className={`${cardClass} divide-y divide-rule`}>
            {saved.map((document) => (
              <Row
                key={document.id}
                document={document}
                name={documents.find((spec) => spec.id === document.document)?.name}
                onDeleted={() => setSaved(saved.filter((other) => other.id !== document.id))}
              />
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}

function Row({
  document,
  name = "Agreement",
  onDeleted,
}: {
  document: SavedSummary;
  /** What kind of document it is, e.g. "Pilot Agreement". */
  name?: string;
  onDeleted: () => void;
}) {
  const [state, setState] = useState<"kept" | "asking" | "deleting" | "failed">("kept");

  async function remove() {
    setState("deleting");
    try {
      await deleteDocument(document.id);
      onDeleted();
    } catch {
      setState("failed");
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-4 sm:px-6">
      <div className="min-w-0 flex-1 basis-56">
        <Link href={`/?doc=${document.id}`} className={`${linkClass} block truncate text-ink`}>
          {name}
        </Link>
        <p className="truncate text-sm text-muted">{document.parties || "No parties yet"}</p>
        <p className="text-xs text-muted">Updated {WHEN.format(new Date(document.updatedAt))}</p>
        {state === "failed" && (
          <p role="alert" className={`${errorClass} mt-1`}>
            This document couldn’t be deleted. Try again.
          </p>
        )}
      </div>
      {state === "asking" || state === "deleting" ? (
        // Asked in place, where the document is, since deleting cannot be undone.
        <p className="flex items-center gap-2 text-sm">
          Delete for good?
          <button
            type="button"
            onClick={remove}
            disabled={state === "deleting"}
            className={dangerButtonClass}
          >
            {state === "deleting" ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={() => setState("kept")}
            disabled={state === "deleting"}
            className={quietButtonClass}
          >
            Keep
          </button>
        </p>
      ) : (
        <p className="flex items-center gap-2">
          <Link href={`/?doc=${document.id}`} className={quietButtonClass}>
            Open
          </Link>
          <button
            type="button"
            onClick={() => setState("asking")}
            aria-label={`Delete ${name}${document.parties && ` - ${document.parties}`}`}
            className={`${quietButtonClass} text-muted`}
          >
            Delete
          </button>
        </p>
      )}
    </li>
  );
}
