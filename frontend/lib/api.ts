import { NDA } from "@/lib/documents";
import type { ChatTurn, Draft } from "@/lib/draft";
import type { Template } from "@/lib/template";

// The backend serves the built frontend, so the API is on the same origin except under `next dev`.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

export type User = {
  id: number;
  email: string;
};

export async function login(email: string, password: string): Promise<User> {
  const response = await fetch(`${API_BASE}/api/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(`Sign in failed with status ${response.status}`);
  }
  return response.json();
}

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/** A failure the backend explained, in words meant for the user. */
export class ChatError extends Error {}

/**
 * Sends the conversation to the assistant, with the agreement as it stands.
 * `fresh` says the user chose this document in the message being sent.
 */
export async function converse(
  draft: Draft,
  messages: ChatMessage[],
  today: string,
  fresh: boolean,
): Promise<ChatTurn> {
  // The Mutual NDA has its own chat. The other one also helps choose a document.
  const [path, agreement] =
    draft.document === NDA
      ? ["/api/chat", { form: draft.form, settled: draft.settled }]
      : ["/api/draft", { document: draft.document, values: draft.values }];
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...agreement, today, fresh }),
  });
  if (!response.ok) {
    const detail: unknown = await response.json().then(
      (body) => body?.detail,
      () => undefined,
    );
    if (typeof detail === "string") throw new ChatError(detail);
    throw new Error(`Chat failed with status ${response.status}`);
  }
  return response.json();
}

let templates: Promise<Record<string, Template>> | undefined;

/** The agreement text of every document but the Mutual NDA, by document id. Fetched once. */
export function fetchTemplates(): Promise<Record<string, Template>> {
  // A file the build writes beside the page, not something the backend works out.
  templates ??= fetch("/templates.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Templates failed with status ${response.status}`);
      return response.json();
    })
    .catch((error) => {
      // A failure is not remembered, so that the next call tries again.
      templates = undefined;
      throw error;
    });
  return templates;
}
