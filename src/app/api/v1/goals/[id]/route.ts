import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateGoalSchema } from "@api-types";
import { findGoalForUser, updateGoal } from "@server/domain/streams";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  const goal = await findGoalForUser(id, authResult.userId);
  if (!goal || goal.archivedAt) return jsonError("Not found", 404);

  const parsed = UpdateGoalSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  return jsonOk({ goal: await updateGoal(id, parsed.data) });
}
