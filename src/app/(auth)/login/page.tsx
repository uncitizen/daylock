import { connection } from "next/server";
import { devLoginEnabled } from "@/lib/auth-policy";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // Read the dev-login flag at request time, not build time.
  await connection();
  return <LoginForm devLogin={devLoginEnabled()} />;
}
