import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CompleteTaskSchema } from "@api-types";
import { completeFlexTask, completeOccurrence, getTaskForUser } from "@server/domain/tasks";
import { prisma } from "@server/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = CompleteTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  if (parsed.data.occurrenceId) {
    const occ = await prisma.taskOccurrence.findFirst({
      where: {
        id: parsed.data.occurrenceId,
        taskId: id,
        task: { list: { workspace: { memberships: { some: { userId: authResult.userId } } } } },
      },
    });
    if (!occ) return jsonError("Occurrence not found", 404);
    const occurrence = await completeOccurrence(occ.id);
    return jsonOk({ occurrence });
  }

  const task = await getTaskForUser(id, authResult.userId);
  if (!task) return jsonError("Not found", 404);
  const updated = await completeFlexTask(id);
  return jsonOk({ task: updated });
}
