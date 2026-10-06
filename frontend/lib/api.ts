import { NDA } from "@/lib/documents";
import type { ChatTurn, Draft } from "@/lib/draft";
import type { Template } from "@/lib/template";

// The backend serves the built frontend, so the API is on the same origin except under `next dev`.
const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === "development" ? "http://localhost:8000" : "");

/** A failure the backend explained, in words meant for the user. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

let signedOut = () => {};

/** Has `listener` called whenever the backend says that nobody is signed in. */
export function onSignedOut(listener: () => void) {
  signedOut = listener;
}

/** Calls the backend as the signed-in user, sending `body` as JSON when there is one. */
async function request<Result>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<Result> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    // The session is a cookie, which has to be asked for when the API is on another port.
    credentials: "include",
    ...(body !== undefined && {
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  });
  if (response.ok) return response.status === 204 ? (undefined as Result) : response.json();
  // The session has ended, or the server has restarted and forgotten it.
  if (response.status === 401) signedOut();
  const detail: unknown = await response.json().then(
    (failure) => failure?.detail,
    () => undefined,
  );
  if (typeof detail === "string") throw new ApiError(detail, response.status);
  throw new Error(`${method} ${path} failed with status ${response.status}`);
}

export type User = {
  id: number;
  email: string;
};

/** The signed-in user. Fails when nobody is signed in. */
export const getMe = () => request<User>("/api/me");

export const signUp = (email: string, password: string) =>
  request<User>("/api/signup", { email, password });

export const signIn = (email: string, password: string) =>
  request<User>("/api/login", { email, password });

export const signOut = () => request<void>("/api/logout", undefined, "POST");

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

/**
 * Sends the conversation to the assistant, with the agreement as it stands.
 * `fresh` says the user chose this document in the message being sent.
 */
export function converse(
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
  return request(path, { messages, ...agreement, today, fresh });
}

/** What is kept of a document: the agreement, and the conversation about it. */
export type SavedState = {
  draft: Draft & { document: string };
  messages: ChatMessage[];
};

/** A saved document as it is listed. */
export type SavedSummary = {
  id: number;
  /** Which document it is, e.g. "mutual-nda". */
  document: string;
  /** The companies it is between, e.g. "Acme Inc. and Globex LLC". Empty until one is named. */
  parties: string;
  updatedAt: string;
};

export type SavedDocument = SavedSummary & SavedState;

/** The user's documents, the latest first. */
export const listDocuments = () => request<SavedSummary[]>("/api/documents");

export const openDocument = (id: number) => request<SavedDocument>(`/api/documents/${id}`);

/** Saves a new document, or over the one saved as `id`. */
export const saveDocument = (id: number | null, state: SavedState) =>
  id === null
    ? request<SavedSummary>("/api/documents", state)
    : request<SavedSummary>(`/api/documents/${id}`, state, "PUT");

export const deleteDocument = (id: number) =>
  request<void>(`/api/documents/${id}`, undefined, "DELETE");

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
