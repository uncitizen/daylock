# Shopping List Shared Workspace Fix

## Problem

After separating user accounts, each user has their own personal workspace for tasks. However, the shopping list should remain shared between users.

Currently, `shopping.ts` uses `getPersonalWorkspaceId(userId)` which will return each user's new personal workspace instead of the shared workspace.

## Solution

We need to either:

### Option A: Use a separate shared workspace for shopping (Recommended)

1. Keep the original shared workspace ID in a new environment variable: `AUTH_SHOPPING_WORKSPACE_ID`
2. Update `shopping.ts` to use this workspace ID instead of `getPersonalWorkspaceId()`

### Option B: Continue using AUTH_SHARED_WORKSPACE_ID just for shopping

1. Keep AUTH_SHARED_WORKSPACE_ID but update `ensurePersonalWorkspace` to no longer auto-join it
2. Manually ensure both users are members of that workspace
3. Update `shopping.ts` to explicitly use `AUTH_SHARED_WORKSPACE_ID`

## Implementation

See the updated `server/domain/shopping.ts` and `server/domain/workspaces.ts` files for the implementation of Option A.

The changes:
1. Add `getShoppingWorkspaceId()` function that returns AUTH_SHOPPING_WORKSPACE_ID or falls back to personal workspace
2. Replace all calls to `getPersonalWorkspaceId()` in shopping.ts with `getShoppingWorkspaceId()`
3. Update environment variables in production

## Environment Variable

Add to your `.env` and production environment:

```bash
# Optional: Shared workspace for shopping list (keeps shopping shared between users)
# If not set, each user will have their own shopping list
AUTH_SHOPPING_WORKSPACE_ID="<your-original-shared-workspace-id>"
```

This allows the shopping list to remain shared while tasks are separate.
