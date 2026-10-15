import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CreateGoalSchema } from "@api-types";
import { createGoal, findStreamForUser } from "@server/domain/streams";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = CreateGoalSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  const stream = await findStreamForUser(parsed.data.listId, authResult.userId);
  if (!stream || stream.archivedAt) return jsonError("Stream not found", 404);

  const goal = await createGoal(stream.id, parsed.data.title);
  return jsonOk({ goal }, 201);
}
