import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { InviteMemberSchema } from "@api-types";
import { inviteMemberByEmail } from "@server/domain/workspaces";
import { MembershipRole } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;

  const body = await req.json();
  const parsed = InviteMemberSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  try {
    const result = await inviteMemberByEmail(
      id,
      authResult.userId,
      parsed.data.email,
      parsed.data.role === "owner" ? MembershipRole.owner : MembershipRole.member,
    );
    return jsonOk(result);
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return jsonError("Forbidden", 403);
    }
    throw e;
  }
}
