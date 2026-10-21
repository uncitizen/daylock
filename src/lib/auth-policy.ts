/**
 * Who may sign in. Edge-safe (no Prisma / Node-only imports) so both
 * auth.config.ts (middleware) and auth.ts can share it.
 */

/**
 * Passwordless dev login is off unless explicitly enabled in development mode.
 * Requires NODE_ENV to be exactly "development" — fail closed on unset, "test",
 * or non-canonical values like "prod".
 */
export function devLoginEnabled(): boolean {
  return (
    process.env.AUTH_DEV_LOGIN === "1" &&
    process.env.NODE_ENV === "development"
  );
}

function allowedEmails(): Set<string> {
  return new Set(
    (process.env.AUTH_ALLOWED_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

/**
 * Google sign-ins must match AUTH_ALLOWED_EMAILS. An empty list denies
 * everyone in production and allows anyone elsewhere.
 */
export function isEmailAllowed(email: string | null | undefined): boolean {
  if (!email) return false;
  const allowed = allowedEmails();
  if (allowed.size === 0) return process.env.NODE_ENV !== "production";
  return allowed.has(email.toLowerCase());
}
