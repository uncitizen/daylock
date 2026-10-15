import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { PickForTodaySchema } from "@api-types";
import { pickForToday } from "@server/domain/streams";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = PickForTodaySchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const { date, count, swapTaskId } = parsed.data;
  const result = await pickForToday(authResult.userId, new Date(date + "T00:00:00"), {
    count,
    swapTaskId,
  });
  return jsonOk(result);
}
