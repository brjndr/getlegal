"use client";

import { useRouter } from "next/navigation";
import { clearSession } from "@/lib/session";

export function SignOutButton() {
  const router = useRouter();

  function signOut() {
    clearSession();
    router.replace("/login");
  }

  return (
    <button
      type="button"
      onClick={signOut}
      className="rounded-md px-2 py-2 text-sm font-medium text-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen"
    >
      Sign out
    </button>
  );
}
