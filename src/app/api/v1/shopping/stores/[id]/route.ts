import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateShoppingStoreSchema } from "@api-types";
import { archiveStore, findStore, moveStore, updateStore } from "@server/domain/shopping";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  if (!(await findStore(id, authResult.userId))) return jsonError("Not found", 404);

  const parsed = UpdateShoppingStoreSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  if (parsed.data.archived) {
    await archiveStore(id);
    return jsonOk({ archived: true });
  }
  if (parsed.data.move) await moveStore(authResult.userId, id, parsed.data.move);
  if (parsed.data.name) await updateStore(id, { name: parsed.data.name });
  return jsonOk({ ok: true });
}
