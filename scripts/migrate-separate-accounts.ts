/**
 * Migration: Separate user accounts while keeping shopping list shared
 * 
 * BEFORE RUNNING:
 * 1. Backup your database: pg_dump your_database > backup.sql
 * 2. Set DATABASE_URL environment variable
 * 3. Review the DRY_RUN output first
 * 
 * USAGE:
 *   DATABASE_URL="..." npx tsx scripts/migrate-separate-accounts.ts
 *   DATABASE_URL="..." DRY_RUN=false npx tsx scripts/migrate-separate-accounts.ts
 */

import { prisma } from "../server/db/client";
import { WorkspaceType, MembershipRole } from "@prisma/client";

const DRY_RUN = process.env.DRY_RUN !== "false";

interface MigrationPlan {
  currentSharedWorkspace: {
    id: string;
    name: string;
    userCount: number;
  };
  users: Array<{
    id: string;
    email: string;
    name: string | null;
  }>;
  newWorkspaces: Array<{
    userId: string;
    userName: string;
    workspaceName: string;
  }>;
  dataToMigrate: {
    lists: number;
    tasks: number;
    goals: number;
    shoppingStores: number;
    shoppingItems: number;
  };
  strategy: string;
}

async function analyzeCurrent(): Promise<MigrationPlan> {
  console.log("🔍 Analyzing current state...\n");

  const sharedWorkspaceId = process.env.AUTH_SHARED_WORKSPACE_ID?.trim();
  
  let sharedWorkspace;
  let users;

  if (sharedWorkspaceId) {
    sharedWorkspace = await prisma.workspace.findUnique({
      where: { id: sharedWorkspaceId },
      include: {
        memberships: {
          include: {
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        },
      },
    });

    if (!sharedWorkspace) {
      throw new Error(`AUTH_SHARED_WORKSPACE_ID workspace not found: ${sharedWorkspaceId}`);
    }

    users = sharedWorkspace.memberships.map(m => m.user);
  } else {
    const memberships = await prisma.membership.findMany({
      where: {
        workspace: { type: WorkspaceType.personal },
      },
      include: {
        user: {
          select: { id: true, email: true, name: true },
        },
        workspace: true,
      },
    });

    if (memberships.length === 0) {
      throw new Error("No personal workspace found. Cannot determine shared workspace.");
    }

    const workspaceGroups = new Map<string, typeof memberships>();
    for (const m of memberships) {
      const ws = m.workspace.id;
      if (!workspaceGroups.has(ws)) {
        workspaceGroups.set(ws, []);
      }
      workspaceGroups.get(ws)!.push(m);
    }

    const sharedWorkspaces = Array.from(workspaceGroups.values()).filter(g => g.length > 1);
    if (sharedWorkspaces.length === 0) {
      throw new Error("No shared workspace found (no workspace has >1 user)");
    }
    if (sharedWorkspaces.length > 1) {
      throw new Error("Multiple shared workspaces found. Please set AUTH_SHARED_WORKSPACE_ID.");
    }

    sharedWorkspace = memberships[0].workspace;
    users = sharedWorkspaces[0].map(m => m.user);
  }

  const [listCount, taskCount, goalCount, storeCount, itemCount] = await Promise.all([
    prisma.list.count({ where: { workspaceId: sharedWorkspace.id } }),
    prisma.task.count({ where: { list: { workspaceId: sharedWorkspace.id } } }),
    prisma.goal.count({ where: { list: { workspaceId: sharedWorkspace.id } } }),
    prisma.shoppingStore.count({ where: { workspaceId: sharedWorkspace.id } }),
    prisma.shoppingItem.count({ where: { workspaceId: sharedWorkspace.id } }),
  ]);

  return {
    currentSharedWorkspace: {
      id: sharedWorkspace.id,
      name: sharedWorkspace.name,
      userCount: users.length,
    },
    users: users.map(u => ({
      id: u.id,
      email: u.email,
      name: u.name,
    })),
    newWorkspaces: users.map(u => ({
      userId: u.id,
      userName: u.name || u.email,
      workspaceName: `${u.name || u.email}'s Tasks`,
    })),
    dataToMigrate: {
      lists: listCount,
      tasks: taskCount,
      goals: goalCount,
      shoppingStores: storeCount,
      shoppingItems: itemCount,
    },
    strategy: "DUPLICATE_ALL",
  };
}

async function executeMigration(plan: MigrationPlan) {
  console.log("🚀 Executing migration...\n");

  if (DRY_RUN) {
    console.log("⚠️  DRY RUN MODE - No changes will be made\n");
  }

  const sharedWorkspaceId = plan.currentSharedWorkspace.id;

  for (const userPlan of plan.newWorkspaces) {
    console.log(`\n📦 Creating personal workspace for ${userPlan.userName}...`);

    if (!DRY_RUN) {
      const existingPersonal = await prisma.membership.findFirst({
        where: {
          userId: userPlan.userId,
          workspace: {
            type: WorkspaceType.personal,
            id: { not: sharedWorkspaceId },
          },
        },
      });

      if (existingPersonal) {
        console.log(`   ⚠️  User already has a separate personal workspace, skipping creation`);
        continue;
      }

      const newWorkspace = await prisma.workspace.create({
        data: {
          name: userPlan.workspaceName,
          type: WorkspaceType.personal,
          memberships: {
            create: {
              userId: userPlan.userId,
              role: MembershipRole.owner,
            },
          },
        },
      });

      console.log(`   ✅ Created workspace: ${newWorkspace.id}`);

      const sharedLists = await prisma.list.findMany({
        where: { workspaceId: sharedWorkspaceId },
        include: {
          goals: {
            where: { archivedAt: null },
            include: {
              tasks: true,
            },
          },
          tasks: {
            where: { goalId: null },
            include: {
              recurrenceRule: true,
              checklistItems: true,
            },
          },
        },
      });

      for (const list of sharedLists) {
        console.log(`   📋 Duplicating list: ${list.name}`);

        const newList = await prisma.list.create({
          data: {
            workspaceId: newWorkspace.id,
            name: list.name,
            isInbox: list.isInbox,
            sortOrder: list.sortOrder,
            color: list.color,
            weight: list.weight,
          },
        });

        const goalIdMap = new Map<string, string>();
        for (const goal of list.goals) {
          const newGoal = await prisma.goal.create({
            data: {
              listId: newList.id,
              title: goal.title,
              sortOrder: goal.sortOrder,
            },
          });
          goalIdMap.set(goal.id, newGoal.id);
        }

        const allTasks = [...list.tasks];
        for (const goal of list.goals) {
          allTasks.push(...goal.tasks);
        }

        for (const task of allTasks) {
          const newTask = await prisma.task.create({
            data: {
              listId: newList.id,
              goalId: task.goalId ? goalIdMap.get(task.goalId) : null,
              sortOrder: task.sortOrder,
              title: task.title,
              notes: task.notes,
              priority: task.priority,
              kind: task.kind,
              attentionCost: task.attentionCost,
              estimatedMinutes: task.estimatedMinutes,
              dueAt: task.dueAt,
              templateId: task.templateId,
            },
          });

          if (task.recurrenceRule) {
            await prisma.recurrenceRule.create({
              data: {
                taskId: newTask.id,
                mode: task.recurrenceRule.mode,
                frequency: task.recurrenceRule.frequency,
                interval: task.recurrenceRule.interval,
                byWeekday: task.recurrenceRule.byWeekday,
                skippable: task.recurrenceRule.skippable,
                alarmPolicy: task.recurrenceRule.alarmPolicy,
                windowStart: task.recurrenceRule.windowStart,
                windowEnd: task.recurrenceRule.windowEnd,
                nextDueAt: task.recurrenceRule.nextDueAt,
                activeMonths: task.recurrenceRule.activeMonths,
                pauseUntil: task.recurrenceRule.pauseUntil,
                active: task.recurrenceRule.active,
              },
            });
          }

          for (const item of task.checklistItems) {
            await prisma.checklistItem.create({
              data: {
                taskId: newTask.id,
                title: item.title,
                checked: item.checked,
                sortOrder: item.sortOrder,
              },
            });
          }
        }

        console.log(`   ✅ Duplicated ${allTasks.length} tasks from list "${list.name}"`);
      }
    } else {
      console.log(`   [DRY RUN] Would create workspace: ${userPlan.workspaceName}`);
      console.log(`   [DRY RUN] Would duplicate ${plan.dataToMigrate.lists} lists`);
      console.log(`   [DRY RUN] Would duplicate ${plan.dataToMigrate.tasks} tasks`);
      console.log(`   [DRY RUN] Would duplicate ${plan.dataToMigrate.goals} goals`);
    }
  }

  console.log(`\n🛒 Keeping shopping list in shared workspace...`);
  console.log(`   ✅ ${plan.dataToMigrate.shoppingStores} stores remain shared`);
  console.log(`   ✅ ${plan.dataToMigrate.shoppingItems} items remain shared`);
  console.log(`   ✅ All users keep access to workspace: ${sharedWorkspaceId}`);
}

async function main() {
  console.log("╔═══════════════════════════════════════════════════════════╗");
  console.log("║   Daylock Account Separation Migration                   ║");
  console.log("╚═══════════════════════════════════════════════════════════╝\n");

  const plan = await analyzeCurrent();

  console.log("📊 MIGRATION PLAN\n");
  console.log("Current Shared Workspace:");
  console.log(`  ID: ${plan.currentSharedWorkspace.id}`);
  console.log(`  Name: ${plan.currentSharedWorkspace.name}`);
  console.log(`  Users: ${plan.currentSharedWorkspace.userCount}\n`);

  console.log("Users to separate:");
  for (const user of plan.users) {
    console.log(`  - ${user.email} (${user.name || "unnamed"})`);
  }
  console.log();

  console.log("Data to migrate:");
  console.log(`  Lists: ${plan.dataToMigrate.lists}`);
  console.log(`  Tasks: ${plan.dataToMigrate.tasks}`);
  console.log(`  Goals: ${plan.dataToMigrate.goals}\n`);

  console.log("Shopping data (stays shared):");
  console.log(`  Stores: ${plan.dataToMigrate.shoppingStores}`);
  console.log(`  Items: ${plan.dataToMigrate.shoppingItems}\n`);

  console.log("Strategy: DUPLICATE_ALL");
  console.log("  - Each user gets a new personal workspace");
  console.log("  - All lists, tasks, and goals are duplicated to each workspace");
  console.log("  - Shopping stores and items remain in the shared workspace");
  console.log("  - Both users keep membership in the shared workspace for shopping");
  console.log("  - Completed tasks and task occurrences are NOT duplicated\n");

  console.log("After migration:");
  console.log("  - Remove or update AUTH_SHARED_WORKSPACE_ID in production");
  console.log("  - Each user will use their personal workspace for tasks");
  console.log("  - Shopping domain code will continue to work (uses getPersonalWorkspaceId)");
  console.log("  - Consider updating shopping.ts to explicitly use the shared workspace\n");

  await executeMigration(plan);

  console.log("\n✅ Migration complete!");

  if (!DRY_RUN) {
    console.log("\n⚠️  NEXT STEPS:");
    console.log("1. Update your application environment:");
    console.log("   - Remove or comment out AUTH_SHARED_WORKSPACE_ID");
    console.log("   - Deploy the updated environment variable");
    console.log("2. Test that each user sees only their own tasks");
    console.log("3. Test that both users still see the shared shopping list");
    console.log("4. If shopping doesn't work, see SHOPPING_FIX.md for the fix\n");
  } else {
    console.log("\n⚠️  This was a DRY RUN. To execute:");
    console.log('   DRY_RUN=false npx tsx scripts/migrate-separate-accounts.ts\n');
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("\n❌ Migration failed:");
  console.error(e);
  process.exit(1);
});
