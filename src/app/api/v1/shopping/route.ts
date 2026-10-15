import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { getShoppingList } from "@server/domain/shopping";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  try {
    return jsonOk(await getShoppingList(authResult.userId));
  } catch (e) {
    if (e instanceof Error && e.message === "WORKSPACE_MISSING") {
      return jsonError("Workspace not found", 404);
    }
    throw e;
  }
}
