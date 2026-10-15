import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateTaskSchema } from "@api-types";
import { getTaskForUser, trashTask, updateTask } from "@server/domain/tasks";
import { findGoalForUser, findListForUser } from "@server/domain/streams";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  const task = await getTaskForUser(id, authResult.userId);
  if (!task) return jsonError("Not found", 404);
  return jsonOk({ task });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  const existing = await getTaskForUser(id, authResult.userId);
  if (!existing) return jsonError("Not found", 404);

  const body = await req.json();
  const parsed = UpdateTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const targetListId = parsed.data.listId ?? existing.listId;
  if (parsed.data.listId && !(await findListForUser(parsed.data.listId, authResult.userId))) {
    return jsonError("List not found", 404);
  }
  if (parsed.data.goalId) {
    const goal = await findGoalForUser(parsed.data.goalId, authResult.userId);
    if (!goal || goal.listId !== targetListId) return jsonError("Goal not found", 404);
  }

  const task = await updateTask(id, parsed.data);
  return jsonOk({ task });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  const existing = await getTaskForUser(id, authResult.userId);
  if (!existing) return jsonError("Not found", 404);
  if (existing.archivedAt) return jsonOk({ task: existing });

  const task = await trashTask(id);
  return jsonOk({ task });
}
