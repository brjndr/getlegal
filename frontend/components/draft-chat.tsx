"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ApiError, converse, type ChatMessage } from "@/lib/api";
import type { DocumentSpec } from "@/lib/documents";
import { applyTurn, emptyDraft, type Draft } from "@/lib/draft";
import { todayIso } from "@/lib/nda";
import { buttonClass, inputClass } from "@/lib/styles";

// The backend accepts this many messages; older ones are left out of the request.
const MAX_MESSAGES = 40;

const FAILED = "The assistant couldn’t reply. Check your connection and try again.";

// Shown straight away, so opening the page doesn't wait on the assistant.
function greeting(documents: DocumentSpec[]): ChatMessage {
  const names = documents.map((document) => document.name).join(", ");
  return {
    role: "assistant",
    content: `Hi! I’ll help you draft a legal agreement. Tell me about it in your own words and I’ll fill in the document as we go. I can prepare: ${names}. Which do you need?`,
  };
}

/** What a reply from the assistant left behind. */
export type Turn = {
  draft: Draft;
  /** The conversation about the document, from the message that chose it. */
  messages: ChatMessage[];
  /** Whether the user chose this document in the message just answered. */
  started: boolean;
};

export function DraftChat({
  documents,
  draft,
  opened,
  onTurn,
}: {
  /** The documents the assistant can draft. */
  documents: DocumentSpec[];
  draft: Draft;
  /** The conversation so far, when carrying on with a saved document. */
  opened?: ChatMessage[];
  /** Called with the agreement and its conversation after each reply. */
  onTurn: (turn: Turn) => void;
}) {
  const [messages, setMessages] = useState(() => opened ?? [greeting(documents)]);
  // Where the conversation about the current document starts. Earlier messages are about
  // another document, and are not sent, so that nothing is carried over from it.
  const [since, setSince] = useState(0);
  const [typed, setTyped] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Keeps the newest message in view. Scrolls the conversation only, never the page.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, pending]);

  /** Puts the cursor back in the message box, unless the user has gone to use something else. */
  function focusInput() {
    const active = document.activeElement;
    // Pressing Send leaves the focus on a button that is then disabled, where typing is lost.
    if (!active || active === document.body || form.current?.contains(active)) {
      input.current?.focus();
    }
  }

  /** Asks the assistant to answer the conversation, which ends with a message from the user. */
  async function reply(conversation: ChatMessage[]) {
    setPending(true);
    setError(null);
    const today = todayIso();
    const from = (start: number) => conversation.slice(start).slice(-MAX_MESSAGES);
    try {
      let current = draft;
      let start = since;
      let turn = await converse(current, from(start), today, false);
      if (documents.some((document) => document.id === turn.document)) {
        // The user chose a document, or a different one. It starts empty, and the assistant
        // reads the message again as the first one about that document.
        current = emptyDraft(turn.document);
        start = conversation.length - 1;
        turn = await converse(current, from(start), today, true);
      }
      if (!turn.reply) throw new Error("The assistant said nothing");
      const answered: ChatMessage[] = [...conversation, { role: "assistant", content: turn.reply }];
      setSince(start);
      setMessages(answered);
      onTurn({
        draft: applyTurn(current, turn),
        messages: answered.slice(start),
        started: current !== draft,
      });
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : FAILED);
    } finally {
      setPending(false);
      focusInput();
    }
  }

  function send() {
    const content = typed.trim();
    if (!content || pending) return;
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(conversation);
    setTyped("");
    focusInput();
    reply(conversation);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    send();
  }

  function sendOnEnter(event: KeyboardEvent) {
    // Shift+Enter adds a line, and Enter while composing picks a suggestion.
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    send();
  }

  return (
    <section aria-label="Chat with the assistant" className="flex h-full min-h-0 flex-col">
      <div
        ref={log}
        role="log"
        aria-label="Conversation"
        className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-5 sm:px-6"
      >
        {messages.map((message, index) => (
          <p
            key={index}
            className={`w-fit max-w-[85%] rounded-lg px-3 py-2 text-sm wrap-anywhere whitespace-pre-wrap ${
              message.role === "user"
                ? "ml-auto bg-pen text-white"
                : "border border-rule bg-paper text-ink"
            }`}
          >
            <span className="sr-only">{message.role === "user" ? "You: " : "Assistant: "}</span>
            {message.content}
          </p>
        ))}
        {pending && (
          <p role="status" className="flex items-center gap-2 text-sm text-muted">
            <span
              aria-hidden="true"
              className="size-3 animate-spin rounded-full border-2 border-rule border-t-pen"
            />
            Thinking…
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 px-4 pb-3 text-sm text-danger sm:px-6">
          <p className="flex-1">{error}</p>
          <button
            type="button"
            onClick={() => reply(messages)}
            className="shrink-0 font-semibold underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
          >
            Try again
          </button>
        </div>
      )}

      <form
        ref={form}
        onSubmit={submit}
        className="flex items-end gap-2 border-t border-rule px-4 py-3 sm:px-6"
      >
        <textarea
          ref={input}
          aria-label="Message"
          rows={2}
          maxLength={4000}
          placeholder="Type your answer…"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onKeyDown={sendOnEnter}
          className={`${inputClass} resize-none`}
        />
        <button
          type="submit"
          disabled={pending || !typed.trim()}
          className={buttonClass}
        >
          Send
        </button>
      </form>
    </section>
  );
}
