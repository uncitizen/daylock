import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateStreamSchema } from "@api-types";
import { archiveStream, findStreamForUser, updateStream } from "@server/domain/streams";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  const stream = await findStreamForUser(id, authResult.userId);
  if (!stream || stream.archivedAt) return jsonError("Not found", 404);

  const parsed = UpdateStreamSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const { archived, ...fields } = parsed.data;
  if (archived) {
    await archiveStream(id);
    return jsonOk({ archived: true });
  }
  return jsonOk({ stream: await updateStream(id, fields) });
}
