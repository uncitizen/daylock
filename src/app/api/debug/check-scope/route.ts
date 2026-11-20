import { requireUser, jsonOk } from "@/lib/api";
import { prisma } from "@server/db/client";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const token = await prisma.googleCalendarToken.findUnique({
    where: { userId: authResult.userId },
    select: { scope: true, accessToken: true },
  });

  return jsonOk({
    hasToken: !!token,
    scope: token?.scope ?? null,
    hasAccessToken: !!token?.accessToken,
    scopes: token?.scope?.split(" ") ?? [],
  });
}
