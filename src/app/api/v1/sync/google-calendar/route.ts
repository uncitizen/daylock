import { requireUser, jsonOk } from "@/lib/api";
import { syncGoogleCalendar } from "@server/integrations/google-calendar";

export async function POST() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const result = await syncGoogleCalendar(authResult.userId);
  return jsonOk(result);
}
