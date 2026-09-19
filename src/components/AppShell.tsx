"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

const links = [
  { href: "/", label: "My Day" },
  { href: "/inbox", label: "Inbox" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data } = useSession();

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-16 pt-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-line pb-4">
        <div>
          <p className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-ink">
            Daylock
          </p>
          <p className="mt-1 text-sm text-muted">My Day + Inbox. That’s it.</p>
        </div>
        <div className="flex items-center gap-3 text-sm text-muted">
          <span className="hidden sm:inline">{data?.user?.email}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded border border-line bg-paper-2 px-2 py-1 text-ink hover:bg-line/40"
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="mb-6 flex gap-1">
        {links.map((l) => {
          const active = pathname === l.href;
          return (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded px-4 py-2 text-sm font-medium transition ${
                active
                  ? "bg-ink text-paper"
                  : "text-muted hover:bg-paper-2 hover:text-ink"
              }`}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>

      <main className="flex-1">{children}</main>
    </div>
  );
}
