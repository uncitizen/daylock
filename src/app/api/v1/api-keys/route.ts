import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { createApiKey, listApiKeys } from "@server/domain/api-keys";
import { z } from "zod";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
  expiresInDays: z.number().int().positive().max(365).optional(),
});

export async function GET(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const keys = await listApiKeys(authResult.userId);
  return jsonOk({ keys });
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const parsed = CreateApiKeySchema.safeParse(body);

  if (!parsed.success) {
    return jsonError(parsed.error.message, 400);
  }

  const apiKey = await createApiKey(
    authResult.userId,
    parsed.data.name,
    parsed.data.expiresInDays,
  );

  return jsonOk(
    {
      apiKey: {
        id: apiKey.id,
        key: apiKey.key, // Only returned once!
        prefix: apiKey.prefix,
        name: apiKey.name,
        createdAt: apiKey.createdAt,
        expiresAt: apiKey.expiresAt,
      },
      warning: "Save this key now - it will not be shown again!",
    },
    201,
  );
}
