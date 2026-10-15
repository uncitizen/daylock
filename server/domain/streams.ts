import { MyDayRefType, MyDaySource, OccurrenceStatus } from "@prisma/client";
import { addDays, differenceInCalendarDays, endOfDay, startOfDay } from "date-fns";
import { prisma } from "../db/client";

/** Minutes credited for a finished task with no estimate. */
const DEFAULT_TASK_MINUTES = 30;
/** Balance is measured over this many days, ending on the viewed day. */
export const BALANCE_WINDOW_DAYS = 7;
const MAX_QUIET_DAYS = 30;

export const STREAM_COLORS = [
  "#c2416b",
  "#2f7d5b",
  "#b7791f",
  "#2b6cb0",
  "#6b5bd2",
  "#0f766e",
  "#9a3412",
  "#4b5563",
];

export const STREAM_PRESETS = [
  { name: "Kids", color: "#c2416b", weight: 25 },
  { name: "Health", color: "#2f7d5b", weight: 25 },
  { name: "House", color: "#b7791f", weight: 10 },
  { name: "Work", color: "#2b6cb0", weight: 20 },
  { name: "App", color: "#6b5bd2", weight: 20 },
];

export type StreamStatus = "needs_you" | "drifting" | "on_track";

/**
 * How much a stream is asking for attention: under-served share of the week
 * (doubled, so it dominates) plus quiet days scaled by how much the stream matters.
 */
export function streamPressure(targetPct: number, actualPct: number, daysQuiet: number) {
  return 2 * Math.max(0, targetPct - actualPct) + (daysQuiet * targetPct) / 10;
}

function pressureStatus(pressure: number): StreamStatus {
  if (pressure >= 30) return "needs_you";
  if (pressure >= 12) return "drifting";
  return "on_track";
}

export async function getPersonalWorkspaceId(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspace: { type: "personal" } },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error("WORKSPACE_MISSING");
  return membership.workspaceId;
}

/** A list the user can reach, for moving tasks between lists. */
export async function findListForUser(listId: string, userId: string) {
  return prisma.list.findFirst({
    where: {
      id: listId,
      archivedAt: null,
      workspace: { memberships: { some: { userId } } },
    },
  });
}

export async function findStreamForUser(streamId: string, userId: string) {
  return prisma.list.findFirst({
    where: {
      id: streamId,
      isInbox: false,
      workspace: { type: "personal", memberships: { some: { userId } } },
    },
  });
}

export async function findGoalForUser(goalId: string, userId: string) {
  return prisma.goal.findFirst({
    where: {
      id: goalId,
      list: { workspace: { memberships: { some: { userId } } } },
    },
  });
}

const openTaskWhere = { completedAt: null, archivedAt: null } as const;

/** Everything the Streams page needs: Inbox lane, stream lanes and the week's balance. */
export async function getStreamsBoard(userId: string, date: Date) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const dayEnd = endOfDay(date);
  const windowStart = startOfDay(addDays(date, -(BALANCE_WINDOW_DAYS - 1)));

  const lists = await prisma.list.findMany({
    where: { workspaceId, archivedAt: null },
    include: {
      goals: { where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      tasks: {
        where: openTaskWhere,
        include: { recurrenceRule: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  const inbox = lists.find((l) => l.isInbox);
  if (!inbox) throw new Error("INBOX_MISSING");
  const streams = lists.filter((l) => !l.isInbox);
  await backfillColors(streams);
  const streamIds = streams.map((s) => s.id);

  const [doneTasks, doneOccurrences, pinnedToday, lastTaskByList, lastOccurrences] =
    await Promise.all([
      prisma.task.findMany({
        where: {
          listId: { in: streamIds },
          kind: "flex",
          completedAt: { gte: windowStart, lte: dayEnd },
        },
        select: { listId: true, estimatedMinutes: true },
      }),
      prisma.taskOccurrence.findMany({
        where: {
          status: OccurrenceStatus.done,
          completedAt: { gte: windowStart, lte: dayEnd },
          task: { listId: { in: streamIds } },
        },
        select: { task: { select: { listId: true, estimatedMinutes: true } } },
      }),
      prisma.myDayItem.findMany({
        where: { userId, date: startOfDay(date), refType: MyDayRefType.flex },
        select: { refId: true },
      }),
      prisma.task.groupBy({
        by: ["listId"],
        where: { listId: { in: streamIds }, completedAt: { not: null, lte: dayEnd } },
        _max: { completedAt: true },
      }),
      Promise.all(
        streamIds.map((listId) =>
          prisma.taskOccurrence.findFirst({
            where: {
              status: OccurrenceStatus.done,
              completedAt: { not: null, lte: dayEnd },
              task: { listId },
            },
            orderBy: { completedAt: "desc" },
            select: { completedAt: true },
          }),
        ),
      ),
    ]);

  const minutesByList = new Map<string, number>();
  for (const t of [...doneTasks, ...doneOccurrences.map((o) => o.task)]) {
    const mins = t.estimatedMinutes ?? DEFAULT_TASK_MINUTES;
    minutesByList.set(t.listId, (minutesByList.get(t.listId) ?? 0) + mins);
  }
  const totalMinutes = [...minutesByList.values()].reduce((a, b) => a + b, 0);
  const totalWeight = streams.reduce((a, s) => a + s.weight, 0);
  const pinnedIds = new Set(pinnedToday.map((p) => p.refId));

  const lastActivity = new Map<string, Date>();
  for (const row of lastTaskByList) {
    if (row._max.completedAt) lastActivity.set(row.listId, row._max.completedAt);
  }
  streamIds.forEach((listId, i) => {
    const occ = lastOccurrences[i]?.completedAt;
    const prev = lastActivity.get(listId);
    if (occ && (!prev || occ > prev)) lastActivity.set(listId, occ);
  });

  const toLane = (l: (typeof lists)[number]) =>
    l.tasks.map((t) => ({
      id: t.id,
      title: t.title,
      goalId: t.goalId,
      sortOrder: t.sortOrder,
      kind: t.kind,
      estimatedMinutes: t.estimatedMinutes,
      dueAt: t.dueAt,
      repeatMode: t.recurrenceRule?.mode ?? null,
      pinnedToday: pinnedIds.has(t.id),
      createdAt: t.createdAt,
    }));

  const streamCards = streams.map((s) => {
    const targetPct = totalWeight > 0 ? (s.weight / totalWeight) * 100 : 0;
    const actualMinutes = minutesByList.get(s.id) ?? 0;
    // With nothing finished anywhere yet there's no balance to judge; only quiet days count.
    const actualPct = totalMinutes > 0 ? (actualMinutes / totalMinutes) * 100 : targetPct;
    const since = lastActivity.get(s.id) ?? s.createdAt;
    const daysQuiet = Math.min(
      MAX_QUIET_DAYS,
      Math.max(0, differenceInCalendarDays(date, since)),
    );
    const pressure = streamPressure(targetPct, actualPct, daysQuiet);
    return {
      id: s.id,
      name: s.name,
      color: s.color ?? STREAM_COLORS[0],
      weight: s.weight,
      sortOrder: s.sortOrder,
      targetPct,
      actualPct,
      actualMinutes,
      daysQuiet,
      lastActivityAt: lastActivity.get(s.id) ?? null,
      pressure,
      status: pressureStatus(pressure),
      goals: s.goals.map((g) => ({ id: g.id, title: g.title, sortOrder: g.sortOrder })),
      tasks: toLane(s),
    };
  });

  streamCards.sort((a, b) => b.pressure - a.pressure || a.sortOrder - b.sortOrder);

  return {
    date: startOfDay(date),
    windowDays: BALANCE_WINDOW_DAYS,
    totalMinutes,
    inbox: { id: inbox.id, name: inbox.name, tasks: toLane(inbox) },
    streams: streamCards,
    colors: STREAM_COLORS,
  };
}

/** Lists made before streams existed have no color; give each an unused one once. */
async function backfillColors(streams: { id: string; color: string | null }[]) {
  const used = new Set(streams.map((s) => s.color).filter(Boolean));
  for (const stream of streams) {
    if (stream.color) continue;
    const color = STREAM_COLORS.find((c) => !used.has(c)) ?? STREAM_COLORS[0];
    used.add(color);
    stream.color = color;
    await prisma.list.update({ where: { id: stream.id }, data: { color } });
  }
}

export type StreamsBoard = Awaited<ReturnType<typeof getStreamsBoard>>;

export async function createStream(
  userId: string,
  input: { name: string; color?: string | null; weight?: number },
) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const existing = await prisma.list.findMany({
    where: { workspaceId, isInbox: false, archivedAt: null },
    select: { color: true, sortOrder: true },
  });
  const used = new Set(existing.map((l) => l.color));
  const color = input.color ?? STREAM_COLORS.find((c) => !used.has(c)) ?? STREAM_COLORS[0];
  const sortOrder = Math.max(0, ...existing.map((l) => l.sortOrder)) + 1;
  return prisma.list.create({
    data: {
      workspaceId,
      name: input.name,
      color,
      weight: input.weight ?? 20,
      sortOrder,
    },
  });
}

/** Create the starter streams that don't exist yet (matched by name). */
export async function createPresetStreams(userId: string) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const existing = await prisma.list.findMany({
    where: { workspaceId, isInbox: false, archivedAt: null },
    select: { name: true },
  });
  const names = new Set(existing.map((l) => l.name.toLowerCase()));
  const missing = STREAM_PRESETS.filter((p) => !names.has(p.name.toLowerCase()));
  for (const preset of missing) {
    await createStream(userId, preset);
  }
  return missing.length;
}

export async function updateStream(
  streamId: string,
  input: { name?: string; color?: string; weight?: number; sortOrder?: number },
) {
  return prisma.list.update({ where: { id: streamId }, data: input });
}

/** Archive a stream: it leaves the board and its open tasks go back to the Inbox. */
export async function archiveStream(streamId: string) {
  const stream = await prisma.list.findUniqueOrThrow({ where: { id: streamId } });
  const inbox = await prisma.list.findFirst({
    where: { workspaceId: stream.workspaceId, isInbox: true },
  });
  if (!inbox) throw new Error("INBOX_MISSING");
  return prisma.$transaction([
    prisma.task.updateMany({
      where: { listId: streamId, completedAt: null },
      data: { listId: inbox.id, goalId: null },
    }),
    prisma.list.update({ where: { id: streamId }, data: { archivedAt: new Date() } }),
  ]);
}

export async function createGoal(listId: string, title: string) {
  const max = await prisma.goal.aggregate({
    where: { listId },
    _max: { sortOrder: true },
  });
  return prisma.goal.create({
    data: { listId, title, sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
}

export async function updateGoal(goalId: string, input: { title?: string; archived?: boolean }) {
  if (input.archived) {
    return prisma.$transaction(async (tx) => {
      await tx.task.updateMany({ where: { goalId }, data: { goalId: null } });
      return tx.goal.update({ where: { id: goalId }, data: { archivedAt: new Date() } });
    });
  }
  return prisma.goal.update({
    where: { id: goalId },
    data: { ...(input.title !== undefined ? { title: input.title } : {}) },
  });
}

function tagKey(name: string) {
  return name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");
}

/**
 * `#kids` in a captured title files the task under that stream. Returns the
 * title with the tag removed, or the original title when no stream matches.
 */
export async function resolveStreamTag(userId: string, title: string) {
  const tags = [...title.matchAll(/(^|\s)#([\p{L}\p{N}_-]+)/gu)];
  if (tags.length === 0) return { title, listId: null as string | null };
  const workspaceId = await getPersonalWorkspaceId(userId);
  const streams = await prisma.list.findMany({
    where: { workspaceId, isInbox: false, archivedAt: null },
    select: { id: true, name: true },
  });
  for (const match of tags) {
    const stream = streams.find((s) => tagKey(s.name) === tagKey(match[2]));
    if (stream) {
      const stripped = title.replace(match[0], match[1]).replace(/\s{2,}/g, " ").trim();
      return { title: stripped || title, listId: stream.id };
    }
  }
  return { title, listId: null };
}

type Candidate = {
  id: string;
  listId: string;
  goalId: string | null;
  dueAt: Date | null;
  createdAt: Date;
  position: number;
};

/** Best next task inside one stream: backlog order first, nudged by due dates and age. */
function scoreTask(t: Candidate, today: Date) {
  let score = -t.position * 3;
  if (t.dueAt) {
    const days = differenceInCalendarDays(t.dueAt, today);
    if (days <= 0) score += 50;
    else if (days <= 3) score += 20;
  }
  if (t.goalId) score += 5;
  score += Math.min(14, differenceInCalendarDays(today, t.createdAt)) * 0.5;
  return score;
}

/** Weighted draw without replacement, so the top stream wins most days but not every day. */
function drawWeighted<T>(items: T[], weight: (item: T) => number, count: number, rand = Math.random) {
  const pool = [...items];
  const out: T[] = [];
  while (out.length < count && pool.length > 0) {
    const total = pool.reduce((a, i) => a + weight(i), 0);
    let r = rand() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) {
      r -= weight(pool[idx]);
      if (r <= 0) break;
    }
    out.push(pool.splice(idx, 1)[0]);
  }
  return out;
}

/**
 * Suggest tasks for My Day from the streams that need attention. Earlier
 * suggestions you haven't kept are replaced. With `swapTaskId`, only that
 * suggestion is replaced, by another task from the same stream.
 */
export async function pickForToday(
  userId: string,
  date: Date,
  opts: { count?: number; swapTaskId?: string } = {},
) {
  const day = startOfDay(date);
  const board = await getStreamsBoard(userId, date);
  const items = await prisma.myDayItem.findMany({ where: { userId, date: day } });

  let streams = board.streams;
  let count = opts.count ?? 3;
  const excluded = new Set<string>();

  if (opts.swapTaskId) {
    const swapStream = streams.find((s) => s.tasks.some((t) => t.id === opts.swapTaskId));
    excluded.add(opts.swapTaskId);
    streams = swapStream ? [swapStream] : [];
    count = 1;
  } else {
    await prisma.myDayItem.deleteMany({
      where: { userId, date: day, source: MyDaySource.suggested },
    });
  }

  const keptIds = new Set(
    items
      .filter((i) => i.refType === MyDayRefType.flex && i.source === MyDaySource.manual)
      .map((i) => i.refId),
  );
  // When swapping, the other suggestions stay, so they can't be picked again either.
  for (const i of items) {
    if (opts.swapTaskId && i.refType === MyDayRefType.flex) excluded.add(i.refId);
  }

  const eligible = streams
    .map((s) => ({
      stream: s,
      tasks: s.tasks
        .map((t, position) => ({ ...t, listId: s.id, position }))
        .filter((t) => t.kind === "flex" && !keptIds.has(t.id) && !excluded.has(t.id)),
    }))
    .filter((s) => s.tasks.length > 0);

  // A stream already represented by a kept pin needs it less today.
  const pinnedStreams = new Set(
    board.streams.filter((s) => s.tasks.some((t) => keptIds.has(t.id))).map((s) => s.id),
  );
  const chosen = drawWeighted(
    eligible,
    (e) => (e.stream.pressure + 1) * (pinnedStreams.has(e.stream.id) ? 0.3 : 1),
    count,
  );

  if (opts.swapTaskId) {
    // Nothing to swap in: leave the current suggestion where it is.
    if (chosen.length === 0) return { picks: [] };
    await prisma.myDayItem.deleteMany({
      where: {
        userId,
        date: day,
        refType: MyDayRefType.flex,
        refId: opts.swapTaskId,
        source: MyDaySource.suggested,
      },
    });
  }

  const max = await prisma.myDayItem.aggregate({
    where: { userId, date: day },
    _max: { sortOrder: true },
  });
  let sortOrder = max._max.sortOrder ?? 0;

  const picks = [];
  for (const { stream, tasks } of chosen) {
    const best = [...tasks].sort((a, b) => scoreTask(b, day) - scoreTask(a, day))[0];
    sortOrder += 1;
    await prisma.myDayItem.upsert({
      where: {
        userId_date_refType_refId: {
          userId,
          date: day,
          refType: MyDayRefType.flex,
          refId: best.id,
        },
      },
      create: {
        userId,
        date: day,
        refType: MyDayRefType.flex,
        refId: best.id,
        pinned: true,
        sortOrder,
        source: MyDaySource.suggested,
      },
      update: {},
    });
    picks.push({
      taskId: best.id,
      title: best.title,
      streamId: stream.id,
      streamName: stream.name,
      reason: pickReason(stream),
    });
  }
  return { picks };
}

export function pickReason(stream: {
  daysQuiet: number;
  targetPct: number;
  actualPct: number;
}) {
  const parts: string[] = [];
  if (stream.daysQuiet >= 3) parts.push(`${stream.daysQuiet}d quiet`);
  if (stream.targetPct - stream.actualPct >= 5) {
    parts.push(`want ${Math.round(stream.targetPct)}% · got ${Math.round(stream.actualPct)}%`);
  }
  return parts.join(" · ") || "next in line";
}

/** Inbox plus streams and their goals, for pickers in the task editor. */
export async function getStreamOptions(userId: string) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const lists = await prisma.list.findMany({
    where: { workspaceId, archivedAt: null },
    select: {
      id: true,
      name: true,
      color: true,
      isInbox: true,
      goals: {
        where: { archivedAt: null },
        select: { id: true, title: true },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const inbox = lists.find((l) => l.isInbox);
  if (!inbox) throw new Error("INBOX_MISSING");
  return {
    inboxId: inbox.id,
    streams: lists
      .filter((l) => !l.isInbox)
      .map((l) => ({ id: l.id, name: l.name, color: l.color ?? STREAM_COLORS[0], goals: l.goals })),
  };
}
