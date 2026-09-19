import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

/**
 * Edge-safe auth config (no Prisma / Node-only imports).
 * Used by middleware. Full auth (adapter, token upsert) lives in auth.ts.
 */
export const authConfig: NextAuthConfig = {
  session: { strategy: "jwt" },
  providers: [
    ...(googleConfigured
      ? [
          Google({
            clientId: process.env.AUTH_GOOGLE_ID!,
            clientSecret: process.env.AUTH_GOOGLE_SECRET!,
            authorization: {
              params: {
                scope: [
                  "openid",
                  "email",
                  "profile",
                  "https://www.googleapis.com/auth/calendar.events",
                ].join(" "),
                access_type: "offline",
                prompt: "consent",
              },
            },
          }),
        ]
      : []),
    Credentials({
      name: "Dev Login",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      // Real authorize runs in Node via auth.ts callbacks / route handlers.
      // Edge middleware only needs the provider registered for type/config.
      authorize: () => null,
    }),
  ],
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request }) {
      const path = request.nextUrl.pathname;
      const isAuthPage = path.startsWith("/login");
      const isApi = path.startsWith("/api/");
      const isPublic =
        isAuthPage ||
        path.startsWith("/api/auth") ||
        path.startsWith("/api/v1/jobs") ||
        path.startsWith("/sw.js") ||
        path.startsWith("/icons") ||
        path.startsWith("/manifest");

      // Let API route handlers return JSON 401 via requireUser()
      if (isApi) return true;
      if (isPublic) return true;
      return !!auth?.user;
    },
    async jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.sub) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
};
