import { startOfDay, subDays } from "date-fns";
import { prisma } from "../server/db/client";
import { ensurePersonalWorkspace } from "../server/domain/workspaces";
import { createTask, skipOccurrence } from "../server/domain/tasks";
import { getMyDay } from "../server/domain/my-day";
import { markMissedHardOccurrences } from "../server/domain/recurrence";

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "smoke@localhost" },
    create: { email: "smoke@localhost", name: "Smoke" },
    update: {},
  });
  const wsId = await ensurePersonalWorkspace(user.id, user.name);
  const inbox = await prisma.list.findFirstOrThrow({
    where: { workspaceId: wsId, isInbox: true },
  });

  const soft = await createTask({
    listId: inbox.id,
    title: "Soft vitamins",
    recurrence: {
      frequency: "daily",
      interval: 1,
      skippable: true,
      alarmPolicy: "none",
      byWeekday: [],
    },
  });
  const hard = await createTask({
    listId: inbox.id,
    title: "Hard meds",
    recurrence: {
      frequency: "daily",
      interval: 1,
      skippable: false,
      alarmPolicy: "panic",
      windowStart: "07:00",
      windowEnd: "08:00",
      byWeekday: [],
    },
  });
  await createTask({
    listId: inbox.id,
    title: "Laptop emails",
    kind: "flex",
    attentionCost: "light",
    estimatedMinutes: 20,
  });

  const softOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: soft.id },
    orderBy: { date: "asc" },
  });
  await skipOccurrence(softOcc.id);

  let hardSkipBlocked = false;
  const hardOcc = await prisma.taskOccurrence.findFirstOrThrow({
    where: { taskId: hard.id },
    orderBy: { date: "asc" },
  });
  try {
    await skipOccurrence(hardOcc.id);
  } catch {
    hardSkipBlocked = true;
  }

  await prisma.taskOccurrence.update({
    where: { id: hardOcc.id },
    data: {
      date: startOfDay(subDays(new Date(), 1)),
      scheduledEnd: subDays(new Date(), 1),
      status: "pending",
    },
  });
  const missed = await markMissedHardOccurrences();

  await prisma.calendarEventCache.upsert({
    where: {
      userId_googleEventId: { userId: user.id, googleEventId: "smoke-skating" },
    },
    create: {
      userId: user.id,
      googleEventId: "smoke-skating",
      title: "Kid skating",
      start: new Date(),
      end: new Date(Date.now() + 90 * 60_000),
      attentionMode: "partial",
      moveable: false,
    },
    update: {
      attentionMode: "partial",
      start: new Date(),
      end: new Date(Date.now() + 90 * 60_000),
    },
  });

  const day = await getMyDay(user.id, new Date());
  console.log(
    JSON.stringify(
      {
        softSkipped: true,
        hardSkipBlocked,
        missed,
        timelineTypes: day.timeline.map((t) => t.type),
        suggestions: day.suggestions.map((s) => ({
          title: s.eventTitle,
          n: s.tasks.length,
        })),
        alarmCount: await prisma.alarmEvent.count({
          where: { occurrenceId: hardOcc.id },
        }),
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
