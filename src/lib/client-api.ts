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
    api<{ timeline: TimelineItem[]; suggestions: Suggestion[]; flexAvailable: FlexTask[] }>(
      `/api/v1/my-day?date=${date}`,
    ),
  patchMyDay: (body: unknown) =>
    api(`/api/v1/my-day`, { method: "PATCH", body: JSON.stringify(body) }),
  inbox: () =>
    api<{ inbox: { id: string; name: string }; tasks: Task[]; trash: Task[] }>("/api/v1/inbox"),
  createTask: (body: unknown) =>
    api<{ task: Task }>("/api/v1/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (id: string, body: { title?: string; archived?: boolean }) =>
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
      priority?: string;
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
  }[];
};

export type FlexTask = {
  id: string;
  title: string;
  attentionCost: string;
  estimatedMinutes?: number | null;
  list: { name: string };
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
