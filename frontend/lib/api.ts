import type { NdaChanges, NdaForm } from "@/lib/nda";

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

export type ChatTurn = {
  reply: string;
  /** The fields the assistant filled in from the user's message. */
  changes: NdaChanges;
  /** The defaults the user has agreed to keep. Sent back with the next message. */
  settled: string[];
};

/** A failure the backend explained, in words meant for the user. */
export class ChatError extends Error {}

export async function chat(
  messages: ChatMessage[],
  form: NdaForm,
  settled: string[],
  today: string,
): Promise<ChatTurn> {
  const response = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, form, settled, today }),
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
