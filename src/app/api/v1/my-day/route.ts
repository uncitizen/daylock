import { format } from "date-fns";
import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { getMyDay, patchMyDay } from "@server/domain/my-day";
import { MyDayPatchSchema } from "@api-types";

export async function GET(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date") ?? format(new Date(), "yyyy-MM-dd");
  const date = new Date(dateStr + "T00:00:00");
  const data = await getMyDay(authResult.userId, date);
  return jsonOk(data);
}

export async function PATCH(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const parsed = MyDayPatchSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const data = await patchMyDay(authResult.userId, parsed.data);
  return jsonOk(data);
}
