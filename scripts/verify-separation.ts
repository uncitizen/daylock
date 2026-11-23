/**
 * Verification script: Check that account separation is working correctly
 * 
 * USAGE:
 *   DATABASE_URL="..." npx tsx scripts/verify-separation.ts
 */

import { prisma } from "../server/db/client";

async function main() {
  console.log("🔍 Verifying account separation...\n");

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      memberships: {
        include: {
          workspace: {
            select: {
              id: true,
              name: true,
              type: true,
            },
          },
        },
      },
    },
  });

  if (users.length === 0) {
    console.log("❌ No users found in database");
    return;
  }

  console.log(`Found ${users.length} users:\n`);

  let hasIssues = false;
  const shoppingWorkspaceId = process.env.AUTH_SHOPPING_WORKSPACE_ID?.trim();
  const sharedWorkspaceId = process.env.AUTH_SHARED_WORKSPACE_ID?.trim();

  for (const user of users) {
    console.log(`📧 ${user.email} (${user.name || "unnamed"})`);
    console.log(`   Workspaces: ${user.memberships.length}`);

    const personalWorkspaces = user.memberships.filter(
      (m) => m.workspace.type === "personal",
    );

    if (personalWorkspaces.length === 0) {
      console.log("   ⚠️  WARNING: No personal workspace found");
      hasIssues = true;
    } else if (personalWorkspaces.length > 1) {
      console.log(`   ⚠️  WARNING: Multiple personal workspaces (${personalWorkspaces.length})`);
      hasIssues = true;
    } else {
      console.log(`   ✅ Has personal workspace: ${personalWorkspaces[0].workspace.name}`);
    }

    for (const membership of user.memberships) {
      const ws = membership.workspace;
      const taskCount = await prisma.task.count({
        where: {
          list: { workspaceId: ws.id },
          completedAt: null,
          archivedAt: null,
        },
      });

      const shoppingItemCount = await prisma.shoppingItem.count({
        where: { workspaceId: ws.id },
      });

      console.log(
        `   - ${ws.name} (${ws.type}): ${taskCount} open tasks, ${shoppingItemCount} shopping items`,
      );

      if (ws.id === shoppingWorkspaceId) {
        console.log(`     ✅ This is the shopping workspace (AUTH_SHOPPING_WORKSPACE_ID)`);
      }
      if (ws.id === sharedWorkspaceId) {
        console.log(`     ⚠️  This is AUTH_SHARED_WORKSPACE_ID (should be removed after migration)`);
      }
    }
    console.log();
  }

  if (!shoppingWorkspaceId) {
    console.log("⚠️  WARNING: AUTH_SHOPPING_WORKSPACE_ID not set");
    console.log("   Shopping lists will be separate per user");
    console.log("   Set this to the shared workspace ID to keep shopping shared\n");
    hasIssues = true;
  } else {
    const shoppingWorkspace = await prisma.workspace.findUnique({
      where: { id: shoppingWorkspaceId },
      include: {
        memberships: {
          include: {
            user: {
              select: { email: true },
            },
          },
        },
        _count: {
          select: {
            shoppingStores: true,
            shoppingItems: true,
          },
        },
      },
    });

    if (!shoppingWorkspace) {
      console.log(`❌ ERROR: Shopping workspace not found: ${shoppingWorkspaceId}`);
      hasIssues = true;
    } else {
      console.log("🛒 Shopping Workspace Status:");
      console.log(`   ID: ${shoppingWorkspace.id}`);
      console.log(`   Name: ${shoppingWorkspace.name}`);
      console.log(`   Type: ${shoppingWorkspace.type}`);
      console.log(`   Members: ${shoppingWorkspace.memberships.length}`);
      console.log(
        `   Users: ${shoppingWorkspace.memberships.map((m) => m.user.email).join(", ")}`,
      );
      console.log(`   Stores: ${shoppingWorkspace._count.shoppingStores}`);
      console.log(`   Items: ${shoppingWorkspace._count.shoppingItems}`);

      if (shoppingWorkspace.memberships.length < 2) {
        console.log("   ⚠️  WARNING: Shopping workspace has less than 2 members");
        hasIssues = true;
      } else {
        console.log("   ✅ Shopping workspace is properly shared");
      }
      console.log();
    }
  }

  if (sharedWorkspaceId) {
    console.log("⚠️  WARNING: AUTH_SHARED_WORKSPACE_ID is still set");
    console.log("   This should be removed after migration");
    console.log("   Current value:", sharedWorkspaceId);
    console.log();
    hasIssues = true;
  }

  console.log("📊 Summary:");
  console.log(`   Users: ${users.length}`);
  console.log(`   Total workspaces: ${new Set(users.flatMap((u) => u.memberships.map((m) => m.workspace.id))).size}`);

  const usersWithMultiplePersonal = users.filter(
    (u) => u.memberships.filter((m) => m.workspace.type === "personal").length > 1,
  );
  if (usersWithMultiplePersonal.length > 0) {
    console.log(
      `   ⚠️  ${usersWithMultiplePersonal.length} users with multiple personal workspaces`,
    );
  }

  console.log();

  if (!hasIssues) {
    console.log("✅ Account separation looks good!");
    console.log("\nNext steps:");
    console.log("1. Test logging in as each user");
    console.log("2. Verify they see different tasks");
    console.log("3. Verify they see the same shopping list");
  } else {
    console.log("⚠️  Some issues found - review warnings above");
    console.log("\nRecommended actions:");
    if (!shoppingWorkspaceId) {
      console.log("- Set AUTH_SHOPPING_WORKSPACE_ID in your environment");
    }
    if (sharedWorkspaceId) {
      console.log("- Remove AUTH_SHARED_WORKSPACE_ID from your environment");
    }
    console.log("- Review the ACCOUNT_SEPARATION_GUIDE.md for troubleshooting");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error("\n❌ Verification failed:");
  console.error(e);
  process.exit(1);
});
