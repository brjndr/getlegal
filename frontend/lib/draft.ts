import { NDA, type Values } from "@/lib/documents";
import { applyChanges, defaultNdaForm, type NdaChanges, type NdaForm } from "@/lib/nda";

/** The agreement being drafted, and what the assistant needs sent back to carry on with it. */
export type Draft = {
  /** The id of the document, or `null` until the user has chosen one. */
  document: string | null;
  /** The Mutual NDA's form. The other documents keep their fields in `values`. */
  form: NdaForm;
  values: Values;
  /** The Mutual NDA's defaults that the user has agreed to keep. */
  settled: string[];
};

/** What the assistant said, and what it filled in or chose. */
export type ChatTurn = {
  reply: string;
  /** The fields the assistant filled in from the user's message. */
  changes: NdaChanges | Values;
  settled?: string[];
  /** The document the user asked for instead. Nothing else is filled in then. */
  document?: string;
};

export function emptyDraft(document: string | null = null): Draft {
  return { document, form: defaultNdaForm, values: {}, settled: [] };
}

/** Returns the draft with the assistant's changes applied. */
export function applyTurn(draft: Draft, turn: ChatTurn): Draft {
  if (draft.document === NDA) {
    return {
      ...draft,
      form: applyChanges(draft.form, turn.changes as NdaChanges),
      settled: turn.settled ?? draft.settled,
    };
  }
  const values = { ...draft.values };
  for (const [key, value] of Object.entries(turn.changes)) {
    // The changes come from a language model, by way of the backend.
    if (typeof value === "string") values[key] = value;
  }
  return { ...draft, values };
}
