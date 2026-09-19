import { startOfDay, subDays } from "date-fns";
import { prisma } from "../server/db/client";
import { ensurePersonalWorkspace } from "../server/domain/workspaces";
import { createTask, skipOccurrence, completeOccurrence } from "../server/domain/tasks";
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

  const day = await getMyDay(user.id, new Date());
  const occChips = day.timeline.filter((t) => t.type === "occurrence");

  console.log(
    JSON.stringify(
      {
        habitOpen,
        grassOpen,
        habitOpenAfterSkip,
        grassNextDue: grassRule.nextDueAt,
        expired,
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
