# Account Separation Migration Guide

This guide explains how to separate Dumanova's account from another user's account while keeping the shopping list shared.

## Overview

**Current State:**
- Both users share one workspace via `AUTH_SHARED_WORKSPACE_ID`
- They see all the same tasks, streams, goals, and shopping list

**Target State:**
- Each user has their own personal workspace for tasks, streams, and goals
- Shopping list remains shared between both users
- Both users keep access to the original shared workspace for shopping only

## Migration Strategy

### Approach: DUPLICATE_ALL with Shared Shopping

1. **Create separate personal workspaces** for each user
2. **Duplicate all task-related data** (lists, goals, tasks) to each new workspace
   - Only active (incomplete, non-archived) tasks are duplicated
   - Each user gets a copy of all current work
3. **Keep shopping data in the shared workspace**
   - Shopping stores and items are NOT duplicated
   - Both users remain members of the shared workspace
4. **Update application code** to use the shared workspace for shopping

### Why This Approach?

- **Safe**: Original data is preserved in the shared workspace
- **Fair**: Both users get access to all current tasks
- **Clean**: Shopping remains shared without complex logic
- **Reversible**: Original workspace is unchanged, can rollback code changes

## Prerequisites

1. **Database Access**: You need access to your production Postgres database
2. **Backup**: Create a full database backup before starting
3. **Maintenance Window**: Consider putting the app in read-only mode during migration

## Step-by-Step Migration

### Step 1: Identify Your Data

First, identify your users and shared workspace:

```sql
-- Find users
SELECT id, name, email FROM users;

-- Find shared workspace
SELECT w.id, w.name, w.type, COUNT(m."userId") as user_count
FROM workspaces w
JOIN memberships m ON m."workspaceId" = w.id
WHERE w.type = 'personal'
GROUP BY w.id
HAVING COUNT(m."userId") > 1;
```

### Step 2: Backup Database

```bash
# Create a backup
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify the backup
ls -lh backup_*.sql
```

### Step 3: Choose Your Migration Method

#### Option A: TypeScript Migration (Recommended)

Best for: Development environments, staging, or if you're comfortable with TypeScript

```bash
# Set your database URL
export DATABASE_URL="postgresql://user:pass@host:5432/dbname"

# Run in dry-run mode first (no changes)
npx tsx scripts/migrate-separate-accounts.ts

# Review the output, then run for real
DRY_RUN=false npx tsx scripts/migrate-separate-accounts.ts
```

#### Option B: SQL Migration

Best for: Production environments, or if you prefer SQL

1. Edit `scripts/migrate-separate-accounts.sql`
2. Update the variables at the top with your user IDs and workspace ID
3. Review the entire script
4. Run it in a psql session:

```bash
psql $DATABASE_URL -f scripts/migrate-separate-accounts.sql
```

5. Review the output
6. If everything looks good, edit the script to change `ROLLBACK;` to `COMMIT;` and run again

### Step 4: Update Application Configuration

After the migration succeeds, update your environment variables:

**Before:**
```bash
AUTH_SHARED_WORKSPACE_ID="clx..." # The shared workspace ID
```

**After:**
```bash
# Comment out or remove AUTH_SHARED_WORKSPACE_ID
# AUTH_SHARED_WORKSPACE_ID=""

# Add new variable for shopping
AUTH_SHOPPING_WORKSPACE_ID="clx..." # Same ID as the old shared workspace
```

### Step 5: Deploy Code Changes

The migration includes code changes to `server/domain/shopping.ts` that enable shared shopping via `AUTH_SHOPPING_WORKSPACE_ID`.

**Files changed:**
- `server/domain/shopping.ts` - Updated to use `AUTH_SHOPPING_WORKSPACE_ID`
- `.env.example` - Documented the new environment variable

**Deploy these changes:**

```bash
# Commit the changes
git add server/domain/shopping.ts .env.example
git commit -m "Support separate accounts with shared shopping"

# Push and deploy
git push origin main
# ... your deployment process
```

### Step 6: Verify the Migration

#### Test 1: Separate Task Access

1. Log in as User 1
2. Go to Streams page
3. Verify you see tasks but not User 2's new tasks (if they created any)
4. Create a test task
5. Log in as User 2
6. Verify you DON'T see User 1's new test task

#### Test 2: Shared Shopping List

1. Log in as User 1
2. Go to Shopping page
3. Add a test item "Test Item 1"
4. Log in as User 2
5. Verify you SEE "Test Item 1"
6. Add "Test Item 2"
7. Log in as User 1
8. Verify you SEE "Test Item 2"
9. Clean up test items

### Step 7: Monitor and Clean Up

1. **Monitor for errors** in the first few days
2. **Check logs** for any workspace-related issues
3. **Ask users** if they notice any issues
4. **After 1-2 weeks**, if everything works, you can optionally clean up old data in the shared workspace:
   - Archive old lists in the shared workspace
   - Clean up completed/archived tasks

## Troubleshooting

### Issue: Shopping list not showing

**Symptoms:** Users can't see shopping list or get errors

**Solution:**
1. Check `AUTH_SHOPPING_WORKSPACE_ID` is set correctly
2. Verify both users are still members of that workspace:
   ```sql
   SELECT u.email, m.role
   FROM memberships m
   JOIN users u ON u.id = m."userId"
   WHERE m."workspaceId" = 'YOUR_SHOPPING_WORKSPACE_ID';
   ```
3. If a user is missing, add them back:
   ```sql
   INSERT INTO memberships (id, "workspaceId", "userId", role, "createdAt")
   VALUES (gen_random_uuid(), 'SHOPPING_WORKSPACE_ID', 'USER_ID', 'owner', NOW());
   ```

### Issue: Users see each other's tasks

**Symptoms:** Users see tasks they shouldn't see

**Root Cause:** `getPersonalWorkspaceId()` is returning the wrong workspace

**Solution:**
1. Check which workspace each user is in:
   ```sql
   SELECT u.email, w.id, w.name, w.type
   FROM users u
   JOIN memberships m ON m."userId" = u.id
   JOIN workspaces w ON w.id = m."workspaceId"
   WHERE u.email IN ('user1@example.com', 'user2@example.com');
   ```
2. Verify each user has exactly ONE personal workspace of type 'personal'
3. If they have multiple, you may need to merge or delete duplicates

### Issue: Migration script fails

**Symptoms:** TypeScript script crashes or SQL script has errors

**Common Causes:**
1. **Database connection**: Check `DATABASE_URL` is correct
2. **Missing dependencies**: Run `npm install`
3. **Prisma out of sync**: Run `npx prisma generate`
4. **User IDs incorrect**: Double-check user IDs in the script

**Recovery:**
- SQL migration runs in a transaction and auto-rollbacks on error
- TypeScript migration uses Prisma transactions where possible
- Restore from backup if needed: `psql $DATABASE_URL < backup_XXXXXX.sql`

## Rollback Plan

If you need to rollback the migration:

### Rollback Step 1: Revert Environment Variables

```bash
# Restore original variable
AUTH_SHARED_WORKSPACE_ID="clx..." # The original shared workspace ID

# Remove new variable
# AUTH_SHOPPING_WORKSPACE_ID=""
```

### Rollback Step 2: Revert Code Changes

```bash
git revert <commit-hash>
# Or restore shopping.ts from backup
```

### Rollback Step 3: (Optional) Remove New Workspaces

If you want to fully rollback the database changes:

```sql
BEGIN;

-- Get the new workspace IDs
SELECT id, name FROM workspaces 
WHERE name LIKE '%''s Tasks' 
  AND type = 'personal'
  AND "createdAt" > 'MIGRATION_DATE';

-- Delete the new workspaces and all their data (cascades)
DELETE FROM workspaces 
WHERE id IN ('NEW_WORKSPACE_1_ID', 'NEW_WORKSPACE_2_ID');

COMMIT;
```

## Alternative Approaches Considered

### Option 1: Split Data by Creator
- Assign tasks to workspaces based on who created them
- **Rejected**: No reliable creator tracking in schema

### Option 2: Shared Workspace for Shopping Only
- Keep shopping in shared workspace, move all tasks to personal
- **Rejected**: More complex migration, loses completed task history

### Option 3: Separate Shopping Too
- Each user gets their own shopping list
- **Rejected**: User explicitly wants shared shopping

## Schema Reference

Relevant tables and relationships:

```
Workspace (personal or shared type)
├── Memberships (users in this workspace)
├── Lists (inbox and streams)
│   ├── Goals
│   └── Tasks
│       ├── RecurrenceRules
│       └── ChecklistItems
├── ShoppingStores
└── ShoppingItems
```

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review the migration logs
3. Check application logs for errors
4. Examine database state with SQL queries
5. Consider restoring from backup and trying again

## Success Criteria

✅ Each user has their own personal workspace  
✅ Each user sees only their own tasks and streams  
✅ Both users see the same shopping list  
✅ Shopping stores and items can be added/edited by both users  
✅ No data loss occurred  
✅ Application functions normally  

## Timeline

- **Backup**: 5-10 minutes
- **Migration script**: 1-5 minutes (depending on data size)
- **Code deployment**: 10-30 minutes (depending on your process)
- **Testing**: 15-30 minutes
- **Total**: 30-60 minutes

## Questions?

This migration was designed to be safe and reversible. If you have questions or concerns, review the code in:

- `scripts/migrate-separate-accounts.ts` - TypeScript migration logic
- `scripts/migrate-separate-accounts.sql` - SQL migration logic
- `server/domain/shopping.ts` - Updated shopping workspace logic
- `SHOPPING_FIX.md` - Detailed explanation of shopping changes
