"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AuthGate } from "@/components/auth-gate";
import { Brand } from "@/components/brand";
import { SignOutButton } from "@/components/sign-out-button";
import { NOT_LEGAL_ADVICE } from "@/lib/disclaimer";
import { useSession } from "@/lib/session";

const PAGES = [
  { href: "/", name: "New document", short: "New" },
  { href: "/documents/", name: "My documents", short: "Documents" },
];

/** The frame around every screen of the platform, for signed-in users only. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AuthGate>
      <div className="flex min-h-dvh flex-col">
        <Header />
        <div className="flex-1">{children}</div>
        <footer className="border-t border-rule bg-panel px-4 py-4 text-xs text-muted sm:px-6 print:hidden">
          {NOT_LEGAL_ADVICE}
        </footer>
      </div>
    </AuthGate>
  );
}

function Header() {
  const pathname = usePathname();
  const session = useSession();

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-rule bg-paper px-4 sm:gap-6 sm:px-6 print:hidden">
      <Brand compact />
      <nav aria-label="Main" className="flex h-full flex-1 items-stretch gap-1 sm:gap-2">
        {PAGES.map((page) => {
          const current = pathname === page.href || `${pathname}/` === page.href;
          return (
            <Link
              key={page.href}
              href={page.href}
              aria-label={page.name}
              aria-current={current ? "page" : undefined}
              className={`flex items-center border-b-2 px-2 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pen ${
                current ? "border-pen text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <span className="sm:hidden">{page.short}</span>
              <span className="max-sm:hidden">{page.name}</span>
            </Link>
          );
        })}
      </nav>
      <span className="truncate text-sm text-muted max-md:hidden">{session?.email}</span>
      <SignOutButton />
    </header>
  );
}
