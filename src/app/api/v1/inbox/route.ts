import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { listInboxTasks } from "@server/domain/tasks";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  try {
    const data = await listInboxTasks(authResult.userId);
    return jsonOk(data);
  } catch (e) {
    if (e instanceof Error && e.message === "INBOX_MISSING") {
      return jsonError("Inbox not found", 404);
    }
    throw e;
  }
}
