import { MembershipRole, WorkspaceType } from "@prisma/client";
import { prisma } from "../db/client";

/** Ensure a personal workspace + Inbox exist for a newly signed-in user. */
export async function ensurePersonalWorkspace(userId: string, userName?: string | null) {
  const existing = await prisma.membership.findFirst({
    where: { userId, workspace: { type: WorkspaceType.personal } },
    include: { workspace: { include: { lists: true } } },
  });

  if (existing) {
    const inbox = existing.workspace.lists.find((l) => l.isInbox);
    if (!inbox) {
      await prisma.list.create({
        data: {
          workspaceId: existing.workspaceId,
          name: "Inbox",
          isInbox: true,
          sortOrder: 0,
        },
      });
    }
    return existing.workspaceId;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: userName ? `${userName}'s Tasks` : "Personal",
      type: WorkspaceType.personal,
      memberships: {
        create: { userId, role: MembershipRole.owner },
      },
      lists: {
        create: { name: "Inbox", isInbox: true, sortOrder: 0 },
      },
    },
  });

  return workspace.id;
}

export async function userHasWorkspaceAccess(userId: string, workspaceId: string) {
  const m = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return Boolean(m);
}

export async function listWorkspacesForUser(userId: string) {
  return prisma.workspace.findMany({
    where: { memberships: { some: { userId } } },
    include: {
      memberships: {
        include: { user: { select: { id: true, name: true, email: true, image: true } } },
      },
      lists: { orderBy: { sortOrder: "asc" } },
      _count: { select: { lists: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

export async function createSharedWorkspace(userId: string, name: string) {
  return prisma.workspace.create({
    data: {
      name,
      type: WorkspaceType.shared,
      memberships: {
        create: { userId, role: MembershipRole.owner },
      },
      lists: {
        create: { name: "Shared Inbox", isInbox: true, sortOrder: 0 },
      },
    },
    include: { memberships: true, lists: true },
  });
}

/** Phase 3 stub: invite by email if user already exists; otherwise return pending payload. */
export async function inviteMemberByEmail(
  workspaceId: string,
  actorUserId: string,
  email: string,
  role: MembershipRole = MembershipRole.member,
) {
  const actor = await prisma.membership.findUnique({
    where: { workspaceId_userId: { workspaceId, userId: actorUserId } },
  });
  if (!actor || actor.role !== MembershipRole.owner) {
    throw new Error("FORBIDDEN");
  }

  const invitee = await prisma.user.findUnique({ where: { email } });
  if (!invitee) {
    return { status: "pending" as const, email, message: "User must sign in first; invite stored as stub." };
  }

  const membership = await prisma.membership.upsert({
    where: { workspaceId_userId: { workspaceId, userId: invitee.id } },
    create: { workspaceId, userId: invitee.id, role },
    update: { role },
  });

  return { status: "added" as const, membership };
}
