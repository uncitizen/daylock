import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "../../server/db/client";
import { ensurePersonalWorkspace } from "../../server/domain/workspaces";
import { upsertGoogleCalendarTokens } from "../../server/integrations/google-calendar";
import { authConfig } from "./auth.config";
import { devLoginEnabled, isEmailAllowed } from "./auth-policy";

const googleConfigured = Boolean(
  process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET,
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
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
    ...(devLoginEnabled()
      ? [
          Credentials({
            name: "Dev Login",
            credentials: {
              email: { label: "Email", type: "email", value: "dev@localhost" },
              name: { label: "Name", type: "text", value: "Dev User" },
            },
            async authorize(credentials) {
              if (!devLoginEnabled()) return null;
              const email = (credentials?.email as string) || "dev@localhost";
              const name = (credentials?.name as string) || "Dev User";
              const user = await prisma.user.upsert({
                where: { email },
                create: { email, name },
                update: { name },
              });
              await ensurePersonalWorkspace(user.id, user.name);
              return { id: user.id, email: user.email, name: user.name };
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider === "google") {
        // Debug: log the profile to see what Google returns
        console.log("[AUTH] Google sign-in attempt:", {
          email: user.email,
          email_verified: profile?.email_verified,
          email_verified_type: typeof profile?.email_verified,
        });

        // Accept boolean true or string "true"
        const emailVerified = profile?.email_verified === true || profile?.email_verified === "true";
        
        if (!emailVerified || !isEmailAllowed(user.email)) {
          console.log("[AUTH] Sign-in rejected:", {
            email_verified_check: emailVerified,
            allowlist_check: isEmailAllowed(user.email),
          });
          return false;
        }
      } else if (!(account?.provider === "credentials" && devLoginEnabled())) {
        return false;
      }
      if (user.id) {
        await ensurePersonalWorkspace(user.id, user.name);
      }
      if (account?.provider === "google" && user.id) {
        await upsertGoogleCalendarTokens(user.id, {
          access_token: account.access_token,
          refresh_token: account.refresh_token,
          expiry_date: account.expires_at ? account.expires_at * 1000 : null,
          scope: account.scope,
        });
        if (account.providerAccountId) {
          await prisma.user.update({
            where: { id: user.id },
            data: { googleSubject: account.providerAccountId },
          });
        }
      }
      return true;
    },
  },
});
