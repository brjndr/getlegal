"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Loading } from "@/components/brand";
import { useSession } from "@/lib/session";

/** Shows its children to signed-in users and sends everyone else to the login screen. */
export function AuthGate({ children }: { children: ReactNode }) {
  const session = useSession();
  const router = useRouter();

  useEffect(() => {
    if (session === null) router.replace("/login");
  }, [session, router]);

  if (session) return children;
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <Loading>Opening Prelegal…</Loading>
    </main>
  );
}
