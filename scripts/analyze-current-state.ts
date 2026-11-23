import { prisma } from "../server/db/client";

async function main() {
  console.log("=== ANALYZING CURRENT STATE ===\n");

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  console.log("Users:");
  console.log(JSON.stringify(users, null, 2));
  console.log();

  // Get all workspaces and their memberships
  const workspaces = await prisma.workspace.findMany({
    include: {
      memberships: {
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      },
      _count: {
        select: {
          lists: true,
          shoppingStores: true,
          shoppingItems: true,
        },
      },
    },
  });

  console.log("Workspaces:");
  for (const ws of workspaces) {
    console.log({
      id: ws.id,
      name: ws.name,
      type: ws.type,
      members: ws.memberships.map((m) => ({
        email: m.user.email,
        role: m.role,
      })),
      counts: ws._count,
    });
    console.log();
  }

  // Get lists and task counts per workspace
  for (const ws of workspaces) {
    const lists = await prisma.list.findMany({
      where: { workspaceId: ws.id },
      include: {
        _count: {
          select: {
            tasks: true,
            goals: true,
          },
        },
      },
    });

    console.log(`Lists in workspace "${ws.name}" (${ws.id}):`);
    for (const list of lists) {
      console.log({
        name: list.name,
        isInbox: list.isInbox,
        taskCount: list._count.tasks,
        goalCount: list._count.goals,
        archived: list.archivedAt !== null,
      });
    }
    console.log();
  }

  // Shopping stores and items per workspace
  for (const ws of workspaces) {
    const stores = await prisma.shoppingStore.findMany({
      where: { workspaceId: ws.id },
      include: {
        _count: {
          select: {
            items: true,
          },
        },
      },
    });

    console.log(`Shopping stores in workspace "${ws.name}" (${ws.id}):`);
    for (const store of stores) {
      console.log({
        name: store.name,
        itemCount: store._count.items,
        archived: store.archivedAt !== null,
      });
    }

    const items = await prisma.shoppingItem.count({
      where: { workspaceId: ws.id },
    });
    console.log(`Total shopping items in workspace: ${items}`);
    console.log();
  }

  // Task counts per user (via task creation tracking)
  console.log("Task overview:");
  const totalTasks = await prisma.task.count();
  console.log(`Total tasks in system: ${totalTasks}`);
  console.log();

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
