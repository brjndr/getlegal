import { useEffect, useRef, useState } from "react";
import { ApiError, saveDocument, type SavedState } from "@/lib/api";

// The backend keeps this many messages of a conversation.
const MAX_MESSAGES = 200;

export type SaveStatus = "unsaved" | "saving" | "saved" | "failed";

/**
 * Keeps the user's document saved as they draft it.
 * `opened` is the id it is already saved under, when it is one they came back to.
 * `onSaved` hears the id of a document when it is first saved.
 */
export function useAutosave(opened: number | null, onSaved?: (id: number) => void) {
  const [status, setStatus] = useState<SaveStatus>(opened === null ? "unsaved" : "saved");
  // Where the document being drafted is saved. A new object for each document, so that a save
  // still on its way cannot land on the document that came after.
  const record = useRef({ id: opened });
  const latest = useRef<SavedState | null>(null);
  // One save at a time, in order: the first one has to come back with the id the rest save to.
  const queue = useRef(Promise.resolve());
  // A save goes on after the user has left the page, but then nobody is told its id.
  const here = useRef(true);
  useEffect(() => {
    here.current = true;
    return () => {
      here.current = false;
    };
  }, []);

  /** Saves to the target, as a new document if the one it was saved as has been deleted. */
  async function store(target: { id: number | null }, state: SavedState) {
    try {
      return await saveDocument(target.id, state);
    } catch (failure) {
      if (target.id === null || !(failure instanceof ApiError) || failure.status !== 404) {
        throw failure;
      }
      return saveDocument(null, state);
    }
  }

  /** Saves the document as it now stands. `another` says it is not the one saved before. */
  function save(state: SavedState, another = false) {
    if (another) record.current = { id: null };
    const target = record.current;
    const trimmed = { ...state, messages: state.messages.slice(-MAX_MESSAGES) };
    latest.current = trimmed;
    setStatus("saving");
    queue.current = queue.current.then(async () => {
      let saved = true;
      try {
        const { id } = await store(target, trimmed);
        if (id !== target.id && target === record.current && here.current) onSaved?.(id);
        target.id = id;
      } catch {
        saved = false;
      }
      // A later save, still waiting, will have the last word.
      if (latest.current === trimmed) setStatus(saved ? "saved" : "failed");
    });
  }

  /** Tries the save that failed again. */
  function retry() {
    if (latest.current) save(latest.current);
  }

  return { status, save, retry };
}
