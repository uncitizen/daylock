import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CreateWorkspaceSchema } from "@api-types";
import { createSharedWorkspace, listWorkspacesForUser } from "@server/domain/workspaces";

export async function GET() {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const workspaces = await listWorkspacesForUser(authResult.userId);
  return jsonOk({ workspaces });
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const parsed = CreateWorkspaceSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const workspace = await createSharedWorkspace(authResult.userId, parsed.data.name);
  return jsonOk({ workspace }, 201);
}
