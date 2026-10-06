import { useEffect, useSyncExternalStore } from "react";
import { getMe, onSignedOut, type User } from "@/lib/api";

/** The signed-in user, null when nobody is signed in, or undefined while that isn't known yet. */
export type Session = User | null | undefined;

// The browser holds the session in a cookie that scripts cannot read, so the backend is asked.
let session: Session;
let asking = false;
let ended = false;

const listeners = new Set<() => void>();

function set(next: Session) {
  session = next;
  for (const listener of listeners) listener();
}

export function getSession(): Session {
  return session;
}

export function setSession(user: User) {
  ended = false;
  set(user);
}

export function clearSession() {
  ended = false;
  set(null);
}

/** Whether the user was signed out without asking, as happens when the server restarts. */
export function sessionEnded(): boolean {
  return ended;
}

onSignedOut(() => {
  // While asking who is signed in, "nobody" is an answer, which `ask` deals with.
  if (asking) return;
  ended = Boolean(session);
  set(null);
});

/** Finds out who is signed in, unless that is known or being found out already. */
function ask() {
  if (session !== undefined || asking) return;
  asking = true;
  getMe()
    .then(
      // Signing in or out in the meantime settles it.
      (user) => session === undefined && set(user),
      () => session === undefined && set(null),
    )
    .finally(() => {
      asking = false;
    });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The session, which is undefined while prerendering and until the backend has answered. */
export function useSession(): Session {
  useEffect(ask, []);
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}
