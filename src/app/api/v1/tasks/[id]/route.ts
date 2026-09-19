import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateTaskSchema } from "@api-types";
import { getTaskForUser, trashTask, updateTask } from "@server/domain/tasks";

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
