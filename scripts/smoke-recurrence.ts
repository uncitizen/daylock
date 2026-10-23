import { addDays, startOfDay, subDays } from "date-fns";
import { prisma } from "../server/db/client";
import { ensurePersonalWorkspace } from "../server/domain/workspaces";
import {
  createTask,
  skipOccurrence,
  completeOccurrence,
  updateTask,
} from "../server/domain/tasks";
import { getMyDay } from "../server/domain/my-day";
import {
  expireSoftPastOccurrences,
  materializeOccurrencesForTask,
} from "../server/domain/recurrence";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "recurrence-smoke@localhost" },
    create: { email: "recurrence-smoke@localhost", name: "RecSmoke" },
    update: {},
  });
  const wsId = await ensurePersonalWorkspace(user.id, user.name);
  const inbox = await prisma.list.findFirstOrThrow({
    where: { workspaceId: wsId, isInbox: true },
  });

  const habit = await createTask({
    listId: inbox.id,
    title: "Exercise",
    recurrence: {
      mode: "habit",
      frequency: "daily",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
    },
  });

  const grass = await createTask({
    listId: inbox.id,
    title: "Cut grass",
    recurrence: {
      mode: "rolling",
      frequency: "daily",
      interval: 14,
      skippable: true,
      alarmPolicy: "none",
      activeMonths: [4, 5, 6, 7, 8, 9],
    },
  });

  const habitOpen = await prisma.taskOccurrence.count({
    where: { taskId: habit.id, status: "pending" },
  });
  const grassOpen = await prisma.taskOccurrence.count({
    where: { taskId: grass.id, status: "pending" },
  });

  const habitOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: habit.id, status: "pending" },
  });
  await skipOccurrence(habitOcc.id, { action: "skip", reason: "tired" });
  const habitOpenAfterSkip = await prisma.taskOccurrence.count({
    where: { taskId: habit.id, status: "pending" },
  });

  const grassOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: grass.id, status: "pending" },
  });
  await completeOccurrence(grassOcc.id);
  const grassRule = await prisma.recurrenceRule.findUniqueOrThrow({
    where: { taskId: grass.id },
  });

  // Soft past expire
  const soft = await createTask({
    listId: inbox.id,
    title: "Old soft",
    recurrence: {
      mode: "habit",
      frequency: "daily",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
    },
  });
  const softOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: soft.id, status: "pending" },
  });
  await prisma.taskOccurrence.update({
    where: { id: softOcc.id },
    data: { date: startOfDay(subDays(new Date(), 2)) },
  });
  const expired = await expireSoftPastOccurrences();
  await materializeOccurrencesForTask(soft.id);

  // Plan a rolling task for a future date — must not chip today.
  const plannedDue = startOfDay(addDays(new Date(), 20));
  const planned = await createTask({
    listId: inbox.id,
    title: "Analyze promo results",
    recurrence: {
      mode: "rolling",
      frequency: "monthly",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
      nextDueAt: plannedDue.toISOString(),
    },
  });
  const plannedOpen = await prisma.taskOccurrence.count({
    where: { taskId: planned.id, status: "pending" },
  });
  const plannedRule = await prisma.recurrenceRule.findUniqueOrThrow({
    where: { taskId: planned.id },
  });

  // Repoint an already-due rolling task into the future and clear today's chip.
  await updateTask(grass.id, {
    recurrence: {
      mode: "rolling",
      frequency: "daily",
      interval: 14,
      skippable: true,
      alarmPolicy: "none",
      activeMonths: [4, 5, 6, 7, 8, 9],
      nextDueAt: plannedDue.toISOString(),
    },
  });
  const grassOpenAfterPlan = await prisma.taskOccurrence.count({
    where: { taskId: grass.id, status: "pending" },
  });

  const day = await getMyDay(user.id, new Date());
  const occChips = day.timeline.filter((t) => t.type === "occurrence");
  const plannedOnMyDay = occChips.some(
    (c) => c.type === "occurrence" && c.taskId === planned.id,
  );

  console.log(
    JSON.stringify(
      {
        habitOpen,
        grassOpen,
        habitOpenAfterSkip,
        grassNextDue: grassRule.nextDueAt,
        expired,
        plannedOpen,
        plannedNextDue: plannedRule.nextDueAt,
        grassOpenAfterPlan,
        plannedOnMyDay,
        myDayOccurrenceCount: occChips.length,
        modes: occChips.map((c) => ("mode" in c ? c.mode : null)),
      },
      null,
      2,
    ),
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
