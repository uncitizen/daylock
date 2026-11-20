import { startOfDay } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { prisma } from "@server/db/client";
import {
  createTask as createTaskDomain,
  getInboxForUser,
  getTaskForUser,
  listInboxTasks,
  updateTask as updateTaskDomain,
  completeFlexTask,
  completeOccurrence,
  skipOccurrence as skipOccurrenceDomain,
  trashTask as trashTaskDomain,
} from "@server/domain/tasks";
import { getMyDay as getMyDayDomain, patchMyDay } from "@server/domain/my-day";
import {
  getStreamsBoard,
  createStream,
  createPresetStreams,
  updateStream,
  archiveStream,
  createGoal,
  updateGoal,
  pickForToday,
  getStreamOptions,
  findStreamForUser,
  findGoalForUser,
} from "@server/domain/streams";
import {
  syncGoogleCalendar,
  hasCalendarConnection,
  updateEventAttentionMode,
} from "@server/integrations/google-calendar";
import {
  getShoppingList,
  addItem as addShoppingItemDomain,
  updateItem as updateShoppingItemDomain,
  deleteItem as deleteShoppingItemDomain,
  clearChecked,
  createStore,
  createPresetStores,
  updateStore,
  moveStore,
  archiveStore,
  findItem,
  findStore,
} from "@server/domain/shopping";
import {
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  addTemplateItem,
  updateTemplateItem,
  deleteTemplateItem,
  getTaskChecklist,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  applyTemplateToTask,
  updateTemplateFromTask,
} from "@server/domain/templates";

export type McpContent = { type: "text"; text: string };
export type McpResult = { content: McpContent[] };

export type McpToolDefinition = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

function ok(data: unknown): McpResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function errorResult(error: string): McpResult {
  return { content: [{ type: "text" as const, text: JSON.stringify({ error }) }] };
}

function iso(d: Date | string | null | undefined) {
  if (d == null) return null;
  return d instanceof Date ? d.toISOString() : d;
}

async function todayForUser(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  return formatInTimeZone(new Date(), user?.timezone ?? "America/New_York", "yyyy-MM-dd");
}

function serializeTask(t: {
  id: string;
  title: string;
  notes?: string | null;
  priority?: string;
  kind?: string;
  completedAt?: Date | null;
  dueAt?: Date | null;
  estimatedMinutes?: number | null;
  attentionCost?: string | null;
  listId?: string;
  goalId?: string | null;
  templateId?: string | null;
  archivedAt?: Date | null;
  list?: { id: string; name: string; color: string | null; isInbox: boolean };
  goal?: { id: string; title: string } | null;
  recurrenceRule?: {
    mode: string;
    frequency: string;
    interval: number;
    skippable: boolean;
    alarmPolicy: string;
    byWeekday: number[];
    activeMonths: number[];
    nextDueAt: Date | null;
  } | null;
}) {
  return {
    id: t.id,
    title: t.title,
    notes: t.notes ?? null,
    priority: t.priority,
    kind: t.kind,
    completed: !!t.completedAt,
    completedAt: iso(t.completedAt),
    dueAt: iso(t.dueAt),
    estimatedMinutes: t.estimatedMinutes ?? null,
    attentionCost: t.attentionCost ?? null,
    listId: t.listId ?? t.list?.id,
    listName: t.list?.name,
    goalId: t.goalId ?? t.goal?.id ?? null,
    goalTitle: t.goal?.title ?? null,
    templateId: t.templateId ?? null,
    archived: !!t.archivedAt,
    recurrence: t.recurrenceRule
      ? {
          mode: t.recurrenceRule.mode,
          frequency: t.recurrenceRule.frequency,
          interval: t.recurrenceRule.interval,
          skippable: t.recurrenceRule.skippable,
          alarmPolicy: t.recurrenceRule.alarmPolicy,
          byWeekday: t.recurrenceRule.byWeekday,
          activeMonths: t.recurrenceRule.activeMonths,
          nextDueAt: iso(t.recurrenceRule.nextDueAt),
        }
      : null,
  };
}

const recurrenceJsonSchema = {
  type: "object",
  description: "Make this a repeating habit/rolling/fixed task",
  properties: {
    mode: { type: "string", enum: ["habit", "rolling", "fixed"] },
    frequency: { type: "string", enum: ["daily", "weekly", "monthly"] },
    interval: { type: "number", description: "Every N days/weeks/months" },
    byWeekday: {
      type: "array",
      items: { type: "number" },
      description: "0=Sun … 6=Sat for weekly",
    },
    skippable: { type: "boolean" },
    alarmPolicy: { type: "string", enum: ["none", "gentle", "panic"] },
    activeMonths: { type: "array", items: { type: "number" } },
    nextDueAt: { type: "string", description: "ISO datetime for next due" },
  },
  required: ["frequency"],
};

// ─── Handlers ───────────────────────────────────────────────────────────────

export async function listTasks(
  userId: string,
  args: { listId?: string; includeCompleted?: boolean; allStreams?: boolean },
) {
  if (args.allStreams) {
    const tasks = await prisma.task.findMany({
      where: {
        archivedAt: null,
        ...(args.includeCompleted ? {} : { completedAt: null }),
        list: { workspace: { memberships: { some: { userId } } } },
      },
      include: { recurrenceRule: true, goal: true, list: true },
      orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
      take: 200,
    });
    return ok({ tasks: tasks.map(serializeTask) });
  }

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
  if (!list) return errorResult("List not found");

  const tasks = await prisma.task.findMany({
    where: {
      listId: targetListId,
      archivedAt: null,
      ...(args.includeCompleted ? {} : { completedAt: null }),
    },
    include: { recurrenceRule: true, goal: true, list: true },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });

  return ok({
    listName: list.name,
    listId: list.id,
    tasks: tasks.map(serializeTask),
  });
}

export async function getTask(userId: string, args: { taskId: string }) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  return ok({ task: serializeTask(task) });
}

export async function getInbox(userId: string) {
  try {
    const data = await listInboxTasks(userId);
    return ok({
      inbox: data.inbox,
      tasks: data.tasks.map(serializeTask),
      trash: data.trash.map(serializeTask),
    });
  } catch (e) {
    if (e instanceof Error && e.message === "INBOX_MISSING") {
      return errorResult("Inbox not found");
    }
    throw e;
  }
}

export async function createTask(
  userId: string,
  args: {
    title: string;
    notes?: string;
    listId?: string;
    goalId?: string;
    priority?: string;
    kind?: string;
    dueAt?: string;
    estimatedMinutes?: number;
    attentionCost?: string;
    pinToMyDay?: boolean;
    pinDate?: string;
    recurrence?: {
      mode?: string;
      frequency: string;
      interval?: number;
      byWeekday?: number[];
      skippable?: boolean;
      alarmPolicy?: string;
      activeMonths?: number[];
      nextDueAt?: string;
    };
  },
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
  if (!list) return errorResult("List not found");

  const task = await createTaskDomain({
    title: args.title,
    notes: args.notes,
    listId: targetListId,
    goalId: args.goalId,
    priority: args.priority as any,
    kind: args.kind as any,
    dueAt: args.dueAt || null,
    estimatedMinutes: args.estimatedMinutes,
    attentionCost: args.attentionCost as any,
    recurrence: args.recurrence as any,
  });

  const pinDate = args.pinDate || (args.pinToMyDay ? await todayForUser(userId) : null);
  if (pinDate) {
    try {
      await patchMyDay(userId, {
        date: pinDate,
        pin: { refType: "flex", refId: task.id, pinned: true },
      });
    } catch (error) {
      if (!(error instanceof Error && error.message === "ROLLING_NOT_AVAILABLE")) {
        throw error;
      }
    }
  }

  return ok({
    success: true,
    task: serializeTask(task),
    pinnedToMyDay: Boolean(pinDate),
    pinDate,
  });
}

export async function completeTask(
  userId: string,
  args: { taskId: string; occurrenceId?: string },
) {
  if (args.occurrenceId) {
    const occ = await prisma.taskOccurrence.findFirst({
      where: {
        id: args.occurrenceId,
        taskId: args.taskId,
        task: { list: { workspace: { memberships: { some: { userId } } } } },
      },
    });
    if (!occ) return errorResult("Occurrence not found");
    const occurrence = await completeOccurrence(occ.id);
    return ok({ success: true, occurrence });
  }

  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  if (task.kind === "template" && task.recurrenceRule) {
    return errorResult(
      "This is a repeating task — pass occurrenceId from get_my_day timeline (type=occurrence)",
    );
  }
  const updated = await completeFlexTask(args.taskId);
  return ok({ success: true, task: serializeTask(updated) });
}

export async function updateTask(
  userId: string,
  args: {
    taskId: string;
    title?: string;
    notes?: string | null;
    priority?: string;
    dueAt?: string | null;
    estimatedMinutes?: number | null;
    attentionCost?: string;
    listId?: string;
    goalId?: string | null;
    archived?: boolean;
    recurrence?: Record<string, unknown> | null;
  },
) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");

  if (args.listId) {
    const list = await prisma.list.findFirst({
      where: {
        id: args.listId,
        workspace: { memberships: { some: { userId } } },
      },
    });
    if (!list) return errorResult("Target list not found");
  }

  const updated = await updateTaskDomain(args.taskId, {
    title: args.title,
    notes: args.notes,
    priority: args.priority as any,
    dueAt: args.dueAt,
    estimatedMinutes: args.estimatedMinutes,
    attentionCost: args.attentionCost as any,
    listId: args.listId,
    goalId: args.goalId,
    archived: args.archived,
    recurrence: args.recurrence as any,
  });

  return ok({ success: true, task: serializeTask(updated) });
}

export async function trashTask(userId: string, args: { taskId: string }) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const updated = await trashTaskDomain(args.taskId);
  return ok({ success: true, task: serializeTask(updated) });
}

export async function skipOccurrence(
  userId: string,
  args: {
    occurrenceId: string;
    action?: "skip" | "defer" | "snooze";
    reason?: string;
    deferDays?: number;
  },
) {
  const occ = await prisma.taskOccurrence.findFirst({
    where: {
      id: args.occurrenceId,
      task: { list: { workspace: { memberships: { some: { userId } } } } },
    },
  });
  if (!occ) return errorResult("Occurrence not found");
  const result = await skipOccurrenceDomain(args.occurrenceId, {
    action: args.action,
    reason: args.reason,
    deferDays: args.deferDays,
  });
  return ok({ success: true, occurrence: result });
}

export async function listStreams(userId: string) {
  const lists = await prisma.list.findMany({
    where: {
      workspace: { memberships: { some: { userId } } },
      isInbox: false,
      archivedAt: null,
    },
    orderBy: { sortOrder: "asc" },
  });
  return ok({
    streams: lists.map((l) => ({
      id: l.id,
      name: l.name,
      color: l.color,
      weight: l.weight,
    })),
  });
}

export async function getStreamsBoardTool(userId: string, args: { date?: string }) {
  const date = args.date || (await todayForUser(userId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResult("Date must be YYYY-MM-DD");
  const board = await getStreamsBoard(userId, new Date(date + "T00:00:00"));
  return ok(board);
}

export async function createStreamTool(
  userId: string,
  args: { name?: string; color?: string; weight?: number; presets?: boolean },
) {
  if (args.presets) {
    const createdCount = await createPresetStreams(userId);
    return ok({ success: true, createdCount });
  }
  if (!args.name?.trim()) return errorResult("name is required (or presets: true)");
  const stream = await createStream(userId, {
    name: args.name.trim(),
    color: args.color,
    weight: args.weight,
  });
  return ok({ success: true, stream });
}

export async function updateStreamTool(
  userId: string,
  args: { streamId: string; name?: string; color?: string; weight?: number; archived?: boolean },
) {
  const existing = await findStreamForUser(args.streamId, userId);
  if (!existing) return errorResult("Stream not found");
  if (args.archived) {
    await archiveStream(args.streamId);
    return ok({ success: true, archived: true, streamId: args.streamId });
  }
  const stream = await updateStream(args.streamId, {
    name: args.name,
    color: args.color,
    weight: args.weight,
  });
  return ok({ success: true, stream });
}

export async function pickForTodayTool(
  userId: string,
  args: { date?: string; count?: number; swapTaskId?: string },
) {
  const date = args.date || (await todayForUser(userId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return errorResult("Date must be YYYY-MM-DD");
  const result = await pickForToday(userId, new Date(date + "T00:00:00"), {
    count: args.count,
    swapTaskId: args.swapTaskId,
  });
  return ok({ date, ...result });
}

export async function createGoalTool(
  userId: string,
  args: { listId: string; title: string },
) {
  const stream = await findStreamForUser(args.listId, userId);
  if (!stream) return errorResult("Stream not found");
  const goal = await createGoal(args.listId, args.title);
  return ok({ success: true, goal });
}

export async function updateGoalTool(
  userId: string,
  args: { goalId: string; title?: string; archived?: boolean },
) {
  const existing = await findGoalForUser(args.goalId, userId);
  if (!existing) return errorResult("Goal not found");
  const goal = await updateGoal(args.goalId, {
    title: args.title,
    archived: args.archived,
  });
  return ok({ success: true, goal });
}

export async function getStreamOptionsTool(userId: string) {
  const options = await getStreamOptions(userId);
  return ok(options);
}

export async function getMyDay(userId: string, args: { date?: string }) {
  const targetDate = args.date || (await todayForUser(userId));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return errorResult("Date must be in YYYY-MM-DD format");
  }

  const data = await getMyDayDomain(userId, new Date(targetDate + "T00:00:00"));

  return ok({
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
  });
}

export async function pinToMyDay(
  userId: string,
  args: { taskId: string; date?: string; pinned?: boolean },
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

  return ok({
    success: true,
    task: { id: task.id, title: task.title },
    date,
    pinnedToMyDay: pinned,
  });
}

export async function syncCalendar(userId: string) {
  const result = await syncGoogleCalendar(userId);
  return ok(result);
}

export async function calendarStatus(userId: string) {
  const status = await hasCalendarConnection(userId);
  return ok(status);
}

export async function updateCalendarAttention(
  userId: string,
  args: { eventId: string; attentionMode: "full" | "partial" | "idle" },
) {
  const updated = await updateEventAttentionMode(
    userId,
    args.eventId,
    args.attentionMode,
  );
  if (updated.count === 0) return errorResult("Calendar event not found");
  return ok({ success: true, eventId: args.eventId, attentionMode: args.attentionMode });
}

export async function getShopping(userId: string) {
  const list = await getShoppingList(userId);
  return ok(list);
}

export async function addShoppingItem(
  userId: string,
  args: { name: string; storeId?: string | null },
) {
  if (args.storeId) {
    const store = await findStore(args.storeId, userId);
    if (!store) return errorResult("Store not found");
  }
  const item = await addShoppingItemDomain(userId, {
    name: args.name,
    storeId: args.storeId ?? null,
  });
  return ok({ success: true, item });
}

export async function updateShoppingItem(
  userId: string,
  args: { itemId: string; name?: string; storeId?: string | null; checked?: boolean },
) {
  const existing = await findItem(args.itemId, userId);
  if (!existing) return errorResult("Item not found");
  const item = await updateShoppingItemDomain(args.itemId, {
    name: args.name,
    storeId: args.storeId,
    checked: args.checked,
  });
  return ok({ success: true, item });
}

export async function deleteShoppingItem(userId: string, args: { itemId: string }) {
  const existing = await findItem(args.itemId, userId);
  if (!existing) return errorResult("Item not found");
  await deleteShoppingItemDomain(args.itemId);
  return ok({ success: true, itemId: args.itemId });
}

export async function clearShopping(userId: string, args: { storeId?: string | null }) {
  await clearChecked(userId, args.storeId);
  return ok({ success: true });
}

export async function createShoppingStore(
  userId: string,
  args: { name?: string; presets?: boolean },
) {
  if (args.presets) {
    const createdCount = await createPresetStores(userId);
    return ok({ success: true, createdCount });
  }
  if (!args.name?.trim()) return errorResult("name is required (or presets: true)");
  const store = await createStore(userId, args.name.trim());
  return ok({ success: true, store });
}

export async function updateShoppingStore(
  userId: string,
  args: { storeId: string; name?: string; move?: "up" | "down"; archived?: boolean },
) {
  const existing = await findStore(args.storeId, userId);
  if (!existing) return errorResult("Store not found");
  if (args.archived) {
    await archiveStore(args.storeId);
    return ok({ success: true, archived: true, storeId: args.storeId });
  }
  if (args.move) {
    await moveStore(userId, args.storeId, args.move);
  }
  if (args.name) {
    await updateStore(args.storeId, { name: args.name });
  }
  return ok({ success: true, storeId: args.storeId });
}

export async function listTemplates(userId: string) {
  const templates = await getTemplates(userId);
  return ok({ templates });
}

export async function createTemplateTool(
  userId: string,
  args: { name: string; items?: string[] },
) {
  const template = await createTemplate(userId, {
    name: args.name,
    items: args.items,
  });
  return ok({ success: true, template });
}

export async function updateTemplateTool(
  userId: string,
  args: { templateId: string; name?: string; sortOrder?: number },
) {
  const templates = await getTemplates(userId);
  if (!templates.some((t) => t.id === args.templateId)) {
    return errorResult("Template not found");
  }
  const template = await updateTemplate(args.templateId, {
    name: args.name,
    sortOrder: args.sortOrder,
  });
  return ok({ success: true, template });
}

export async function deleteTemplateTool(userId: string, args: { templateId: string }) {
  const templates = await getTemplates(userId);
  if (!templates.some((t) => t.id === args.templateId)) {
    return errorResult("Template not found");
  }
  await deleteTemplate(args.templateId);
  return ok({ success: true, templateId: args.templateId });
}

export async function addTemplateItemTool(
  userId: string,
  args: { templateId: string; title: string },
) {
  const templates = await getTemplates(userId);
  if (!templates.some((t) => t.id === args.templateId)) {
    return errorResult("Template not found");
  }
  const item = await addTemplateItem(args.templateId, args.title);
  return ok({ success: true, item });
}

export async function updateTemplateItemTool(
  userId: string,
  args: { templateId: string; itemId: string; title?: string; sortOrder?: number },
) {
  const templates = await getTemplates(userId);
  const template = templates.find((t) => t.id === args.templateId);
  if (!template || !template.items.some((i) => i.id === args.itemId)) {
    return errorResult("Template item not found");
  }
  const item = await updateTemplateItem(args.itemId, {
    title: args.title,
    sortOrder: args.sortOrder,
  });
  return ok({ success: true, item });
}

export async function deleteTemplateItemTool(
  userId: string,
  args: { templateId: string; itemId: string },
) {
  const templates = await getTemplates(userId);
  const template = templates.find((t) => t.id === args.templateId);
  if (!template || !template.items.some((i) => i.id === args.itemId)) {
    return errorResult("Template item not found");
  }
  await deleteTemplateItem(args.itemId);
  return ok({ success: true, itemId: args.itemId });
}

export async function getChecklist(userId: string, args: { taskId: string }) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const items = await getTaskChecklist(args.taskId);
  return ok({ taskId: args.taskId, items });
}

export async function addChecklistItemTool(
  userId: string,
  args: { taskId: string; title: string },
) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const item = await addChecklistItem(args.taskId, args.title);
  return ok({ success: true, item });
}

export async function updateChecklistItemTool(
  userId: string,
  args: {
    taskId: string;
    itemId: string;
    title?: string;
    checked?: boolean;
    sortOrder?: number;
  },
) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const items = await getTaskChecklist(args.taskId);
  if (!items.some((i) => i.id === args.itemId)) return errorResult("Checklist item not found");
  const item = await updateChecklistItem(args.itemId, {
    title: args.title,
    checked: args.checked,
    sortOrder: args.sortOrder,
  });
  return ok({ success: true, item });
}

export async function deleteChecklistItemTool(
  userId: string,
  args: { taskId: string; itemId: string },
) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const items = await getTaskChecklist(args.taskId);
  if (!items.some((i) => i.id === args.itemId)) return errorResult("Checklist item not found");
  await deleteChecklistItem(args.itemId);
  return ok({ success: true, itemId: args.itemId });
}

export async function applyTemplateTool(
  userId: string,
  args: { taskId: string; templateId: string },
) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  const templates = await getTemplates(userId);
  if (!templates.some((t) => t.id === args.templateId)) {
    return errorResult("Template not found");
  }
  const items = await applyTemplateToTask(args.taskId, args.templateId);
  return ok({ success: true, items });
}

export async function updateTemplateFromTaskTool(userId: string, args: { taskId: string }) {
  const task = await getTaskForUser(args.taskId, userId);
  if (!task) return errorResult("Task not found");
  try {
    const template = await updateTemplateFromTask(args.taskId);
    return ok({ success: true, template });
  } catch (e) {
    if (e instanceof Error && e.message === "TASK_HAS_NO_TEMPLATE") {
      return errorResult("Task has no linked template");
    }
    throw e;
  }
}

// ─── Catalog + dispatcher ───────────────────────────────────────────────────

type Handler = (userId: string, args: any) => Promise<McpResult>;

const handlers: Record<string, Handler> = {
  list_tasks: listTasks,
  get_task: getTask,
  get_inbox: getInbox,
  create_task: createTask,
  complete_task: completeTask,
  update_task: updateTask,
  trash_task: trashTask,
  skip_occurrence: skipOccurrence,
  list_streams: listStreams,
  get_streams_board: getStreamsBoardTool,
  create_stream: createStreamTool,
  update_stream: updateStreamTool,
  pick_for_today: pickForTodayTool,
  create_goal: createGoalTool,
  update_goal: updateGoalTool,
  get_stream_options: getStreamOptionsTool,
  get_my_day: getMyDay,
  pin_to_my_day: pinToMyDay,
  sync_calendar: syncCalendar,
  calendar_status: calendarStatus,
  update_calendar_attention: updateCalendarAttention,
  get_shopping: getShopping,
  add_shopping_item: addShoppingItem,
  update_shopping_item: updateShoppingItem,
  delete_shopping_item: deleteShoppingItem,
  clear_shopping: clearShopping,
  create_shopping_store: createShoppingStore,
  update_shopping_store: updateShoppingStore,
  list_templates: listTemplates,
  create_template: createTemplateTool,
  update_template: updateTemplateTool,
  delete_template: deleteTemplateTool,
  add_template_item: addTemplateItemTool,
  update_template_item: updateTemplateItemTool,
  delete_template_item: deleteTemplateItemTool,
  get_checklist: getChecklist,
  add_checklist_item: addChecklistItemTool,
  update_checklist_item: updateChecklistItemTool,
  delete_checklist_item: deleteChecklistItemTool,
  apply_template: applyTemplateTool,
  update_template_from_task: updateTemplateFromTaskTool,
};

export const MCP_TOOL_DEFINITIONS: McpToolDefinition[] = [
  {
    name: "list_tasks",
    title: "List tasks",
    description: "List tasks from a stream/inbox, or across all streams",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "Stream/list ID (defaults to inbox)" },
        includeCompleted: { type: "boolean", default: false },
        allStreams: { type: "boolean", description: "Search every stream + inbox" },
      },
    },
  },
  {
    name: "get_task",
    title: "Get task",
    description: "Get one task by ID including recurrence details",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "get_inbox",
    title: "Get inbox",
    description: "Inbox tasks plus trash",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_task",
    title: "Create task",
    description:
      "Create a flex task or repeating habit/rolling/fixed task. Optionally pin to My Day.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        notes: { type: "string" },
        listId: { type: "string" },
        goalId: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        kind: { type: "string", enum: ["flex", "template"] },
        dueAt: { type: "string", description: "ISO datetime" },
        estimatedMinutes: { type: "number" },
        attentionCost: { type: "string", enum: ["deep", "light", "any"] },
        pinToMyDay: { type: "boolean" },
        pinDate: { type: "string", description: "YYYY-MM-DD" },
        recurrence: recurrenceJsonSchema,
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    title: "Complete task",
    description:
      "Complete a flex task, or a repeating occurrence (pass occurrenceId from get_my_day)",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        occurrenceId: { type: "string" },
      },
      required: ["taskId"],
    },
  },
  {
    name: "update_task",
    title: "Update task",
    description: "Update task fields, move streams, set/clear recurrence, or archive",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
        notes: { type: "string" },
        priority: { type: "string", enum: ["none", "low", "medium", "high"] },
        dueAt: { type: "string" },
        estimatedMinutes: { type: "number" },
        attentionCost: { type: "string", enum: ["deep", "light", "any"] },
        listId: { type: "string" },
        goalId: { type: "string" },
        archived: { type: "boolean" },
        recurrence: { ...recurrenceJsonSchema, nullable: true },
      },
      required: ["taskId"],
    },
  },
  {
    name: "trash_task",
    title: "Trash task",
    description: "Soft-delete (archive) a task and remove My Day pins",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "skip_occurrence",
    title: "Skip occurrence",
    description: "Skip, defer, or snooze a habit/rolling/fixed occurrence from My Day",
    inputSchema: {
      type: "object",
      properties: {
        occurrenceId: { type: "string" },
        action: { type: "string", enum: ["skip", "defer", "snooze"], default: "skip" },
        reason: { type: "string" },
        deferDays: { type: "number" },
      },
      required: ["occurrenceId"],
    },
  },
  {
    name: "list_streams",
    title: "List streams",
    description: "List life streams (non-inbox lists)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_streams_board",
    title: "Streams board",
    description: "Full Streams board with pressure, goals, and tasks per stream",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "create_stream",
    title: "Create stream",
    description: "Create a stream, or install preset streams with presets:true",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        color: { type: "string" },
        weight: { type: "number" },
        presets: { type: "boolean" },
      },
    },
  },
  {
    name: "update_stream",
    title: "Update stream",
    description: "Rename/recolor/reweight a stream, or archive it",
    inputSchema: {
      type: "object",
      properties: {
        streamId: { type: "string" },
        name: { type: "string" },
        color: { type: "string" },
        weight: { type: "number" },
        archived: { type: "boolean" },
      },
      required: ["streamId"],
    },
  },
  {
    name: "pick_for_today",
    title: "Pick for today",
    description: "Suggest/pin stream tasks onto My Day (or swap one suggestion)",
    inputSchema: {
      type: "object",
      properties: {
        date: { type: "string" },
        count: { type: "number" },
        swapTaskId: { type: "string" },
      },
    },
  },
  {
    name: "create_goal",
    title: "Create goal",
    description: "Create a goal under a stream",
    inputSchema: {
      type: "object",
      properties: {
        listId: { type: "string", description: "Stream ID" },
        title: { type: "string" },
      },
      required: ["listId", "title"],
    },
  },
  {
    name: "update_goal",
    title: "Update goal",
    description: "Rename or archive a goal",
    inputSchema: {
      type: "object",
      properties: {
        goalId: { type: "string" },
        title: { type: "string" },
        archived: { type: "boolean" },
      },
      required: ["goalId"],
    },
  },
  {
    name: "get_stream_options",
    title: "Stream options",
    description: "Inbox id + streams with goals (for pickers)",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_my_day",
    title: "Get My Day",
    description:
      "Full My Day: calendar events, habits/occurrences, pinned flex, suggestions, completed, flex available",
    inputSchema: {
      type: "object",
      properties: { date: { type: "string", description: "YYYY-MM-DD" } },
    },
  },
  {
    name: "pin_to_my_day",
    title: "Pin to My Day",
    description: "Pin or unpin a task on My Day",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        date: { type: "string" },
        pinned: { type: "boolean", default: true },
      },
      required: ["taskId"],
    },
  },
  {
    name: "sync_calendar",
    title: "Sync Google Calendar",
    description: "Pull events from all Google calendars into My Day",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "calendar_status",
    title: "Calendar status",
    description: "Whether Google Calendar is connected and writable",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_calendar_attention",
    title: "Update calendar attention",
    description: "Set full/partial/idle attention mode on a calendar event",
    inputSchema: {
      type: "object",
      properties: {
        eventId: { type: "string" },
        attentionMode: { type: "string", enum: ["full", "partial", "idle"] },
      },
      required: ["eventId", "attentionMode"],
    },
  },
  {
    name: "get_shopping",
    title: "Get shopping list",
    description: "Shopping stores, items, and buy-again suggestions",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "add_shopping_item",
    title: "Add shopping item",
    description: "Add an item to the shopping list",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        storeId: { type: "string", nullable: true },
      },
      required: ["name"],
    },
  },
  {
    name: "update_shopping_item",
    title: "Update shopping item",
    description: "Rename, move store, or check/uncheck a shopping item",
    inputSchema: {
      type: "object",
      properties: {
        itemId: { type: "string" },
        name: { type: "string" },
        storeId: { type: "string", nullable: true },
        checked: { type: "boolean" },
      },
      required: ["itemId"],
    },
  },
  {
    name: "delete_shopping_item",
    title: "Delete shopping item",
    description: "Remove a shopping item",
    inputSchema: {
      type: "object",
      properties: { itemId: { type: "string" } },
      required: ["itemId"],
    },
  },
  {
    name: "clear_shopping",
    title: "Clear checked shopping",
    description: "Clear checked items (optionally for one store)",
    inputSchema: {
      type: "object",
      properties: { storeId: { type: "string", nullable: true } },
    },
  },
  {
    name: "create_shopping_store",
    title: "Create shopping store",
    description: "Create a store or install presets",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        presets: { type: "boolean" },
      },
    },
  },
  {
    name: "update_shopping_store",
    title: "Update shopping store",
    description: "Rename, reorder, or archive a store",
    inputSchema: {
      type: "object",
      properties: {
        storeId: { type: "string" },
        name: { type: "string" },
        move: { type: "string", enum: ["up", "down"] },
        archived: { type: "boolean" },
      },
      required: ["storeId"],
    },
  },
  {
    name: "list_templates",
    title: "List templates",
    description: "Checklist templates",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "create_template",
    title: "Create template",
    description: "Create a checklist template with optional starter items",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        items: { type: "array", items: { type: "string" } },
      },
      required: ["name"],
    },
  },
  {
    name: "update_template",
    title: "Update template",
    description: "Rename or reorder a template",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        name: { type: "string" },
        sortOrder: { type: "number" },
      },
      required: ["templateId"],
    },
  },
  {
    name: "delete_template",
    title: "Delete template",
    description: "Delete a checklist template",
    inputSchema: {
      type: "object",
      properties: { templateId: { type: "string" } },
      required: ["templateId"],
    },
  },
  {
    name: "add_template_item",
    title: "Add template item",
    description: "Add an item to a checklist template",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        title: { type: "string" },
      },
      required: ["templateId", "title"],
    },
  },
  {
    name: "update_template_item",
    title: "Update template item",
    description: "Rename/reorder a template item",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        itemId: { type: "string" },
        title: { type: "string" },
        sortOrder: { type: "number" },
      },
      required: ["templateId", "itemId"],
    },
  },
  {
    name: "delete_template_item",
    title: "Delete template item",
    description: "Remove an item from a template",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        itemId: { type: "string" },
      },
      required: ["templateId", "itemId"],
    },
  },
  {
    name: "get_checklist",
    title: "Get task checklist",
    description: "Checklist items on a task",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
  {
    name: "add_checklist_item",
    title: "Add checklist item",
    description: "Add a checklist row to a task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        title: { type: "string" },
      },
      required: ["taskId", "title"],
    },
  },
  {
    name: "update_checklist_item",
    title: "Update checklist item",
    description: "Check/uncheck or rename a checklist item",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        itemId: { type: "string" },
        title: { type: "string" },
        checked: { type: "boolean" },
        sortOrder: { type: "number" },
      },
      required: ["taskId", "itemId"],
    },
  },
  {
    name: "delete_checklist_item",
    title: "Delete checklist item",
    description: "Remove a checklist item from a task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        itemId: { type: "string" },
      },
      required: ["taskId", "itemId"],
    },
  },
  {
    name: "apply_template",
    title: "Apply template",
    description: "Copy a checklist template onto a task",
    inputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string" },
        templateId: { type: "string" },
      },
      required: ["taskId", "templateId"],
    },
  },
  {
    name: "update_template_from_task",
    title: "Update template from task",
    description: "Push the task checklist back into its linked template",
    inputSchema: {
      type: "object",
      properties: { taskId: { type: "string" } },
      required: ["taskId"],
    },
  },
];

export async function callMcpTool(
  userId: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<McpResult> {
  const handler = handlers[name];
  if (!handler) {
    return errorResult(`Unknown tool: ${name}`);
  }
  return handler(userId, args ?? {});
}

export function listMcpToolNames() {
  return Object.keys(handlers);
}
