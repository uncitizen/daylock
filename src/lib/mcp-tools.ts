import { startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@server/db/client";
import { createTask as createTaskDomain, getInboxForUser } from "@server/domain/tasks";
import { patchMyDay } from "@server/domain/my-day";

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
  const targetDate = args.date || new Date().toISOString().split("T")[0];

  const items = await prisma.myDayItem.findMany({
    where: {
      userId,
      date: new Date(targetDate),
    },
    orderBy: { sortOrder: "asc" },
  });

  const flexTasks = await prisma.task.findMany({
    where: {
      id: { in: items.filter((i) => i.refType === "flex").map((i) => i.refId) },
    },
  });

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          date: targetDate,
          items: items.map((item) => {
            const task = flexTasks.find((t) => t.id === item.refId);
            return {
              id: item.id,
              refType: item.refType,
              refId: item.refId,
              pinned: item.pinned,
              source: item.source,
              taskTitle: task?.title,
            };
          }),
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
