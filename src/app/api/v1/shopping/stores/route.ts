import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CreateShoppingStoreSchema } from "@api-types";
import { createPresetStores, createStore } from "@server/domain/shopping";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = CreateShoppingStoreSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  if ("presets" in parsed.data) {
    return jsonOk({ created: await createPresetStores(authResult.userId) }, 201);
  }
  return jsonOk({ store: await createStore(authResult.userId, parsed.data.name) }, 201);
}
