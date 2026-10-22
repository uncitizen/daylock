import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { revokeApiKey } from "@server/domain/api-keys";

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const { id: keyId } = await params;
  const success = await revokeApiKey(authResult.userId, keyId);

  if (!success) {
    return jsonError("API key not found", 404);
  }

  return jsonOk({ message: "API key revoked successfully" });
}
