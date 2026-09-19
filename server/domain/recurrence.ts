import { type RecurrenceMode, type RecurrenceRule } from "@prisma/client";
import {
  addDays,
  addMonths,
  addWeeks,
  getDay,
  getMonth,
  setHours,
  setMinutes,
  startOfDay,
} from "date-fns";
import { prisma } from "../db/client";

const OPEN_STATUSES: Array<"pending" | "snoozed"> = ["pending", "snoozed"];

function parseWindowTime(base: Date, hhmm: string | null | undefined) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return setMinutes(setHours(startOfDay(base), h), m);
}

export function isSeasonallyActive(rule: RecurrenceRule, at = new Date()) {
  if (rule.pauseUntil && at < rule.pauseUntil) return false;
  const months = rule.activeMonths ?? [];
  if (months.length > 0) {
    const month = getMonth(at) + 1; // 1-12
    if (!months.includes(month)) return false;
  }
  return true;
}

/** Next calendar date matching fixed/habit weekday rules, starting from `from` (inclusive). */
export function nextMatchingDate(rule: RecurrenceRule, from: Date): Date {
  let cursor = startOfDay(from);
  for (let i = 0; i < 400; i++) {
    if (matchesCadenceDay(rule, cursor, from)) return cursor;
    cursor = addDays(cursor, 1);
  }
  return startOfDay(from);
}

function matchesCadenceDay(rule: RecurrenceRule, day: Date, _anchor: Date): boolean {
  const d = startOfDay(day);
  if (rule.frequency === "daily") return true;
  if (rule.frequency === "weekly") {
    const weekday = getDay(d);
    const days =
      (rule.byWeekday?.length ?? 0) > 0 ? rule.byWeekday : [getDay(rule.createdAt)];
    return days.includes(weekday);
  }
  if (rule.frequency === "monthly") {
    return d.getDate() === startOfDay(rule.createdAt).getDate();
  }
  return true;
}

export function advanceFromNow(rule: RecurrenceRule, from = new Date()): Date {
  const base = startOfDay(from);
  if (rule.frequency === "daily") return addDays(base, rule.interval);
  if (rule.frequency === "weekly") {
    if (rule.mode === "habit") {
      return nextMatchingDate(rule, addDays(base, 1));
    }
    return addWeeks(base, rule.interval);
  }
  if (rule.frequency === "monthly") return addMonths(base, rule.interval);
  return addDays(base, rule.interval);
}

async function closeExtraOpenOccurrences(taskId: string, keepId?: string) {
  const open = await prisma.taskOccurrence.findMany({
    where: { taskId, status: { in: OPEN_STATUSES } },
    orderBy: { date: "desc" },
  });
  for (const occ of open) {
    if (keepId && occ.id === keepId) continue;
    if (!keepId && occ.id === open[0]?.id) continue;
    await prisma.taskOccurrence.update({
      where: { id: occ.id },
      data: { status: "expired" },
    });
  }
}

async function upsertSingleOpenOccurrence(
  taskId: string,
  rule: RecurrenceRule,
  date: Date,
  dueSince?: Date | null,
) {
  const day = startOfDay(date);
  const scheduledStart = parseWindowTime(day, rule.windowStart);
  const scheduledEnd = parseWindowTime(day, rule.windowEnd);

  const existingOpen = await prisma.taskOccurrence.findFirst({
    where: { taskId, status: { in: OPEN_STATUSES } },
    orderBy: { date: "asc" },
  });

  if (existingOpen) {
    // Slide date if needed (unique on taskId+date)
    if (startOfDay(existingOpen.date).getTime() !== day.getTime()) {
      const clash = await prisma.taskOccurrence.findUnique({
        where: { taskId_date: { taskId, date: day } },
      });
      if (clash && clash.id !== existingOpen.id) {
        if ((OPEN_STATUSES as string[]).includes(clash.status)) {
          await prisma.taskOccurrence.update({
            where: { id: clash.id },
            data: { status: "expired" },
          });
        } else {
          // Closed row on target day — expire old open and create fresh
          await prisma.taskOccurrence.update({
            where: { id: existingOpen.id },
            data: { status: "expired" },
          });
          const created = await prisma.taskOccurrence.create({
            data: {
              taskId,
              date: day,
              status: "pending",
              scheduledStart,
              scheduledEnd,
              skippableSnapshot: rule.skippable,
              alarmPolicySnapshot: rule.alarmPolicy,
              dueSince: dueSince ?? existingOpen.dueSince ?? existingOpen.date,
            },
          });
          await closeExtraOpenOccurrences(taskId, created.id);
          return created;
        }
      }
      const updated = await prisma.taskOccurrence.update({
        where: { id: existingOpen.id },
        data: {
          date: day,
          scheduledStart,
          scheduledEnd,
          skippableSnapshot: rule.skippable,
          alarmPolicySnapshot: rule.alarmPolicy,
          dueSince:
            dueSince ??
            existingOpen.dueSince ??
            (startOfDay(existingOpen.date) < day ? existingOpen.date : null),
          status: "pending",
        },
      });
      await closeExtraOpenOccurrences(taskId, updated.id);
      return updated;
    }

    const updated = await prisma.taskOccurrence.update({
      where: { id: existingOpen.id },
      data: {
        scheduledStart,
        scheduledEnd,
        skippableSnapshot: rule.skippable,
        alarmPolicySnapshot: rule.alarmPolicy,
        dueSince: dueSince ?? existingOpen.dueSince,
        status: "pending",
      },
    });
    await closeExtraOpenOccurrences(taskId, updated.id);
    return updated;
  }

  const created = await prisma.taskOccurrence.upsert({
    where: { taskId_date: { taskId, date: day } },
    create: {
      taskId,
      date: day,
      status: "pending",
      scheduledStart,
      scheduledEnd,
      skippableSnapshot: rule.skippable,
      alarmPolicySnapshot: rule.alarmPolicy,
      dueSince: dueSince ?? null,
    },
    update: {
      status: "pending",
      scheduledStart,
      scheduledEnd,
      skippableSnapshot: rule.skippable,
      alarmPolicySnapshot: rule.alarmPolicy,
      dueSince: dueSince ?? null,
      completedAt: null,
      skipReason: null,
    },
  });
  await closeExtraOpenOccurrences(taskId, created.id);
  return created;
}

export async function materializeOccurrencesForTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { recurrenceRule: true },
  });
  if (!task?.recurrenceRule || !task.recurrenceRule.active) return null;

  const rule = {
    ...task.recurrenceRule,
    mode: task.recurrenceRule.mode ?? ("rolling" as RecurrenceMode),
    activeMonths: task.recurrenceRule.activeMonths ?? [],
    byWeekday: task.recurrenceRule.byWeekday ?? [],
  };
  const today = startOfDay(new Date());

  if (!isSeasonallyActive(rule, today)) {
    // Expire any open chips while paused/off-season
    await prisma.taskOccurrence.updateMany({
      where: { taskId, status: { in: OPEN_STATUSES } },
      data: { status: "expired" },
    });
    return null;
  }

  // Ensure nextDueAt exists
  let nextDue = rule.nextDueAt ? startOfDay(rule.nextDueAt) : null;
  if (!nextDue) {
    nextDue =
      rule.mode === "fixed"
        ? nextMatchingDate(rule, today)
        : rule.mode === "habit"
          ? nextMatchingDate(rule, today)
          : today;
    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextDueAt: nextDue },
    });
  }

  if (rule.mode === "habit") {
    // Only show on matching days; chip dated today when due
    if (!matchesCadenceDay(rule, today, today)) {
      await prisma.taskOccurrence.updateMany({
        where: { taskId, status: { in: OPEN_STATUSES }, date: { lt: today } },
        data: { status: "expired" },
      });
      return null;
    }
    if (nextDue > today) return null;
    return upsertSingleOpenOccurrence(taskId, rule, today, null);
  }

  if (rule.mode === "rolling") {
    if (nextDue > today) {
      // Not due yet — no open chip
      await prisma.taskOccurrence.updateMany({
        where: { taskId, status: { in: OPEN_STATUSES } },
        data: { status: "expired" },
      });
      return null;
    }
    // Soft slide: one chip on today, remember original due
    const dueSince = nextDue < today ? nextDue : null;
    return upsertSingleOpenOccurrence(taskId, rule, today, dueSince);
  }

  // fixed: next matching calendar slot, cap 1 pending
  if (nextDue > today) {
    // Future fixed slot — only materialize when it's today
    return null;
  }
  const slot = nextMatchingDate(rule, nextDue <= today ? today : nextDue);
  if (slot > today) {
    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextDueAt: slot },
    });
    return null;
  }
  const dueSince = nextDue < today ? nextDue : null;
  return upsertSingleOpenOccurrence(taskId, rule, today, dueSince);
}

export async function materializeAllActiveRules() {
  const rules = await prisma.recurrenceRule.findMany({
    where: { active: true },
    select: { taskId: true },
  });
  for (const r of rules) {
    try {
      await materializeOccurrencesForTask(r.taskId);
    } catch (err) {
      console.error("materialize failed for", r.taskId, err);
    }
  }
  return rules.length;
}

/** Soft open occurrences from before today → expired; advance habit/rolling nextDue. */
export async function expireSoftPastOccurrences() {
  const today = startOfDay(new Date());
  const past = await prisma.taskOccurrence.findMany({
    where: {
      status: { in: OPEN_STATUSES },
      date: { lt: today },
      skippableSnapshot: true,
    },
    include: { task: { include: { recurrenceRule: true } } },
  });

  let n = 0;
  for (const occ of past) {
    await prisma.taskOccurrence.update({
      where: { id: occ.id },
      data: { status: "expired" },
    });
    n++;
    const rule = occ.task.recurrenceRule;
    if (!rule) continue;

    if (rule.mode === "habit") {
      const next = nextMatchingDate(rule, today);
      await prisma.recurrenceRule.update({
        where: { id: rule.id },
        data: { nextDueAt: next },
      });
    } else if (rule.mode === "rolling") {
      // Keep nextDueAt in the past so materializer slides one chip to today
      // (still due — one floating item)
    } else if (rule.mode === "fixed" && rule.skippable) {
      const next = nextMatchingDate(rule, today);
      await prisma.recurrenceRule.update({
        where: { id: rule.id },
        data: { nextDueAt: next },
      });
    }
  }
  return n;
}

/** Mark overdue hard occurrences as missed and schedule alarms. */
export async function markMissedHardOccurrences() {
  const now = new Date();
  const today = startOfDay(now);
  const overdue = await prisma.taskOccurrence.findMany({
    where: {
      status: "pending",
      skippableSnapshot: false,
      OR: [
        { scheduledEnd: { lt: now } },
        {
          AND: [{ scheduledEnd: null }, { date: { lt: today } }],
        },
      ],
    },
    include: { task: { include: { recurrenceRule: true } } },
  });

  for (const occ of overdue) {
    await prisma.taskOccurrence.update({
      where: { id: occ.id },
      data: { status: "missed" },
    });

    const rule = occ.task.recurrenceRule;
    if (rule) {
      const next = advanceFromNow(rule, today);
      await prisma.recurrenceRule.update({
        where: { id: rule.id },
        data: { nextDueAt: next },
      });
    }

    if (occ.alarmPolicySnapshot === "none") continue;

    const levels =
      occ.alarmPolicySnapshot === "panic"
        ? [
            { level: 1, delayMin: 0 },
            { level: 2, delayMin: 5 },
            { level: 3, delayMin: 15 },
            { level: 4, delayMin: 30 },
          ]
        : [
            { level: 1, delayMin: 0 },
            { level: 2, delayMin: 30 },
          ];

    for (const { level, delayMin } of levels) {
      const fireAt = new Date(now.getTime() + delayMin * 60_000);
      await prisma.alarmEvent.create({
        data: {
          occurrenceId: occ.id,
          level,
          fireAt,
          channel: level >= 4 ? "email" : "webpush",
        },
      });
    }
  }

  return overdue.length;
}

export type SkipAction = "skip" | "defer" | "snooze";

export async function completeOccurrenceAndAdvance(occurrenceId: string) {
  const occ = await prisma.taskOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
    include: { task: { include: { recurrenceRule: true } } },
  });

  await prisma.taskOccurrence.update({
    where: { id: occurrenceId },
    data: { status: "done", completedAt: new Date() },
  });

  const rule = occ.task.recurrenceRule;
  if (rule) {
    const next = advanceFromNow(rule, new Date());
    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextDueAt: next },
    });
    await materializeOccurrencesForTask(occ.taskId);
  }

  return prisma.taskOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
}

export async function skipOccurrenceAndAdvance(
  occurrenceId: string,
  opts: {
    action?: SkipAction;
    reason?: string | null;
    deferDays?: number;
  } = {},
) {
  const action = opts.action ?? "skip";
  const occ = await prisma.taskOccurrence.findUniqueOrThrow({
    where: { id: occurrenceId },
    include: { task: { include: { recurrenceRule: true } } },
  });

  if (!occ.skippableSnapshot) {
    throw new Error("HARD_OCCURRENCE");
  }

  const status =
    action === "snooze" ? "snoozed" : "skipped";

  await prisma.taskOccurrence.update({
    where: { id: occurrenceId },
    data: {
      status,
      skipReason: opts.reason ?? null,
    },
  });

  const rule = occ.task.recurrenceRule;
  if (rule) {
    let next: Date;
    if (action === "defer") {
      next =
        opts.deferDays != null
          ? addDays(startOfDay(new Date()), opts.deferDays)
          : advanceFromNow(rule, new Date());
    } else if (action === "snooze") {
      next = addDays(startOfDay(new Date()), 1);
      // Keep one open: re-open as pending tomorrow via nextDueAt
      await prisma.taskOccurrence.update({
        where: { id: occurrenceId },
        data: { status: "skipped", skipReason: opts.reason ?? "snoozed" },
      });
    } else {
      // skip this cycle — advance like completion for rolling; habit → tomorrow
      next =
        rule.mode === "habit"
          ? nextMatchingDate(rule, addDays(startOfDay(new Date()), 1))
          : advanceFromNow(rule, new Date());
    }

    await prisma.recurrenceRule.update({
      where: { id: rule.id },
      data: { nextDueAt: next },
    });
    await materializeOccurrencesForTask(occ.taskId);
  }

  return prisma.taskOccurrence.findUniqueOrThrow({ where: { id: occurrenceId } });
}
