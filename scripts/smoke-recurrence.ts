import { addDays, addMonths, startOfDay, subDays } from "date-fns";
import { prisma } from "../server/db/client";
import { ensurePersonalWorkspace } from "../server/domain/workspaces";
import {
  createTask,
  skipOccurrence,
  completeOccurrence,
} from "../server/domain/tasks";
import { getMyDay, setRollingTaskOnMyDay } from "../server/domain/my-day";
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

  // Due rolling: open chip exists but must NOT auto-land on My Day.
  const promo = await createTask({
    listId: inbox.id,
    title: "Analyze promo results",
    recurrence: {
      mode: "rolling",
      frequency: "monthly",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
    },
  });
  const promoOpen = await prisma.taskOccurrence.count({
    where: { taskId: promo.id, status: "pending" },
  });

  let day = await getMyDay(user.id, new Date());
  let occChips = day.timeline.filter((t) => t.type === "occurrence");
  const promoAutoOnMyDay = occChips.some(
    (c) => c.type === "occurrence" && c.taskId === promo.id,
  );
  const grassAutoOnMyDay = occChips.some(
    (c) => c.type === "occurrence" && c.taskId === grass.id,
  );

  // Pickup → appears on My Day.
  await setRollingTaskOnMyDay(user.id, promo.id, new Date(), true);
  day = await getMyDay(user.id, new Date());
  occChips = day.timeline.filter((t) => t.type === "occurrence");
  const promoPinnedOnMyDay = occChips.some(
    (c) => c.type === "occurrence" && c.taskId === promo.id,
  );

  // Done → next month same calendar date, off My Day again.
  const promoOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: promo.id, status: "pending" },
  });
  const completedOn = startOfDay(new Date());
  await completeOccurrence(promoOcc.id);
  const promoRule = await prisma.recurrenceRule.findUniqueOrThrow({
    where: { taskId: promo.id },
  });
  const expectedNext = addMonths(completedOn, 1);
  day = await getMyDay(user.id, new Date());
  occChips = day.timeline.filter((t) => t.type === "occurrence");
  const promoAfterDoneOnMyDay = occChips.some(
    (c) => c.type === "occurrence" && c.taskId === promo.id,
  );

  // Future nextDue — no open chip, not on My Day.
  const plannedDue = startOfDay(addDays(new Date(), 20));
  const planned = await createTask({
    listId: inbox.id,
    title: "Future rolling",
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

  console.log(
    JSON.stringify(
      {
        habitOpen,
        grassOpen,
        habitOpenAfterSkip,
        expired,
        promoOpen,
        promoAutoOnMyDay,
        grassAutoOnMyDay,
        promoPinnedOnMyDay,
        promoNextDue: promoRule.nextDueAt,
        expectedNext,
        nextDueMatchesMonth: startOfDay(promoRule.nextDueAt!).getTime() === expectedNext.getTime(),
        promoAfterDoneOnMyDay,
        plannedOpen,
        myDayModes: occChips.map((c) => ("mode" in c ? c.mode : null)),
      },
      null,
      2,
    ),
  );

  if (promoAutoOnMyDay || grassAutoOnMyDay) {
    throw new Error("Rolling tasks must not auto-appear on My Day");
  }
  if (!promoPinnedOnMyDay) {
    throw new Error("Pinned rolling task should appear on My Day");
  }
  if (promoAfterDoneOnMyDay) {
    throw new Error("Completed rolling task should leave My Day");
  }
  if (startOfDay(promoRule.nextDueAt!).getTime() !== expectedNext.getTime()) {
    throw new Error("Monthly rolling should advance to same date next month");
  }
  if (plannedOpen !== 0) {
    throw new Error("Future nextDueAt must not open a chip yet");
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
