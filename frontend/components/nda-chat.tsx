"use client";

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { chat, ChatError, type ChatMessage } from "@/lib/api";
import { todayIso, type NdaChanges, type NdaForm } from "@/lib/nda";
import { buttonClass, inputClass } from "@/lib/styles";

// Shown straight away, so opening the page doesn't wait on the assistant.
const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I’ll help you draft a Mutual Non-Disclosure Agreement. Tell me about it in your own words and I’ll fill in the document as we go. To start, which two companies are entering into the NDA?",
};

// The backend accepts this many messages; older ones are left out of the request.
const MAX_MESSAGES = 40;

const FAILED = "The assistant couldn’t reply. Check your connection and try again.";

export function NdaChat({
  form,
  onChanges,
}: {
  form: NdaForm;
  onChanges: (changes: NdaChanges) => void;
}) {
  const [messages, setMessages] = useState([GREETING]);
  const [settled, setSettled] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Keeps the newest message in view. Scrolls the conversation only, never the page.
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, pending]);

  /** Asks the assistant to answer the conversation, which ends with a message from the user. */
  async function reply(conversation: ChatMessage[]) {
    setPending(true);
    setError(null);
    try {
      const turn = await chat(conversation.slice(-MAX_MESSAGES), form, settled, todayIso());
      setMessages([...conversation, { role: "assistant", content: turn.reply }]);
      setSettled(turn.settled);
      onChanges(turn.changes);
    } catch (failure) {
      setError(failure instanceof ChatError ? failure.message : FAILED);
    } finally {
      setPending(false);
    }
  }

  function send() {
    const content = draft.trim();
    if (!content || pending) return;
    const conversation: ChatMessage[] = [...messages, { role: "user", content }];
    setMessages(conversation);
    setDraft("");
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
          <p role="status" className="text-sm text-muted">
            Thinking…
          </p>
        )}
      </div>

      {error && (
        <div role="alert" className="flex items-start gap-3 px-4 pb-3 text-sm text-red-700 sm:px-6">
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

      <form onSubmit={submit} className="flex items-end gap-2 border-t border-rule px-4 py-3 sm:px-6">
        <textarea
          aria-label="Message"
          rows={2}
          maxLength={4000}
          placeholder="Type your answer…"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={sendOnEnter}
          className={`${inputClass} resize-none`}
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className={buttonClass}
        >
          Send
        </button>
      </form>
    </section>
  );
}
