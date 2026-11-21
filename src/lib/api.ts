import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { validateApiKey } from "@server/domain/api-keys";
import { auth } from "./auth";

export async function requireUser() {
  const headerList = await headers();
  const authorization = headerList.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice(7).trim();
    if (token.startsWith("mcp_")) {
      const userId = await validateApiKey(token);
      if (!userId) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
      }
      return { userId, session: null };
    }
  }

  const session = await auth();
  if (!session?.user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { userId: session.user.id, session };
}

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}
