import {
  AlarmPolicy,
  OccurrenceStatus,
  TaskKind,
  type Prisma,
  type RecurrenceMode,
} from "@prisma/client";
import { addDays, format, parseISO, startOfDay } from "date-fns";
import type { CreateTaskInput, UpdateTaskInput } from "../../packages/api-types";
import { prisma } from "../db/client";
import {
  completeOccurrenceAndAdvance,
  materializeOccurrencesForTask,
  nextMatchingDate,
  skipOccurrenceAndAdvance,
  type SkipAction,
} from "./recurrence";

export async function getInboxListId(workspaceId: string) {
  const inbox = await prisma.list.findFirst({
    where: { workspaceId, isInbox: true },
  });
  if (!inbox) throw new Error("INBOX_MISSING");
  return inbox.id;
}

/** Single Inbox for the user's personal workspace. */
export async function getInboxForUser(userId: string) {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspace: { type: "personal" } },
    include: {
      workspace: {
        include: {
          lists: { where: { isInbox: true }, take: 1 },
        },
      },
    },
  });
  const inbox = membership?.workspace.lists[0];
  if (!inbox) throw new Error("INBOX_MISSING");
  return inbox;
}

export async function listInboxTasks(userId: string) {
  const inbox = await getInboxForUser(userId);
  const [tasks, trash] = await Promise.all([
    prisma.task.findMany({
      where: { listId: inbox.id, archivedAt: null },
      include: { recurrenceRule: true },
      orderBy: [{ completedAt: "asc" }, { kind: "asc" }, { createdAt: "desc" }],
    }),
    prisma.task.findMany({
      where: { listId: inbox.id, archivedAt: { not: null } },
      include: { recurrenceRule: true },
      orderBy: { archivedAt: "desc" },
      take: 50,
    }),
  ]);
  return { inbox, tasks, trash };
}

/** Soft-delete: archive to trash and drop every My Day pin for this task. */
export async function trashTask(taskId: string) {
  const occurrences = await prisma.taskOccurrence.findMany({
    where: { taskId },
    select: { id: true },
  });
  const occurrenceIds = occurrences.map((o) => o.id);

  const [task] = await prisma.$transaction([
    prisma.task.update({
      where: { id: taskId },
      data: { archivedAt: new Date() },
      include: { recurrenceRule: true },
    }),
    prisma.myDayItem.deleteMany({
      where: {
        OR: [
          { refType: "flex", refId: taskId },
          ...(occurrenceIds.length > 0
            ? [{ refType: "occurrence" as const, refId: { in: occurrenceIds } }]
            : []),
        ],
      },
    }),
  ]);

  return task;
}

export async function restoreTask(taskId: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: { archivedAt: null },
    include: { recurrenceRule: true },
  });
}

function resolveRecurrenceMode(
  input: NonNullable<CreateTaskInput["recurrence"]>,
): RecurrenceMode {
  if (input.mode) return input.mode as RecurrenceMode;
  if (input.skippable === false || (input.alarmPolicy && input.alarmPolicy !== "none")) {
    return "fixed";
  }
  return "rolling";
}

function recurrenceCreateData(input: NonNullable<CreateTaskInput["recurrence"]>) {
  const mode = resolveRecurrenceMode(input);
  const skippable = mode === "habit" ? true : (input.skippable ?? true);
  const alarmPolicy =
    mode === "habit"
      ? AlarmPolicy.none
      : (input.alarmPolicy ?? AlarmPolicy.none);
  const today = startOfDay(new Date());

  const pseudoRule = {
    frequency: input.frequency,
    interval: input.interval ?? 1,
    byWeekday: input.byWeekday ?? [],
    mode,
    createdAt: new Date(),
    id: "",
    taskId: "",
    skippable,
    alarmPolicy,
    windowStart: null,
    windowEnd: null,
    nextDueAt: null,
    activeMonths: input.activeMonths ?? [],
    pauseUntil: null,
    active: true,
    updatedAt: new Date(),
  };

  let nextDueAt = today;
  if (mode === "habit" || mode === "fixed") {
    nextDueAt = nextMatchingDate(pseudoRule, today);
  }

  return {
    mode,
    frequency: input.frequency,
    interval: input.interval ?? 1,
    byWeekday: input.byWeekday ?? [],
    skippable,
    alarmPolicy,
    windowStart: input.windowStart ?? null,
    windowEnd: input.windowEnd ?? null,
    activeMonths: input.activeMonths ?? [],
    pauseUntil: input.pauseUntil ? new Date(input.pauseUntil) : null,
    nextDueAt,
  };
}

export async function createTask(input: CreateTaskInput & { listId: string }) {
  const kind = input.recurrence ? TaskKind.template : (input.kind ?? TaskKind.flex);

  const task = await prisma.task.create({
    data: {
      listId: input.listId,
      title: input.title,
      notes: input.notes ?? null,
      priority: input.priority ?? "none",
      kind,
      attentionCost: input.attentionCost ?? "any",
      estimatedMinutes: input.estimatedMinutes ?? null,
      dueAt: input.dueAt ? new Date(input.dueAt) : null,
      recurrenceRule: input.recurrence
        ? { create: recurrenceCreateData(input.recurrence) }
        : undefined,
    },
    include: { recurrenceRule: true },
  });

  if (task.recurrenceRule) {
    await materializeOccurrencesForTask(task.id);
  }

  return task;
}

export async function updateTask(taskId: string, input: UpdateTaskInput) {
  const data: Prisma.TaskUpdateInput = {};
  if (input.title !== undefined) data.title = input.title;
  if (input.notes !== undefined) data.notes = input.notes;
  if (input.priority !== undefined) data.priority = input.priority;
  if (input.attentionCost !== undefined) data.attentionCost = input.attentionCost;
  if (input.estimatedMinutes !== undefined) data.estimatedMinutes = input.estimatedMinutes;
  if (input.dueAt !== undefined) data.dueAt = input.dueAt ? new Date(input.dueAt) : null;
  if (input.listId !== undefined) data.list = { connect: { id: input.listId } };
  if (input.archived === true) {
    return trashTask(taskId);
  }
  if (input.archived === false) {
    return restoreTask(taskId);
  }
  if (input.kind !== undefined) data.kind = input.kind;

  if (input.recurrence) {
    data.kind = TaskKind.template;
    const rec = recurrenceCreateData(input.recurrence);
    data.recurrenceRule = {
      upsert: {
        create: rec,
        update: {
          mode: rec.mode,
          frequency: rec.frequency,
          interval: rec.interval,
          byWeekday: rec.byWeekday,
          skippable: rec.skippable,
          alarmPolicy: rec.alarmPolicy,
          windowStart: rec.windowStart,
          windowEnd: rec.windowEnd,
          activeMonths: rec.activeMonths,
          pauseUntil: rec.pauseUntil,
          nextDueAt: rec.nextDueAt,
        },
      },
    };
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data,
    include: { recurrenceRule: true },
  });

  if (input.recurrence) {
    await materializeOccurrencesForTask(taskId);
  }

  return task;
}

export async function completeFlexTask(taskId: string) {
  return prisma.task.update({
    where: { id: taskId },
    data: { completedAt: new Date() },
  });
}

export async function completeOccurrence(occurrenceId: string) {
  return completeOccurrenceAndAdvance(occurrenceId);
}

export async function skipOccurrence(
  occurrenceId: string,
  opts?: { action?: SkipAction; reason?: string | null; deferDays?: number },
) {
  return skipOccurrenceAndAdvance(occurrenceId, opts);
}

export async function getTaskForUser(taskId: string, userId: string) {
  return prisma.task.findFirst({
    where: {
      id: taskId,
      list: { workspace: { memberships: { some: { userId } } } },
    },
    include: { recurrenceRule: true, list: true },
  });
}

export function parseDateOnly(dateStr: string) {
  return startOfDay(parseISO(dateStr));
}

export function todayDateOnly(timezoneDate = new Date()) {
  return startOfDay(timezoneDate);
}

export function dateKey(d: Date) {
  return format(d, "yyyy-MM-dd");
}

export function rangeDays(from: Date, days: number) {
  return Array.from({ length: days }, (_, i) => addDays(from, i));
}

export { OccurrenceStatus };
