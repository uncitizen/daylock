import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { ClearShoppingSchema } from "@api-types";
import { clearChecked } from "@server/domain/shopping";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = ClearShoppingSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError(parsed.error.message);

  const { count } = await clearChecked(authResult.userId, parsed.data.storeId);
  return jsonOk({ cleared: count });
}
