"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Loading } from "@/components/brand";
import { Workspace } from "@/components/workspace";
import { ApiError, openDocument } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import type { Clause } from "@/lib/standard-terms";
import { buttonClass, cardClass, linkClass } from "@/lib/styles";
import { useLoad } from "@/lib/use-load";

type Props = {
  documents: DocumentSpec[];
  clauses: Clause[];
};

/** The saved document the address asks for, as in "/?doc=12", or null for a new one. */
function useWanted(): number | null {
  const doc = useSearchParams().get("doc") ?? "";
  return /^\d{1,15}$/.test(doc) ? Number(doc) : null;
}

/** Shows the workspace with a new document, or with the saved one that the address names. */
export function WorkspaceLoader(props: Props) {
  const wanted = useWanted();
  // `saved` is the id that the workspace on show gave its own document, which is put in the
  // address so that reloading the page comes back to it. That is not a request to open it.
  const [shown, setShown] = useState({ wanted, saved: null as number | null, workspace: 0 });
  if (wanted !== shown.wanted) {
    const same = wanted !== null && wanted === shown.saved;
    setShown({ wanted, saved: same ? wanted : null, workspace: shown.workspace + (same ? 0 : 1) });
  }

  function saved(id: number) {
    setShown((shown) => ({ ...shown, saved: id }));
    window.history.replaceState(null, "", `?doc=${id}`);
  }

  return <Opened key={shown.workspace} {...props} id={wanted} onSaved={saved} />;
}

/** A workspace, once the saved document it starts from has arrived. */
function Opened({
  id,
  onSaved,
  ...props
}: Props & { id: number | null; onSaved: (id: number) => void }) {
  // Only the id it began with: the address changes to a document's own id when it is saved.
  const [asked] = useState(id);
  const open = useMemo(() => (asked === null ? null : () => openDocument(asked)), [asked]);
  const { data: document, error, failed, retry } = useLoad(open);

  if (asked === null) return <Workspace {...props} onSaved={onSaved} />;
  if (document) {
    if (props.documents.some((spec) => spec.id === document.draft.document)) {
      return <Workspace {...props} opened={document} onSaved={onSaved} />;
    }
    return <Problem message="This kind of document can no longer be drafted here." />;
  }
  // What the backend explains, such as the document having been deleted, will not change.
  if (error instanceof ApiError) return <Problem message={error.message} />;
  if (failed) {
    return (
      <Problem message="Your document couldn’t be opened. Check your connection." onRetry={retry} />
    );
  }
  return (
    <main>
      <Loading>Opening your document…</Loading>
    </main>
  );
}

function Problem({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <main className="px-4 py-10">
      <section role="alert" className={`${cardClass} mx-auto max-w-md space-y-4 p-6 text-sm`}>
        <p>{message}</p>
        <p className="flex items-center gap-4">
          {onRetry && (
            <button type="button" onClick={onRetry} className={buttonClass}>
              Try again
            </button>
          )}
          <Link href="/documents/" className={linkClass}>
            Go to my documents
          </Link>
        </p>
      </section>
    </main>
  );
}
