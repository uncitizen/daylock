"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("dev@localhost");
  const [name, setName] = useState("Dev User");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const googleConfigured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_AUTH);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await signIn("credentials", {
      email,
      name,
      callbackUrl: "/",
      redirect: false,
    });
    setLoading(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    window.location.href = "/";
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="mb-8">
        <h1 className="font-[family-name:var(--font-display)] text-4xl font-semibold tracking-tight">
          Daylock
        </h1>
        <p className="mt-2 text-muted">
          My Day for today. One Inbox for everything else.
        </p>
      </div>

      <div className="space-y-4 border border-line bg-paper/80 p-6">
        <button
          type="button"
          className="w-full rounded bg-ink px-4 py-3 text-paper"
          onClick={() => signIn("google", { callbackUrl: "/" })}
        >
          Continue with Google
        </button>
        <p className="text-center text-xs text-muted">
          {googleConfigured
            ? "Uses Google for sign-in and calendar sync."
            : "Google OAuth optional — configure AUTH_GOOGLE_ID / SECRET, or use dev login below."}
        </p>

        <div className="relative py-2 text-center text-xs text-muted">
          <span className="bg-paper px-2">or local dev login</span>
          <div className="absolute inset-x-0 top-1/2 -z-10 border-t border-line" />
        </div>

        <form onSubmit={devLogin} className="space-y-3">
          <input
            className="w-full rounded border border-line bg-paper px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
          />
          <input
            className="w-full rounded border border-line bg-paper px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            type="email"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded border border-line px-4 py-2"
          >
            {loading ? "Signing in…" : "Dev sign in"}
          </button>
        </form>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
