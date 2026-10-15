import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { AddShoppingItemSchema } from "@api-types";
import { addItem, findStore } from "@server/domain/shopping";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = AddShoppingItemSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);
  if (parsed.data.storeId && !(await findStore(parsed.data.storeId, authResult.userId))) {
    return jsonError("Store not found", 404);
  }

  const item = await addItem(authResult.userId, parsed.data);
  return jsonOk({ item }, 201);
}
