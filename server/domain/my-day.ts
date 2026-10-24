import {
  AttentionMode,
  MyDayRefType,
  MyDaySource,
  OccurrenceStatus,
  type List,
} from "@prisma/client";
import { addDays, endOfDay, startOfDay } from "date-fns";
import { fromZonedTime } from "date-fns-tz";
import type { MyDayPatchInput } from "../../packages/api-types";
import { prisma } from "../db/client";
import { materializeAllActiveRules, materializeOccurrencesForTask } from "./recurrence";

const OPEN_OCC_STATUSES: OccurrenceStatus[] = [
  OccurrenceStatus.pending,
  OccurrenceStatus.snoozed,
];

function streamInfo(list: List) {
  return {
    listId: list.id,
    streamColor: list.isInbox ? null : list.color,
    isInbox: list.isInbox,
  };
}

export async function getMyDay(userId: string, date: Date) {
  // Get user's timezone for proper date interpretation
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const userTz = user?.timezone ?? "America/New_York";

  // Convert the requested date to user's timezone
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  // For completed items, search a 3-day window to account for UTC/local timezone mismatches
  // (yesterday, today, tomorrow in terms of the date field, then filter by actual completion time)
  const completedSearchStart = addDays(dayStart, -2);

  // Ensure current open chips exist before reading
  await materializeAllActiveRules();

  const [items, occurrences, completedOccurrences, calendarEvents, recentFlex, scheduledFlex, completedFlexTasks] = await Promise.all([
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
        task: {
          archivedAt: null,
          list: { workspace: { memberships: { some: { userId } } } },
        },
      },
      include: {
        task: { include: { recurrenceRule: true, list: true } },
      },
    }),
    prisma.taskOccurrence.findMany({
      where: {
        date: { gte: completedSearchStart, lte: addDays(dayEnd, 2) },
        status: {
          in: [OccurrenceStatus.done, OccurrenceStatus.skipped],
        },
        task: {
          archivedAt: null,
          list: { workspace: { memberships: { some: { userId } } } },
        },
      },
      include: {
        task: { include: { recurrenceRule: true, list: true } },
      },
      orderBy: { updatedAt: "desc" },
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
    // Flex tasks scheduled around this day, so they show even when older than
    // the newest 50. Padded a day each side; the client decides what is "today"
    // in the viewer's time zone.
    prisma.task.findMany({
      where: {
        kind: "flex",
        completedAt: null,
        archivedAt: null,
        dueAt: { gte: addDays(dayStart, -1), lte: addDays(dayEnd, 1) },
        list: { workspace: { memberships: { some: { userId } } } },
      },
      include: { list: true },
      orderBy: { dueAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        kind: "flex",
        completedAt: { gte: completedSearchStart, lte: addDays(dayEnd, 2) },
        archivedAt: null,
        list: { workspace: { memberships: { some: { userId } } } },
      },
      include: { list: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);

  const recentIds = new Set(recentFlex.map((t) => t.id));
  const flexCandidates = [
    ...recentFlex,
    ...scheduledFlex.filter((t) => !recentIds.has(t.id)),
  ];
  // Pinned tasks can be older than the newest 50 (e.g. picked from a stream backlog).
  const candidateIds = new Set(flexCandidates.map((t) => t.id));
  const missingPinnedIds = items
    .filter((i) => i.refType === MyDayRefType.flex && !candidateIds.has(i.refId))
    .map((i) => i.refId);
  if (missingPinnedIds.length > 0) {
    flexCandidates.push(
      ...(await prisma.task.findMany({
        where: {
          id: { in: missingPinnedIds },
          completedAt: null,
          archivedAt: null,
          list: { workspace: { memberships: { some: { userId } } } },
        },
        include: { list: true },
      })),
    );
  }

  // At most one missed chip per template (latest only already via single-open rule)
  const pinnedKeys = new Set(items.map((i) => `${i.refType}:${i.refId}`));

  // Rolling (every-N-after-done) stays in Streams until you pick it up — only
  // habit/fixed auto-land on My Day. Pinned rolling chips are included.
  const visibleOccurrences = occurrences.filter((occ) => {
    const mode = occ.task.recurrenceRule?.mode ?? "rolling";
    if (mode !== "rolling") return true;
    return pinnedKeys.has(`occurrence:${occ.id}`);
  });

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
    ...visibleOccurrences.map((occ) => ({
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
      ...streamInfo(occ.task.list),
      mode: occ.task.recurrenceRule?.mode ?? "rolling",
      dueSince: occ.dueSince,
      frequency: occ.task.recurrenceRule?.frequency,
      interval: occ.task.recurrenceRule?.interval,
    })),
    ...items
      .filter((i) => i.refType === MyDayRefType.flex)
      .flatMap((i) => {
        const task = flexCandidates.find((t) => t.id === i.refId);
        if (!task) return [];
        return [
          {
            type: "flex" as const,
            id: i.refId,
            title: task.title,
            pinned: i.pinned,
            sortOrder: i.sortOrder,
            moveable: true,
            attentionCost: task.attentionCost,
            estimatedMinutes: task.estimatedMinutes,
            listName: task.list.name,
            ...streamInfo(task.list),
            source: i.source,
            priority: task.priority,
            dueAt: task.dueAt,
            templateId: task.templateId,
          },
        ];
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
          dueAt: t.dueAt,
          templateId: t.templateId,
        })),
      };
    });

  const streams = await prisma.list.findMany({
    where: {
      isInbox: false,
      archivedAt: null,
      workspace: { type: "personal", memberships: { some: { userId } } },
    },
    select: { id: true, name: true, color: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  // Filter completed items to only include those completed within the requested day in user's timezone
  const userDayStart = fromZonedTime(dayStart, userTz);
  const userDayEnd = fromZonedTime(dayEnd, userTz);

  const completed = [
    ...completedOccurrences
      .filter((occ) => occ.updatedAt >= userDayStart && occ.updatedAt <= userDayEnd)
      .map((occ) => ({
        type: "occurrence" as const,
        id: occ.id,
        taskId: occ.taskId,
        title: occ.task.title,
        status: occ.status,
        completedAt: occ.updatedAt.toISOString(),
        listName: occ.task.list.name,
        ...streamInfo(occ.task.list),
      })),
    ...completedFlexTasks
      .filter((task) => task.completedAt! >= userDayStart && task.completedAt! <= userDayEnd)
      .map((task) => ({
        type: "flex" as const,
        id: task.id,
        title: task.title,
        completedAt: task.completedAt!.toISOString(),
        listName: task.list.name,
        ...streamInfo(task.list),
      })),
  ].sort((a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime());

  return {
    date: dayStart,
    items,
    timeline,
    suggestions,
    flexAvailable: flexCandidates,
    streams,
    completed,
  };
}

/**
 * Put a rolling ("every N after done") task on My Day, or take it off.
 * Streams pin with refType flex + task id; we resolve to an occurrence pin.
 */
export async function setRollingTaskOnMyDay(
  userId: string,
  taskId: string,
  day: Date,
  pinned: boolean,
  source: MyDaySource = MyDaySource.manual,
) {
  const dayStart = startOfDay(day);

  if (!pinned) {
    const open = await prisma.taskOccurrence.findMany({
      where: { taskId, status: { in: OPEN_OCC_STATUSES } },
      select: { id: true },
    });
    if (open.length === 0) return null;
    await prisma.myDayItem.deleteMany({
      where: {
        userId,
        date: dayStart,
        refType: MyDayRefType.occurrence,
        refId: { in: open.map((o) => o.id) },
      },
    });
    return null;
  }

  const rule = await prisma.recurrenceRule.findUnique({ where: { taskId } });
  if (!rule || rule.mode !== "rolling") {
    throw new Error("NOT_ROLLING");
  }
  // Early pickup: bring nextDue forward so materialize can open a chip today.
  if (rule.nextDueAt && startOfDay(rule.nextDueAt) > dayStart) {
    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextDueAt: dayStart },
    });
  }

  const occ = await materializeOccurrencesForTask(taskId);
  if (!occ) throw new Error("ROLLING_NOT_AVAILABLE");

  const max = await prisma.myDayItem.aggregate({
    where: { userId, date: dayStart },
    _max: { sortOrder: true },
  });
  await prisma.myDayItem.upsert({
    where: {
      userId_date_refType_refId: {
        userId,
        date: dayStart,
        refType: MyDayRefType.occurrence,
        refId: occ.id,
      },
    },
    create: {
      userId,
      date: dayStart,
      refType: MyDayRefType.occurrence,
      refId: occ.id,
      pinned: true,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
      source,
    },
    update: { pinned: true, source },
  });
  return occ;
}

export async function patchMyDay(userId: string, input: MyDayPatchInput) {
  const day = startOfDay(new Date(input.date + "T00:00:00"));

  if (input.pin) {
    // Streams pins rolling templates with refType flex + task id.
    if (input.pin.refType === MyDayRefType.flex) {
      const task = await prisma.task.findUnique({
        where: { id: input.pin.refId },
        include: { recurrenceRule: true },
      });
      if (task?.recurrenceRule?.mode === "rolling") {
        await setRollingTaskOnMyDay(userId, task.id, day, input.pin.pinned);
        return getMyDay(userId, day);
      }
    }

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
        // Pinning a suggestion by hand keeps it.
        update: { pinned: true, source: MyDaySource.manual },
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
