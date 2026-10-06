"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { inputClass } from "@/components/nda-form";
import { login } from "@/lib/api";
import { setSession, useSession } from "@/lib/session";

export function LoginForm() {
  const router = useRouter();
  const session = useSession();
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  async function signIn(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFailed(false);
    try {
      const user = await login(email, password);
      // Signing in moves on to the platform through the effect above.
      setSession(user.email);
    } catch {
      setFailed(true);
      setPending(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <form
        onSubmit={signIn}
        className="w-full max-w-sm space-y-5 rounded-lg border border-rule bg-panel p-6 sm:p-8"
      >
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight">Prelegal</h1>
          <p className="mt-1 text-sm text-muted">Sign in to draft your legal agreements.</p>
        </div>

        <div>
          <label htmlFor={emailId} className="mb-1 block text-sm font-medium">
            Email
          </label>
          <input
            id={emailId}
            type="email"
            required
            autoComplete="email"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={inputClass}
          />
        </div>

        <div>
          <label htmlFor={passwordId} className="mb-1 block text-sm font-medium">
            Password
          </label>
          <input
            id={passwordId}
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={inputClass}
          />
          <p className="mt-1 text-xs text-muted">
            Accounts are coming soon. For now, any password works.
          </p>
        </div>

        {failed && (
          <p role="alert" className="text-sm text-red-700">
            We couldn’t sign you in. Check your email address and try again.
          </p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-md bg-pen px-4 py-2 text-sm font-semibold text-white hover:bg-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}
