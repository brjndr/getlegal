/** The product's name beside its mark. */
export function Brand({ compact = false }: { /** Leaves the name out on a phone. */ compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2 font-serif text-xl font-medium tracking-tight">
      <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 shrink-0">
        <rect width="24" height="24" rx="6" className="fill-pen" />
        <path
          d="M8 6.5h5.5l3 3v8H8z M10.5 12.5h3.5 M10.5 15h3.5"
          fill="none"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className={compact ? "max-sm:sr-only" : undefined}>Prelegal</span>
    </span>
  );
}

/** Shown in place of a screen that is not ready yet. */
export function Loading({ children }: { children: string }) {
  return (
    <p role="status" className="flex items-center justify-center gap-3 py-16 text-sm text-muted">
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-rule border-t-pen"
      />
      {children}
    </p>
  );
}
