import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { listCalendarEvents } from "@server/integrations/google-calendar";

export async function GET(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to) return jsonError("from and to required (ISO dates)");

  const events = await listCalendarEvents(
    authResult.userId,
    new Date(from),
    new Date(to),
  );
  return jsonOk({ events });
}
