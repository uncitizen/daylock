import { startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@server/db/client";
import { createTask as createTaskDomain, getInboxForUser } from "@server/domain/tasks";
import { getMyDay as getMyDayDomain, patchMyDay } from "@server/domain/my-day";

export async function listTasks(
  userId: string,
  args: { listId?: string; includeCompleted?: boolean }
) {
  let targetListId = args.listId;
  if (!targetListId) {
    const inbox = await getInboxForUser(userId);
    targetListId = inbox.id;
  }

  const list = await prisma.list.findFirst({
    where: {
      id: targetListId,
      workspace: { memberships: { some: { userId } } },
    },
  });

  if (!list) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "List not found" }) }],
    };
  }

  const tasks = await prisma.task.findMany({
    where: {
      listId: targetListId,
      archivedAt: null,
      ...(args.includeCompleted ? {} : { completedAt: null }),
    },
    include: { recurrenceRule: true, goal: true },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          listName: list.name,
          listId: list.id,
          tasks: tasks.map((t) => ({
            id: t.id,
            title: t.title,
            notes: t.notes,
            priority: t.priority,
            completed: !!t.completedAt,
            dueAt: t.dueAt,
            goalTitle: t.goal?.title,
            estimatedMinutes: t.estimatedMinutes,
            attentionCost: t.attentionCost,
          })),
        }),
      },
    ],
  };
}

export async function createTask(
  userId: string,
  args: {
    title: string;
    notes?: string;
    listId?: string;
    priority?: string;
    dueAt?: string;
    estimatedMinutes?: number;
    attentionCost?: string;
    pinToMyDay?: boolean;
  }
) {
  let targetListId = args.listId;
  if (!targetListId) {
    const inbox = await getInboxForUser(userId);
    targetListId = inbox.id;
  }

  const list = await prisma.list.findFirst({
    where: {
      id: targetListId,
      workspace: { memberships: { some: { userId } } },
    },
  });

  if (!list) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "List not found" }) }],
    };
  }

  const task = await createTaskDomain({
    title: args.title,
    notes: args.notes,
    listId: targetListId,
    priority: args.priority as any,
    dueAt: args.dueAt || null,
    estimatedMinutes: args.estimatedMinutes,
    attentionCost: args.attentionCost as any,
  });

  if (args.pinToMyDay) {
    const today = new Date().toISOString().split("T")[0];
    await patchMyDay(userId, {
      date: today,
      pin: { refType: "flex", refId: task.id, pinned: true },
    });
  }

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          task: {
            id: task.id,
            title: task.title,
            listId: task.listId,
            createdAt: task.createdAt,
            pinnedToMyDay: args.pinToMyDay,
          },
        }),
      },
    ],
  };
}

export async function completeTask(userId: string, args: { taskId: string }) {
  const task = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      list: { workspace: { memberships: { some: { userId } } } },
    },
  });

  if (!task) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
    };
  }

  const updated = await prisma.task.update({
    where: { id: args.taskId },
    data: { completedAt: new Date() },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          task: { id: updated.id, title: updated.title, completedAt: updated.completedAt },
        }),
      },
    ],
  };
}

export async function updateTask(
  userId: string,
  args: {
    taskId: string;
    title?: string;
    notes?: string;
    priority?: string;
    dueAt?: string;
    estimatedMinutes?: number;
  }
) {
  const task = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      list: { workspace: { memberships: { some: { userId } } } },
    },
  });

  if (!task) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
    };
  }

  const updated = await prisma.task.update({
    where: { id: args.taskId },
    data: {
      ...(args.title !== undefined && { title: args.title }),
      ...(args.notes !== undefined && { notes: args.notes }),
      ...(args.priority !== undefined && { priority: args.priority as any }),
      ...(args.dueAt !== undefined && { dueAt: new Date(args.dueAt) }),
      ...(args.estimatedMinutes !== undefined && { estimatedMinutes: args.estimatedMinutes }),
    },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          success: true,
          task: {
            id: updated.id,
            title: updated.title,
            notes: updated.notes,
            priority: updated.priority,
            dueAt: updated.dueAt,
          },
        }),
      },
    ],
  };
}

export async function listStreams(userId: string, _args: any) {
  const lists = await prisma.list.findMany({
    where: {
      workspace: { memberships: { some: { userId } } },
      isInbox: false,
      archivedAt: null,
    },
    orderBy: { sortOrder: "asc" },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          streams: lists.map((l) => ({
            id: l.id,
            name: l.name,
            color: l.color,
            weight: l.weight,
          })),
        }),
      },
    ],
  };
}

export async function getMyDay(userId: string, args: { date?: string }) {
  const targetDate = args.date || (await todayForUser(userId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return errorResult("Date must be in YYYY-MM-DD format");
  }

  // Same payload the My Day page uses: calendar, habits/occurrences, pins, etc.
  const data = await getMyDayDomain(userId, new Date(targetDate + "T00:00:00"));

  const iso = (d: Date | string | null | undefined) =>
    d == null ? null : d instanceof Date ? d.toISOString() : d;

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          date: targetDate,
          timeline: data.timeline.map((item) => {
            if (item.type === "calendar") {
              return {
                type: "calendar",
                id: item.id,
                title: item.title,
                start: iso(item.start),
                end: iso(item.end),
                attentionMode: item.attentionMode,
                location: item.location ?? null,
                pinned: item.pinned,
              };
            }
            if (item.type === "occurrence") {
              return {
                type: "occurrence",
                id: item.id,
                taskId: item.taskId,
                title: item.title,
                mode: item.mode,
                status: item.status,
                hard: item.hard,
                skippable: item.skippable,
                scheduledStart: iso(item.scheduledStart),
                scheduledEnd: iso(item.scheduledEnd),
                dueSince: iso(item.dueSince),
                listName: item.listName,
                streamColor: item.streamColor,
                isInbox: item.isInbox,
                pinned: item.pinned,
                estimatedMinutes: item.estimatedMinutes,
                attentionCost: item.attentionCost,
              };
            }
            return {
              type: "flex",
              id: item.id,
              title: item.title,
              pinned: item.pinned,
              source: item.source,
              dueAt: iso(item.dueAt),
              listName: item.listName,
              streamColor: item.streamColor,
              isInbox: item.isInbox,
              priority: item.priority,
              estimatedMinutes: item.estimatedMinutes,
              attentionCost: item.attentionCost,
            };
          }),
          suggestions: data.suggestions.map((s) => ({
            eventId: s.eventId,
            eventTitle: s.eventTitle,
            attentionMode: s.attentionMode,
            remainingMinutes: s.remainingMinutes,
            tasks: s.tasks.map((t) => ({
              id: t.id,
              title: t.title,
              estimatedMinutes: t.estimatedMinutes,
              attentionCost: t.attentionCost,
              dueAt: iso(t.dueAt),
            })),
          })),
          completed: data.completed.map((c) => ({
            type: c.type,
            id: c.id,
            title: c.title,
            completedAt: c.completedAt,
            listName: c.listName,
            streamColor: c.streamColor,
            isInbox: c.isInbox,
            ...(c.type === "occurrence" ? { taskId: c.taskId, status: c.status } : {}),
          })),
          flexAvailable: data.flexAvailable.map((t) => ({
            id: t.id,
            title: t.title,
            dueAt: iso(t.dueAt),
            priority: t.priority,
            estimatedMinutes: t.estimatedMinutes,
            attentionCost: t.attentionCost,
            listName: t.list.name,
            streamColor: t.list.isInbox ? null : t.list.color,
            isInbox: t.list.isInbox,
          })),
          streams: data.streams,
        }),
      },
    ],
  };
}

function errorResult(error: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error }) }],
  };
}

// "Today" in the user's own time zone, so evening pins don't land on tomorrow.
async function todayForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return formatInTimeZone(new Date(), user?.timezone ?? "America/New_York", "yyyy-MM-dd");
}

export async function pinToMyDay(
  userId: string,
  args: { taskId: string; date?: string; pinned?: boolean }
) {
  const pinned = args.pinned ?? true;
  const date = args.date || (await todayForUser(userId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return errorResult("Date must be in YYYY-MM-DD format");
  }

  const task = await prisma.task.findFirst({
    where: {
      id: args.taskId,
      archivedAt: null,
      list: { workspace: { memberships: { some: { userId } } } },
    },
    include: { recurrenceRule: true },
  });

  if (!task) return errorResult("Task not found");
  if (pinned && task.completedAt) return errorResult("Task is already completed");

  if (task.kind === "template" && task.recurrenceRule?.mode !== "rolling") {
    // Habit/fixed tasks show on My Day through that date's occurrence.
    const occurrence = await prisma.taskOccurrence.findFirst({
      where: { taskId: task.id, date: startOfDay(new Date(date + "T00:00:00")) },
    });
    if (!occurrence) {
      return errorResult(`This recurring task has no occurrence on ${date}`);
    }
    await patchMyDay(userId, {
      date,
      pin: { refType: "occurrence", refId: occurrence.id, pinned },
    });
  } else {
    // Flex tasks pin by task id; patchMyDay routes rolling templates to an occurrence.
    try {
      await patchMyDay(userId, {
        date,
        pin: { refType: "flex", refId: task.id, pinned },
      });
    } catch (error) {
      if (error instanceof Error && error.message === "ROLLING_NOT_AVAILABLE") {
        return errorResult("This recurring task can't be picked up right now");
      }
      throw error;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          success: true,
          task: { id: task.id, title: task.title },
          date,
          pinnedToMyDay: pinned,
        }),
      },
    ],
  };
}
