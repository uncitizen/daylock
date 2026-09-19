import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { SkipOccurrenceSchema } from "@api-types";
import { skipOccurrence } from "@server/domain/tasks";
import { prisma } from "@server/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = SkipOccurrenceSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const occ = await prisma.taskOccurrence.findFirst({
    where: {
      id,
      task: {
        list: { workspace: { memberships: { some: { userId: authResult.userId } } } },
      },
    },
  });
  if (!occ) return jsonError("Not found", 404);

  try {
    const occurrence = await skipOccurrence(id, {
      action: parsed.data.action,
      reason: parsed.data.reason,
      deferDays: parsed.data.deferDays,
    });
    return jsonOk({ occurrence });
  } catch (e) {
    if (e instanceof Error && e.message === "HARD_OCCURRENCE") {
      return jsonError("This occurrence is unskippable", 403);
    }
    throw e;
  }
}
