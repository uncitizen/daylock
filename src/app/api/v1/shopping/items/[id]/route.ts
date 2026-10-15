import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { UpdateShoppingItemSchema } from "@api-types";
import { deleteItem, findItem, findStore, updateItem } from "@server/domain/shopping";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  if (!(await findItem(id, authResult.userId))) return jsonError("Not found", 404);

  const parsed = UpdateShoppingItemSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  if (parsed.data.storeId && !(await findStore(parsed.data.storeId, authResult.userId))) {
    return jsonError("Store not found", 404);
  }

  return jsonOk({ item: await updateItem(id, parsed.data) });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;
  if (!(await findItem(id, authResult.userId))) return jsonError("Not found", 404);
  await deleteItem(id);
  return jsonOk({ deleted: true });
}
