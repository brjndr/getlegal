import { useSyncExternalStore } from "react";

// There is no authentication yet: the session is just the email the user signed in with.
const KEY = "prelegal.user";

const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

/** The signed-in user's email, or null when nobody is signed in. */
export function getSession(): string | null {
  return localStorage.getItem(KEY);
}

export function setSession(email: string) {
  localStorage.setItem(KEY, email);
  notify();
}

export function clearSession() {
  localStorage.removeItem(KEY);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Fires when another tab signs in or out.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** The session, or undefined while prerendering and hydrating, when it isn't known yet. */
export function useSession(): string | null | undefined {
  return useSyncExternalStore(subscribe, getSession, () => undefined);
}
