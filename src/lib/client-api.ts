async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error ?? res.statusText);
  }
  return data as T;
}

export const clientApi = {
  myDay: (date: string) =>
    api<{
      timeline: TimelineItem[];
      suggestions: Suggestion[];
      flexAvailable: FlexTask[];
      streams: { id: string; name: string; color: string | null }[];
      completed: CompletedItem[];
    }>(`/api/v1/my-day?date=${date}`),
  patchMyDay: (body: unknown) =>
    api(`/api/v1/my-day`, { method: "PATCH", body: JSON.stringify(body) }),
  inbox: () =>
    api<{ inbox: { id: string; name: string }; tasks: Task[]; trash: Task[] }>("/api/v1/inbox"),
  createTask: (body: unknown) =>
    api<{ task: Task }>("/api/v1/tasks", { method: "POST", body: JSON.stringify(body) }),
  getTask: (id: string) => api<{ task: Task & { listId: string; goalId: string | null } }>(`/api/v1/tasks/${id}`),
  updateTask: (
    id: string,
    body: {
      title?: string;
      archived?: boolean;
      listId?: string;
      goalId?: string | null;
      sortOrder?: number;
      estimatedMinutes?: number | null;
      dueAt?: string | null;
      recurrence?: RecurrenceInput | null;
    },
  ) =>
    api<{ task: Task }>(`/api/v1/tasks/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  trashTask: (id: string) =>
    api<{ task: Task }>(`/api/v1/tasks/${id}`, { method: "DELETE" }),
  analyzeTask: (title: string, notes?: string) =>
    api<{ analysis: TaskAnalysis }>("/api/v1/tasks/analyze", {
      method: "POST",
      body: JSON.stringify({
        title,
        notes,
        today: new Date().toISOString().slice(0, 10),
      }),
    }),
  scheduleTask: (
    id: string,
    body: {
      start: string;
      end?: string;
      allDay?: boolean;
      date?: string;
      syncToCalendar?: boolean;
    },
  ) =>
    api<{
      task: Task;
      calendarEvent: { id: string; title: string } | null;
      calendarError: string | null;
      scheduled: { start: string; end: string; allDay?: boolean };
    }>(`/api/v1/tasks/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  calendarStatus: () =>
    api<{ connected: boolean; canWrite: boolean }>("/api/v1/calendar/status"),
  completeTask: (id: string, occurrenceId?: string) =>
    api(`/api/v1/tasks/${id}/complete`, {
      method: "POST",
      body: JSON.stringify(occurrenceId ? { occurrenceId } : {}),
    }),
  skipOccurrence: (
    id: string,
    body?: { action?: "skip" | "defer" | "snooze"; reason?: string; deferDays?: number },
  ) =>
    api(`/api/v1/occurrences/${id}/skip`, {
      method: "POST",
      body: JSON.stringify(body ?? { action: "skip" }),
    }),
  updateAttention: (id: string, attentionMode: string) =>
    api(`/api/v1/calendar/events/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ attentionMode }),
    }),
  streams: (date: string) => api<StreamsBoard>(`/api/v1/streams?date=${date}`),
  createStream: (body: { name: string; color?: string; weight?: number } | { presets: true }) =>
    api("/api/v1/streams", { method: "POST", body: JSON.stringify(body) }),
  updateStream: (
    id: string,
    body: { name?: string; color?: string; weight?: number; archived?: true },
  ) => api(`/api/v1/streams/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  streamOptions: () => api<StreamOptions>("/api/v1/streams?options=1"),
  pickForToday: (body: { date: string; count?: number; swapTaskId?: string }) =>
    api<{ picks: StreamPick[] }>("/api/v1/streams/pick", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  createGoal: (listId: string, title: string) =>
    api("/api/v1/goals", { method: "POST", body: JSON.stringify({ listId, title }) }),
  updateGoal: (id: string, body: { title?: string; archived?: true }) =>
    api(`/api/v1/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  syncCalendar: () =>
    api<{ synced: number; error?: string | null }>("/api/v1/sync/google-calendar", {
      method: "POST",
    }),
};

export type TaskAnalysis = {
  estimatedMinutes: number;
  attentionCost: "deep" | "light" | "any";
  suggestedDate?: string | null;
  suggestedWindowStart?: string | null;
  suggestedWindowEnd?: string | null;
  rationale: string;
  confidence: "low" | "medium" | "high";
  source: "llm" | "heuristic";
};

export type TimelineItem =
  | {
      type: "calendar";
      id: string;
      title: string;
      start: string;
      end: string;
      attentionMode: "full" | "partial" | "idle";
      moveable: false;
      pinned: boolean;
      location?: string | null;
    }
  | {
      type: "occurrence";
      id: string;
      taskId: string;
      title: string;
      status: string;
      skippable: boolean;
      alarmPolicy: string;
      scheduledStart?: string | null;
      scheduledEnd?: string | null;
      moveable: false;
      hard: boolean;
      pinned: boolean;
      attentionCost: string;
      estimatedMinutes?: number | null;
      listName: string;
      listId: string;
      streamColor: string | null;
      isInbox: boolean;
      mode: "habit" | "rolling" | "fixed";
      dueSince?: string | null;
      frequency?: string;
      interval?: number;
    }
  | {
      type: "flex";
      id: string;
      title: string;
      pinned: boolean;
      sortOrder: number;
      moveable: true;
      attentionCost: string;
      estimatedMinutes?: number | null;
      listName?: string;
      listId: string;
      streamColor: string | null;
      isInbox: boolean;
      source: "manual" | "suggested";
      priority?: string;
      dueAt?: string | null;
    };

export type CompletedItem =
  | {
      type: "occurrence";
      id: string;
      taskId: string;
      title: string;
      status: string;
      completedAt: string;
      listName: string;
      listId: string;
      streamColor: string | null;
      isInbox: boolean;
    }
  | {
      type: "flex";
      id: string;
      title: string;
      completedAt: string;
      listName: string;
      listId: string;
      streamColor: string | null;
      isInbox: boolean;
    };

export type Suggestion = {
  eventId: string;
  eventTitle: string;
  attentionMode: string;
  remainingMinutes: number;
  tasks: {
    id: string;
    title: string;
    estimatedMinutes?: number | null;
    attentionCost: string;
    dueAt?: string | null;
  }[];
};

export type FlexTask = {
  id: string;
  title: string;
  attentionCost: string;
  estimatedMinutes?: number | null;
  dueAt?: string | null;
  list: { id: string; name: string; color: string | null; isInbox: boolean };
};

export type Task = {
  id: string;
  title: string;
  notes?: string | null;
  kind: string;
  priority: string;
  attentionCost: string;
  estimatedMinutes?: number | null;
  completedAt?: string | null;
  archivedAt?: string | null;
  dueAt?: string | null;
  recurrenceRule?: {
    mode: "habit" | "rolling" | "fixed";
    frequency: string;
    interval: number;
    skippable: boolean;
    alarmPolicy: string;
    windowStart?: string | null;
    windowEnd?: string | null;
    byWeekday: number[];
    activeMonths: number[];
    nextDueAt?: string | null;
  } | null;
};

export type StreamTask = {
  id: string;
  title: string;
  goalId: string | null;
  sortOrder: number;
  kind: string;
  estimatedMinutes?: number | null;
  dueAt?: string | null;
  repeatMode: "habit" | "rolling" | "fixed" | null;
  pinnedToday: boolean;
  createdAt: string;
};

export type StreamCard = {
  id: string;
  name: string;
  color: string;
  weight: number;
  sortOrder: number;
  targetPct: number;
  actualPct: number;
  actualMinutes: number;
  daysQuiet: number;
  lastActivityAt: string | null;
  pressure: number;
  status: "needs_you" | "drifting" | "on_track";
  goals: { id: string; title: string; sortOrder: number }[];
  tasks: StreamTask[];
};

export type StreamsBoard = {
  date: string;
  windowDays: number;
  totalMinutes: number;
  inbox: { id: string; name: string; tasks: StreamTask[] };
  streams: StreamCard[];
  colors: string[];
};

export type StreamPick = {
  taskId: string;
  title: string;
  streamId: string;
  streamName: string;
  reason: string;
};

export type RecurrenceInput = {
  mode: "habit" | "rolling" | "fixed";
  frequency: "daily" | "weekly" | "monthly";
  interval: number;
  byWeekday: number[];
  skippable: boolean;
  alarmPolicy: "none" | "gentle" | "panic";
  windowStart?: string | null;
  windowEnd?: string | null;
  activeMonths: number[];
  /** ISO datetime; rolling tasks stay off My Day until this day. */
  nextDueAt?: string | null;
};

export type StreamOptions = {
  inboxId: string;
  streams: { id: string; name: string; color: string; goals: { id: string; title: string }[] }[];
};

export type ShoppingList = {
  stores: { id: string; name: string; sortOrder: number }[];
  items: { id: string; name: string; storeId: string | null; checked: boolean }[];
  /** Keyed by store id; "" is "Any store". */
  buyAgain: Record<string, string[]>;
};

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
});

export const shoppingApi = {
  list: () => api<ShoppingList>("/api/v1/shopping"),
  addItem: (name: string, storeId: string | null) =>
    api("/api/v1/shopping/items", json("POST", { name, storeId })),
  updateItem: (id: string, body: { name?: string; storeId?: string | null; checked?: boolean }) =>
    api(`/api/v1/shopping/items/${id}`, json("PATCH", body)),
  deleteItem: (id: string) => api(`/api/v1/shopping/items/${id}`, json("DELETE")),
  clear: (storeId?: string | null) =>
    api<{ cleared: number }>("/api/v1/shopping/clear", json("POST", storeId === undefined ? {} : { storeId })),
  addStore: (body: { name: string } | { presets: true }) =>
    api("/api/v1/shopping/stores", json("POST", body)),
  updateStore: (id: string, body: { name?: string; move?: "up" | "down"; archived?: true }) =>
    api(`/api/v1/shopping/stores/${id}`, json("PATCH", body)),
};
