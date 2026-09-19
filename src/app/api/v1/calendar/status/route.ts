import { requireUser, jsonOk } from "@/lib/api";
import { hasCalendarConnection } from "@server/integrations/google-calendar";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const status = await hasCalendarConnection(authResult.userId);
  return jsonOk(status);
}
