"use client";

import { useState } from "react";
import { signOut } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { plainButtonClass } from "@/lib/styles";

export function SignOutButton() {
  const [pending, setPending] = useState(false);

  async function leave() {
    setPending(true);
    try {
      await signOut();
      // With nobody signed in, the gate around the platform shows the login screen.
      clearSession();
    } catch {
      // Still signed in: the browser keeps its session until the backend ends it.
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={leave}
      disabled={pending}
      className={plainButtonClass}
    >
      Sign out
    </button>
  );
}
