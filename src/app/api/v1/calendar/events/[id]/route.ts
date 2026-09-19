import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateCalendarEventSchema } from "@api-types";
import { updateEventAttentionMode } from "@server/integrations/google-calendar";
import { prisma } from "@server/db/client";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;

  const body = await req.json();
  const parsed = UpdateCalendarEventSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const result = await updateEventAttentionMode(
    authResult.userId,
    id,
    parsed.data.attentionMode,
  );
  if (result.count === 0) return jsonError("Not found", 404);

  const event = await prisma.calendarEventCache.findFirst({
    where: { id, userId: authResult.userId },
  });
  return jsonOk({ event });
}
