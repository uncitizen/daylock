-- Migration: Separate user accounts while keeping shopping list shared
--
-- BEFORE RUNNING:
-- 1. Backup your database: pg_dump your_database > backup.sql
-- 2. Update the variables at the top with your actual user IDs
-- 3. Review the script carefully
-- 4. Run in a transaction so you can rollback if needed
--
-- APPROACH:
-- - Create separate personal workspaces for each user
-- - Duplicate all lists, tasks, and goals to each new workspace
-- - Leave shopping stores and items in the shared workspace
-- - Both users remain members of the shared workspace for shopping access
--
-- After running this migration:
-- 1. Set AUTH_SHOPPING_WORKSPACE_ID to the original shared workspace ID
-- 2. Remove or comment out AUTH_SHARED_WORKSPACE_ID
-- 3. Deploy the code changes from shopping.ts

BEGIN;

-- ============================================================================
-- STEP 1: Configure these variables for your database
-- ============================================================================

-- Find your user IDs with:
-- SELECT id, name, email FROM users;

\set user1_id 'USER_ID_1_HERE'
\set user1_email 'user1@example.com'
\set user2_id 'USER_ID_2_HERE'
\set user2_email 'user2@example.com'

-- Find your shared workspace ID with:
-- SELECT w.id, w.name, w.type, COUNT(m."userId") as user_count
-- FROM workspaces w
-- JOIN memberships m ON m."workspaceId" = w.id
-- GROUP BY w.id
-- HAVING COUNT(m."userId") > 1;

\set shared_workspace_id 'SHARED_WORKSPACE_ID_HERE'

-- ============================================================================
-- STEP 2: Verify current state
-- ============================================================================

SELECT '=== Current State ===' as step;

SELECT 'Users:' as info;
SELECT id, name, email FROM users 
WHERE id IN (:'user1_id', :'user2_id');

SELECT 'Shared Workspace:' as info;
SELECT w.*, COUNT(m."userId") as member_count
FROM workspaces w
JOIN memberships m ON m."workspaceId" = w.id
WHERE w.id = :'shared_workspace_id'
GROUP BY w.id;

SELECT 'Data counts in shared workspace:' as info;
SELECT
  (SELECT COUNT(*) FROM lists WHERE "workspaceId" = :'shared_workspace_id') as lists,
  (SELECT COUNT(*) FROM tasks WHERE "listId" IN (SELECT id FROM lists WHERE "workspaceId" = :'shared_workspace_id')) as tasks,
  (SELECT COUNT(*) FROM goals WHERE "listId" IN (SELECT id FROM lists WHERE "workspaceId" = :'shared_workspace_id')) as goals,
  (SELECT COUNT(*) FROM shopping_stores WHERE "workspaceId" = :'shared_workspace_id') as stores,
  (SELECT COUNT(*) FROM shopping_items WHERE "workspaceId" = :'shared_workspace_id') as items;

-- ============================================================================
-- STEP 3: Create new personal workspaces
-- ============================================================================

SELECT '=== Creating Personal Workspaces ===' as step;

-- Create workspace for user 1
INSERT INTO workspaces (id, name, type, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  COALESCE(u.name, u.email) || '''s Tasks',
  'personal',
  NOW(),
  NOW()
FROM users u
WHERE u.id = :'user1_id'
RETURNING id, name;

-- Store the new workspace ID in a variable
\gset user1_workspace_

-- Create workspace for user 2
INSERT INTO workspaces (id, name, type, "createdAt", "updatedAt")
SELECT 
  gen_random_uuid(),
  COALESCE(u.name, u.email) || '''s Tasks',
  'personal',
  NOW(),
  NOW()
FROM users u
WHERE u.id = :'user2_id'
RETURNING id, name;

\gset user2_workspace_

-- Create memberships
INSERT INTO memberships (id, "workspaceId", "userId", role, "createdAt")
VALUES 
  (gen_random_uuid(), :'user1_workspace_id', :'user1_id', 'owner', NOW()),
  (gen_random_uuid(), :'user2_workspace_id', :'user2_id', 'owner', NOW());

SELECT 'Created workspaces:' as info;
SELECT id, name FROM workspaces WHERE id IN (:'user1_workspace_id', :'user2_workspace_id');

-- ============================================================================
-- STEP 4: Duplicate lists, goals, and tasks for user 1
-- ============================================================================

SELECT '=== Duplicating data for user 1 ===' as step;

-- Create a temporary table to map old list IDs to new list IDs
CREATE TEMP TABLE list_mapping (
  old_list_id TEXT,
  new_list_id TEXT,
  workspace_num INTEGER
);

-- Duplicate lists for user 1
INSERT INTO lists (id, "workspaceId", name, "isInbox", "sortOrder", color, weight, "archivedAt", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid() as id,
  :'user1_workspace_id' as "workspaceId",
  name,
  "isInbox",
  "sortOrder",
  color,
  weight,
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM lists
WHERE "workspaceId" = :'shared_workspace_id'
RETURNING id;

-- Store list mappings
INSERT INTO list_mapping (old_list_id, new_list_id, workspace_num)
SELECT 
  l_old.id,
  l_new.id,
  1
FROM lists l_old
CROSS JOIN LATERAL (
  SELECT id FROM lists l_new 
  WHERE l_new."workspaceId" = :'user1_workspace_id' 
    AND l_new.name = l_old.name 
    AND l_new."isInbox" = l_old."isInbox"
  LIMIT 1
) l_new
WHERE l_old."workspaceId" = :'shared_workspace_id';

-- Create temporary table for goal mapping
CREATE TEMP TABLE goal_mapping (
  old_goal_id TEXT,
  new_goal_id TEXT,
  workspace_num INTEGER
);

-- Duplicate goals for user 1
INSERT INTO goals (id, "listId", title, "sortOrder", "archivedAt", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid() as id,
  lm.new_list_id as "listId",
  g.title,
  g."sortOrder",
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM goals g
JOIN list_mapping lm ON lm.old_list_id = g."listId" AND lm.workspace_num = 1
WHERE g."archivedAt" IS NULL;

-- Store goal mappings
INSERT INTO goal_mapping (old_goal_id, new_goal_id, workspace_num)
SELECT 
  g_old.id,
  g_new.id,
  1
FROM goals g_old
JOIN list_mapping lm ON lm.old_list_id = g_old."listId" AND lm.workspace_num = 1
CROSS JOIN LATERAL (
  SELECT id FROM goals g_new 
  WHERE g_new."listId" = lm.new_list_id
    AND g_new.title = g_old.title 
  LIMIT 1
) g_new
WHERE g_old."archivedAt" IS NULL;

-- Create temporary table for task mapping
CREATE TEMP TABLE task_mapping (
  old_task_id TEXT,
  new_task_id TEXT,
  workspace_num INTEGER
);

-- Duplicate tasks for user 1 (only incomplete, non-archived tasks)
INSERT INTO tasks (
  id, "listId", "goalId", "templateId", "sortOrder", title, notes, 
  priority, kind, "attentionCost", "estimatedMinutes", "dueAt", 
  "completedAt", "archivedAt", "createdAt", "updatedAt"
)
SELECT 
  gen_random_uuid() as id,
  lm.new_list_id as "listId",
  CASE 
    WHEN t."goalId" IS NOT NULL THEN gm.new_goal_id
    ELSE NULL 
  END as "goalId",
  t."templateId",
  t."sortOrder",
  t.title,
  t.notes,
  t.priority,
  t.kind,
  t."attentionCost",
  t."estimatedMinutes",
  t."dueAt",
  NULL as "completedAt",
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM tasks t
JOIN list_mapping lm ON lm.old_list_id = t."listId" AND lm.workspace_num = 1
LEFT JOIN goal_mapping gm ON gm.old_goal_id = t."goalId" AND gm.workspace_num = 1
WHERE t."completedAt" IS NULL 
  AND t."archivedAt" IS NULL
RETURNING id;

-- Store task mappings
INSERT INTO task_mapping (old_task_id, new_task_id, workspace_num)
SELECT 
  t_old.id,
  t_new.id,
  1
FROM tasks t_old
JOIN list_mapping lm ON lm.old_list_id = t_old."listId" AND lm.workspace_num = 1
CROSS JOIN LATERAL (
  SELECT id FROM tasks t_new 
  WHERE t_new."listId" = lm.new_list_id
    AND t_new.title = t_old.title 
    AND t_new."completedAt" IS NULL
    AND t_new."archivedAt" IS NULL
  ORDER BY t_new."createdAt" DESC
  LIMIT 1
) t_new
WHERE t_old."completedAt" IS NULL 
  AND t_old."archivedAt" IS NULL;

-- Duplicate recurrence rules for user 1
INSERT INTO recurrence_rules (
  id, "taskId", mode, frequency, interval, "byWeekday", skippable,
  "alarmPolicy", "windowStart", "windowEnd", "nextDueAt", "activeMonths",
  "pauseUntil", active, "createdAt", "updatedAt"
)
SELECT 
  gen_random_uuid() as id,
  tm.new_task_id as "taskId",
  rr.mode,
  rr.frequency,
  rr.interval,
  rr."byWeekday",
  rr.skippable,
  rr."alarmPolicy",
  rr."windowStart",
  rr."windowEnd",
  rr."nextDueAt",
  rr."activeMonths",
  rr."pauseUntil",
  rr.active,
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM recurrence_rules rr
JOIN task_mapping tm ON tm.old_task_id = rr."taskId" AND tm.workspace_num = 1;

-- Duplicate checklist items for user 1
INSERT INTO checklist_items (id, "taskId", title, checked, "sortOrder", "createdAt")
SELECT 
  gen_random_uuid() as id,
  tm.new_task_id as "taskId",
  ci.title,
  ci.checked,
  ci."sortOrder",
  NOW() as "createdAt"
FROM checklist_items ci
JOIN task_mapping tm ON tm.old_task_id = ci."taskId" AND tm.workspace_num = 1;

-- ============================================================================
-- STEP 5: Duplicate lists, goals, and tasks for user 2
-- ============================================================================

SELECT '=== Duplicating data for user 2 ===' as step;

-- Duplicate lists for user 2
INSERT INTO lists (id, "workspaceId", name, "isInbox", "sortOrder", color, weight, "archivedAt", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid() as id,
  :'user2_workspace_id' as "workspaceId",
  name,
  "isInbox",
  "sortOrder",
  color,
  weight,
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM lists
WHERE "workspaceId" = :'shared_workspace_id';

-- Store list mappings for user 2
INSERT INTO list_mapping (old_list_id, new_list_id, workspace_num)
SELECT 
  l_old.id,
  l_new.id,
  2
FROM lists l_old
CROSS JOIN LATERAL (
  SELECT id FROM lists l_new 
  WHERE l_new."workspaceId" = :'user2_workspace_id' 
    AND l_new.name = l_old.name 
    AND l_new."isInbox" = l_old."isInbox"
  LIMIT 1
) l_new
WHERE l_old."workspaceId" = :'shared_workspace_id';

-- Duplicate goals for user 2
INSERT INTO goals (id, "listId", title, "sortOrder", "archivedAt", "createdAt", "updatedAt")
SELECT 
  gen_random_uuid() as id,
  lm.new_list_id as "listId",
  g.title,
  g."sortOrder",
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM goals g
JOIN list_mapping lm ON lm.old_list_id = g."listId" AND lm.workspace_num = 2
WHERE g."archivedAt" IS NULL;

-- Store goal mappings for user 2
INSERT INTO goal_mapping (old_goal_id, new_goal_id, workspace_num)
SELECT 
  g_old.id,
  g_new.id,
  2
FROM goals g_old
JOIN list_mapping lm ON lm.old_list_id = g_old."listId" AND lm.workspace_num = 2
CROSS JOIN LATERAL (
  SELECT id FROM goals g_new 
  WHERE g_new."listId" = lm.new_list_id
    AND g_new.title = g_old.title 
  LIMIT 1
) g_new
WHERE g_old."archivedAt" IS NULL;

-- Duplicate tasks for user 2
INSERT INTO tasks (
  id, "listId", "goalId", "templateId", "sortOrder", title, notes, 
  priority, kind, "attentionCost", "estimatedMinutes", "dueAt", 
  "completedAt", "archivedAt", "createdAt", "updatedAt"
)
SELECT 
  gen_random_uuid() as id,
  lm.new_list_id as "listId",
  CASE 
    WHEN t."goalId" IS NOT NULL THEN gm.new_goal_id
    ELSE NULL 
  END as "goalId",
  t."templateId",
  t."sortOrder",
  t.title,
  t.notes,
  t.priority,
  t.kind,
  t."attentionCost",
  t."estimatedMinutes",
  t."dueAt",
  NULL as "completedAt",
  NULL as "archivedAt",
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM tasks t
JOIN list_mapping lm ON lm.old_list_id = t."listId" AND lm.workspace_num = 2
LEFT JOIN goal_mapping gm ON gm.old_goal_id = t."goalId" AND gm.workspace_num = 2
WHERE t."completedAt" IS NULL 
  AND t."archivedAt" IS NULL;

-- Store task mappings for user 2
INSERT INTO task_mapping (old_task_id, new_task_id, workspace_num)
SELECT 
  t_old.id,
  t_new.id,
  2
FROM tasks t_old
JOIN list_mapping lm ON lm.old_list_id = t_old."listId" AND lm.workspace_num = 2
CROSS JOIN LATERAL (
  SELECT id FROM tasks t_new 
  WHERE t_new."listId" = lm.new_list_id
    AND t_new.title = t_old.title 
    AND t_new."completedAt" IS NULL
    AND t_new."archivedAt" IS NULL
  ORDER BY t_new."createdAt" DESC
  LIMIT 1
) t_new
WHERE t_old."completedAt" IS NULL 
  AND t_old."archivedAt" IS NULL;

-- Duplicate recurrence rules for user 2
INSERT INTO recurrence_rules (
  id, "taskId", mode, frequency, interval, "byWeekday", skippable,
  "alarmPolicy", "windowStart", "windowEnd", "nextDueAt", "activeMonths",
  "pauseUntil", active, "createdAt", "updatedAt"
)
SELECT 
  gen_random_uuid() as id,
  tm.new_task_id as "taskId",
  rr.mode,
  rr.frequency,
  rr.interval,
  rr."byWeekday",
  rr.skippable,
  rr."alarmPolicy",
  rr."windowStart",
  rr."windowEnd",
  rr."nextDueAt",
  rr."activeMonths",
  rr."pauseUntil",
  rr.active,
  NOW() as "createdAt",
  NOW() as "updatedAt"
FROM recurrence_rules rr
JOIN task_mapping tm ON tm.old_task_id = rr."taskId" AND tm.workspace_num = 2;

-- Duplicate checklist items for user 2
INSERT INTO checklist_items (id, "taskId", title, checked, "sortOrder", "createdAt")
SELECT 
  gen_random_uuid() as id,
  tm.new_task_id as "taskId",
  ci.title,
  ci.checked,
  ci."sortOrder",
  NOW() as "createdAt"
FROM checklist_items ci
JOIN task_mapping tm ON tm.old_task_id = ci."taskId" AND tm.workspace_num = 2;

-- ============================================================================
-- STEP 6: Verify results
-- ============================================================================

SELECT '=== Migration Results ===' as step;

SELECT 'New workspaces:' as info;
SELECT id, name, type, 
  (SELECT COUNT(*) FROM memberships WHERE "workspaceId" = w.id) as members,
  (SELECT COUNT(*) FROM lists WHERE "workspaceId" = w.id) as lists,
  (SELECT COUNT(*) FROM tasks WHERE "listId" IN (SELECT id FROM lists WHERE "workspaceId" = w.id)) as tasks
FROM workspaces w
WHERE id IN (:'user1_workspace_id', :'user2_workspace_id');

SELECT 'Shopping data (still in shared workspace):' as info;
SELECT 
  (SELECT COUNT(*) FROM shopping_stores WHERE "workspaceId" = :'shared_workspace_id') as stores,
  (SELECT COUNT(*) FROM shopping_items WHERE "workspaceId" = :'shared_workspace_id') as items;

SELECT 'Memberships in shared workspace:' as info;
SELECT u.email, m.role
FROM memberships m
JOIN users u ON u.id = m."userId"
WHERE m."workspaceId" = :'shared_workspace_id';

-- ============================================================================
-- STEP 7: Commit or rollback
-- ============================================================================

-- Review the results above. If everything looks correct, uncomment COMMIT below.
-- Otherwise, the transaction will rollback automatically.

-- COMMIT;
ROLLBACK;  -- Remove this line and uncomment COMMIT above when ready

-- ============================================================================
-- NEXT STEPS AFTER MIGRATION:
-- ============================================================================
-- 1. Set AUTH_SHOPPING_WORKSPACE_ID to: :shared_workspace_id
-- 2. Remove or comment out AUTH_SHARED_WORKSPACE_ID
-- 3. Deploy the updated shopping.ts code changes
-- 4. Test that each user sees only their own tasks
-- 5. Test that both users still see the shared shopping list
