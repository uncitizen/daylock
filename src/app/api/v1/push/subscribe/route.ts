import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { PushSubscribeSchema } from "@api-types";
import { savePushSubscription } from "@server/domain/alarms";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const parsed = PushSubscribeSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const sub = await savePushSubscription(
    authResult.userId,
    parsed.data.endpoint,
    parsed.data.keys.p256dh,
    parsed.data.keys.auth,
  );
  return jsonOk({ subscription: { id: sub.id } }, 201);
}
