import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CreateStreamSchema } from "@api-types";
import {
  createPresetStreams,
  createStream,
  getStreamOptions,
  getStreamsBoard,
} from "@server/domain/streams";

export async function GET(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  if (url.searchParams.get("options") === "1") {
    try {
      return jsonOk(await getStreamOptions(authResult.userId));
    } catch (e) {
      if (e instanceof Error && (e.message === "INBOX_MISSING" || e.message === "WORKSPACE_MISSING")) {
        return jsonError("Workspace not found", 404);
      }
      throw e;
    }
  }
  const dateStr = url.searchParams.get("date");
  const date = dateStr ? new Date(dateStr + "T00:00:00") : new Date();
  if (Number.isNaN(date.getTime())) return jsonError("Invalid date");

  try {
    return jsonOk(await getStreamsBoard(authResult.userId, date));
  } catch (e) {
    if (e instanceof Error && (e.message === "INBOX_MISSING" || e.message === "WORKSPACE_MISSING")) {
      return jsonError("Workspace not found", 404);
    }
    throw e;
  }
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const parsed = CreateStreamSchema.safeParse(await req.json());
  if (!parsed.success) return jsonError(parsed.error.message);

  if ("presets" in parsed.data) {
    const created = await createPresetStreams(authResult.userId);
    return jsonOk({ created }, 201);
  }
  const stream = await createStream(authResult.userId, parsed.data);
  return jsonOk({ stream }, 201);
}
