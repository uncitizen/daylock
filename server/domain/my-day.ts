import { AttentionMode, MyDayRefType, OccurrenceStatus } from "@prisma/client";
import { endOfDay, startOfDay } from "date-fns";
import type { MyDayPatchInput } from "../../packages/api-types";
import { prisma } from "../db/client";
import { materializeAllActiveRules } from "./recurrence";

export async function getMyDay(userId: string, date: Date) {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // Ensure current open chips exist before reading
  await materializeAllActiveRules();

  const [items, occurrences, calendarEvents, flexCandidates] = await Promise.all([
    prisma.myDayItem.findMany({
      where: { userId, date: dayStart },
      orderBy: [{ pinned: "desc" }, { sortOrder: "asc" }],
    }),
    prisma.taskOccurrence.findMany({
      where: {
        date: dayStart,
        status: {
          in: [OccurrenceStatus.pending, OccurrenceStatus.snoozed, OccurrenceStatus.missed],
        },
        task: { list: { workspace: { memberships: { some: { userId } } } } },
      },
      include: {
        task: { include: { recurrenceRule: true, list: true } },
      },
    }),
    prisma.calendarEventCache.findMany({
      where: {
        userId,
        start: { lte: dayEnd },
        end: { gte: dayStart },
      },
      orderBy: { start: "asc" },
    }),
    prisma.task.findMany({
      where: {
        kind: "flex",
        completedAt: null,
        archivedAt: null,
        list: { workspace: { memberships: { some: { userId } } } },
      },
      include: { list: true },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  // At most one missed chip per template (latest only already via single-open rule)
  const pinnedKeys = new Set(items.map((i) => `${i.refType}:${i.refId}`));

  const timeline = [
    ...calendarEvents.map((ev) => ({
      type: "calendar" as const,
      id: ev.id,
      title: ev.title,
      start: ev.start,
      end: ev.end,
      attentionMode: ev.attentionMode,
      moveable: false,
      pinned: pinnedKeys.has(`calendar:${ev.id}`),
      location: ev.location,
    })),
    ...occurrences.map((occ) => ({
      type: "occurrence" as const,
      id: occ.id,
      taskId: occ.taskId,
      title: occ.task.title,
      status: occ.status,
      skippable: occ.skippableSnapshot,
      alarmPolicy: occ.alarmPolicySnapshot,
      scheduledStart: occ.scheduledStart,
      scheduledEnd: occ.scheduledEnd,
      moveable: false,
      hard: !occ.skippableSnapshot,
      pinned: pinnedKeys.has(`occurrence:${occ.id}`),
      attentionCost: occ.task.attentionCost,
      estimatedMinutes: occ.task.estimatedMinutes,
      listName: occ.task.list.name,
      mode: occ.task.recurrenceRule?.mode ?? "rolling",
      dueSince: occ.dueSince,
      frequency: occ.task.recurrenceRule?.frequency,
      interval: occ.task.recurrenceRule?.interval,
    })),
    ...items
      .filter((i) => i.refType === MyDayRefType.flex)
      .map((i) => {
        const task = flexCandidates.find((t) => t.id === i.refId);
        return {
          type: "flex" as const,
          id: i.refId,
          title: task?.title ?? "Task",
          pinned: i.pinned,
          sortOrder: i.sortOrder,
          moveable: true,
          attentionCost: task?.attentionCost ?? "any",
          estimatedMinutes: task?.estimatedMinutes ?? null,
          listName: task?.list.name,
          priority: task?.priority,
        };
      }),
  ];

  const suggestions = calendarEvents
    .filter(
      (ev) =>
        ev.attentionMode === AttentionMode.partial ||
        ev.attentionMode === AttentionMode.idle,
    )
    .map((ev) => {
      const remainingMin = Math.max(
        0,
        Math.round((ev.end.getTime() - Date.now()) / 60_000),
      );
      const fits = flexCandidates.filter((t) => {
        if (t.attentionCost === "deep" && ev.attentionMode === AttentionMode.partial) {
          return false;
        }
        if (
          t.estimatedMinutes != null &&
          remainingMin > 0 &&
          t.estimatedMinutes > remainingMin
        ) {
          return false;
        }
        const alreadyPinned = pinnedKeys.has(`flex:${t.id}`);
        return !alreadyPinned;
      });
      return {
        eventId: ev.id,
        eventTitle: ev.title,
        attentionMode: ev.attentionMode,
        remainingMinutes: remainingMin,
        tasks: fits.slice(0, 5).map((t) => ({
          id: t.id,
          title: t.title,
          estimatedMinutes: t.estimatedMinutes,
          attentionCost: t.attentionCost,
        })),
      };
    });

  return {
    date: dayStart,
    items,
    timeline,
    suggestions,
    flexAvailable: flexCandidates,
  };
}

export async function patchMyDay(userId: string, input: MyDayPatchInput) {
  const day = startOfDay(new Date(input.date + "T00:00:00"));

  if (input.pin) {
    if (input.pin.pinned) {
      const max = await prisma.myDayItem.aggregate({
        where: { userId, date: day },
        _max: { sortOrder: true },
      });
      await prisma.myDayItem.upsert({
        where: {
          userId_date_refType_refId: {
            userId,
            date: day,
            refType: input.pin.refType,
            refId: input.pin.refId,
          },
        },
        create: {
          userId,
          date: day,
          refType: input.pin.refType,
          refId: input.pin.refId,
          pinned: true,
          sortOrder: (max._max.sortOrder ?? 0) + 1,
        },
        update: { pinned: true },
      });
    } else {
      await prisma.myDayItem.deleteMany({
        where: {
          userId,
          date: day,
          refType: input.pin.refType,
          refId: input.pin.refId,
        },
      });
    }
  }

  if (input.items) {
    await prisma.$transaction(
      input.items.map((item) =>
        prisma.myDayItem.upsert({
          where: {
            userId_date_refType_refId: {
              userId,
              date: day,
              refType: item.refType,
              refId: item.refId,
            },
          },
          create: {
            userId,
            date: day,
            refType: item.refType,
            refId: item.refId,
            sortOrder: item.sortOrder,
            pinned: item.pinned ?? true,
          },
          update: {
            sortOrder: item.sortOrder,
            pinned: item.pinned ?? true,
          },
        }),
      ),
    );
  }

  return getMyDay(userId, day);
}
