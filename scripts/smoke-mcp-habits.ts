/**
 * Smoke-test MCP habit complete/skip paths (no HTTP — calls handlers directly).
 * Run: npx tsx scripts/smoke-mcp-habits.ts
 */
import { startOfDay } from "date-fns";
import { prisma } from "../server/db/client";
import { ensurePersonalWorkspace } from "../server/domain/workspaces";
import { createTask } from "../server/domain/tasks";
import { materializeOccurrencesForTask } from "../server/domain/recurrence";
import { callMcpTool } from "../src/lib/mcp-tools";

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "mcp-habit-smoke@localhost" },
    create: { email: "mcp-habit-smoke@localhost", name: "McpHabitSmoke" },
    update: {},
  });
  const wsId = await ensurePersonalWorkspace(user.id, user.name);
  const inbox = await prisma.list.findFirstOrThrow({
    where: { workspaceId: wsId, isInbox: true },
  });

  // Clean prior smoke tasks
  await prisma.task.deleteMany({
    where: { listId: inbox.id, title: { startsWith: "MCP smoke" } },
  });

  const habit = await createTask({
    listId: inbox.id,
    title: "MCP smoke habit",
    recurrence: {
      mode: "habit",
      frequency: "daily",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
    },
  });
  await materializeOccurrencesForTask(habit.id);

  const today = startOfDay(new Date());
  const occ = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: habit.id, date: today },
  });

  // 1) Complete by taskId only (the common agent path that was failing)
  const byTask = parse(await callMcpTool(user.id, "complete_task", { taskId: habit.id }));
  assert(byTask.success === true, `complete by taskId failed: ${JSON.stringify(byTask)}`);
  assert(
    (byTask.occurrence as { status: string }).status === "done",
    "occurrence should be done",
  );

  // Rematerialize a fresh open chip for further tests
  await prisma.taskOccurrence.deleteMany({ where: { taskId: habit.id } });
  await prisma.recurrenceRule.update({
    where: { taskId: habit.id },
    data: { nextDueAt: today },
  });
  await materializeOccurrencesForTask(habit.id);
  const occ2 = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: habit.id, date: today, status: "pending" },
  });

  // 2) Complete by passing occurrence id as taskId (agent mix-up)
  const byOccAsTask = parse(
    await callMcpTool(user.id, "complete_task", { taskId: occ2.id }),
  );
  assert(
    byOccAsTask.success === true,
    `complete by occurrence-as-taskId failed: ${JSON.stringify(byOccAsTask)}`,
  );

  // Fresh chip for skip
  await prisma.taskOccurrence.deleteMany({ where: { taskId: habit.id } });
  await prisma.recurrenceRule.update({
    where: { taskId: habit.id },
    data: { nextDueAt: today },
  });
  await materializeOccurrencesForTask(habit.id);

  // 3) Skip by taskId only
  const skipped = parse(
    await callMcpTool(user.id, "skip_occurrence", {
      taskId: habit.id,
      action: "skip",
      reason: "mcp_smoke",
    }),
  );
  assert(skipped.success === true, `skip by taskId failed: ${JSON.stringify(skipped)}`);

  // 4) Flex complete still works
  const flex = await createTask({
    listId: inbox.id,
    title: "MCP smoke flex",
  });
  const flexDone = parse(await callMcpTool(user.id, "complete_task", { taskId: flex.id }));
  assert(flexDone.success === true, `flex complete failed: ${JSON.stringify(flexDone)}`);

  // 5) get_my_day returns without throwing
  const day = parse(await callMcpTool(user.id, "get_my_day", {}));
  assert(Array.isArray(day.timeline), "get_my_day missing timeline");

  console.log("smoke-mcp-habits: OK");
  console.log({
    completedByTaskId: byTask,
    completedByOccIdAsTaskId: byOccAsTask,
    skippedByTaskId: skipped,
    flexDone,
    timelineCount: (day.timeline as unknown[]).length,
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
