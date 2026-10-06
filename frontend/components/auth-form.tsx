"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Brand } from "@/components/brand";
import { ApiError, signIn, signUp } from "@/lib/api";
import { NOT_LEGAL_ADVICE } from "@/lib/disclaimer";
import { sessionEnded, setSession, useSession } from "@/lib/session";
import {
  buttonClass,
  cardClass,
  errorClass,
  inputClass,
  linkClass,
  noticeClass,
} from "@/lib/styles";

// What the backend accepts, so that it is the browser that says what is wrong.
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128;
const EMAIL = "[^@\\s]+@[^@\\s]+\\.[^@\\s]+";

const MODES = {
  "sign-in": {
    title: "Welcome back",
    intro: "Sign in to carry on with your agreements.",
    submit: signIn,
    action: "Sign in",
    working: "Signing in…",
    password: "current-password",
    failed: "We couldn’t sign you in. Please try again.",
    other: { question: "New to Prelegal?", href: "/signup/", action: "Create an account" },
  },
  "sign-up": {
    title: "Create your account",
    intro: "Draft your first agreement in minutes.",
    submit: signUp,
    action: "Create account",
    working: "Creating your account…",
    password: "new-password",
    failed: "We couldn’t create your account. Please try again.",
    other: { question: "Already have an account?", href: "/login/", action: "Sign in" },
  },
} as const;

const POINTS = [
  "Eleven standard agreements, from NDAs to cloud service terms",
  "An assistant that asks for what it needs and fills in the rest",
  "A PDF to download, and every draft kept for when you come back",
];

/** The screen for signing in, or for creating an account. */
export function AuthForm({ mode }: { mode: keyof typeof MODES }) {
  const { title, intro, submit, action, working, password: autoComplete, failed, other } = MODES[mode];
  const router = useRouter();
  const session = useSession();
  const emailId = useId();
  const passwordId = useId();
  const hintId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (session) router.replace("/");
  }, [session, router]);

  async function send(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      // Being signed in moves on to the platform, through the effect above.
      setSession(await submit(email, password));
    } catch (failure) {
      setError(failure instanceof ApiError ? failure.message : failed);
      setPending(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <aside className="flex flex-col justify-between gap-10 bg-ink px-6 py-8 text-white max-lg:hidden xl:px-12 xl:py-12">
        <Brand />
        <div>
          <p className="font-serif text-4xl leading-tight font-medium tracking-tight">
            Legal agreements, drafted in a conversation.
          </p>
          <ul className="mt-8 space-y-3 text-sm text-white/80">
            {POINTS.map((point) => (
              <li key={point} className="flex gap-3">
                <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-white/60" />
                {point}
              </li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-white/60">Built on the Common Paper standard agreements.</p>
      </aside>

      <main className="flex flex-col items-center justify-center gap-6 px-4 py-10">
        <div className="lg:hidden">
          <Brand />
        </div>
        <form onSubmit={send} className={`${cardClass} w-full max-w-sm space-y-5 p-6 sm:p-8`}>
          <div>
            <h1 className="font-serif text-3xl font-medium tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted">{intro}</p>
          </div>

          {mode === "sign-in" && sessionEnded() && !error && (
            <p role="status" className={noticeClass}>
              Your session has ended. Sign in again to continue.
            </p>
          )}

          <div>
            <label htmlFor={emailId} className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id={emailId}
              type="email"
              required
              autoComplete="email"
              pattern={EMAIL}
              title="An email address, like you@company.com"
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
              required
              minLength={mode === "sign-up" ? MIN_PASSWORD : undefined}
              maxLength={MAX_PASSWORD}
              autoComplete={autoComplete}
              aria-describedby={mode === "sign-up" ? hintId : undefined}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className={inputClass}
            />
            {mode === "sign-up" && (
              <p id={hintId} className="mt-1 text-xs text-muted">
                At least {MIN_PASSWORD} characters.
              </p>
            )}
          </div>

          {error && (
            <p role="alert" className={errorClass}>
              {error}
            </p>
          )}

          <button type="submit" disabled={pending} className={`${buttonClass} w-full`}>
            {pending ? working : action}
          </button>

          <p className="text-center text-sm text-muted">
            {other.question}{" "}
            <Link href={other.href} className={linkClass}>
              {other.action}
            </Link>
          </p>
        </form>
        <p className="max-w-sm text-center text-xs text-muted">{NOT_LEGAL_ADVICE}</p>
      </main>
    </div>
  );
}
