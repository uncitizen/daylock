"use client";

import { useEffect, useMemo, useState } from "react";
import {
  differenceInCalendarDays,
  format,
  isBefore,
  isToday,
  isTomorrow,
  startOfDay,
} from "date-fns";
import { TaskTitle } from "@/components/TaskTitle";
import { TrashButton } from "@/components/TrashButton";
import { StreamDots, StreamTag, type StreamOption } from "@/components/StreamDots";
import { TaskEditor } from "@/components/TaskEditor";
import { TaskChecklist } from "@/components/TaskChecklist";
import { TaskDetailModal } from "@/components/TaskDetailModal";
import {
  clientApi,
  type CompletedItem,
  type FlexTask,
  type StreamTask,
  type StreamsBoard,
  type Suggestion,
  type TimelineItem,
} from "@/lib/client-api";

type PinnableCatalogTask = StreamTask & {
  streamName: string;
  streamColor: string | null;
  isInbox: boolean;
};

function timeLabel(iso?: string | null) {
  if (!iso) return null;
  return format(new Date(iso), "h:mm a");
}

// All-day tasks are stored at local midnight (see Inbox), so a midnight dueAt
// is shown as a date with no time.
function isAllDay(d: Date) {
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function isScheduledToday(dueAt?: string | null) {
  return Boolean(dueAt && isToday(new Date(dueAt)));
}

function ScheduledDate({ dueAt }: { dueAt?: string | null }) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  const time = isAllDay(d) ? "" : ` ${format(d, "h:mm a")}`;
  let label: string;
  let tone = "text-muted";
  if (isToday(d)) {
    label = `Today${time}`;
    tone = "text-accent";
  } else if (isTomorrow(d)) {
    label = `Tomorrow${time}`;
  } else {
    label = `${format(d, "MMM d")}${time}`;
    if (isBefore(d, startOfDay(new Date()))) {
      label = `Overdue · ${label}`;
      tone = "text-danger";
    }
  }
  return (
    <span className={`text-xs font-medium ${tone}`} title={format(d, "PPPp")}>
      Scheduled {label}
    </span>
  );
}

const HABIT_REASONS = [
  { id: "tired", label: "Didn’t sleep enough" },
  { id: "no_time", label: "No time" },
  { id: "weather", label: "Weather" },
  { id: "other", label: "Just skip today" },
];

export default function MyDayPage() {
  const date = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [flexAvailable, setFlexAvailable] = useState<FlexTask[]>([]);
  const [completed, setCompleted] = useState<CompletedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [skipFor, setSkipFor] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [streams, setStreams] = useState<StreamOption[]>([]);
  const [streamPickFor, setStreamPickFor] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [modalTaskId, setModalTaskId] = useState<string | null>(null);
  const [modalMode, setModalMode] = useState<"view" | "edit">("view");
  const [composerMore, setComposerMore] = useState(false);
  const [streamBoard, setStreamBoard] = useState<StreamsBoard | null>(null);
  const [taskSearch, setTaskSearch] = useState("");

  async function reload(quiet = false) {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const data = await clientApi.myDay(date);
      setTimeline(data.timeline);
      setSuggestions(data.suggestions);
      setFlexAvailable(data.flexAvailable);
      setCompleted(data.completed);
      setStreams(
        data.streams.map((st) => ({ id: st.id, name: st.name, color: st.color ?? "#5c635c" })),
      );
      try {
        setStreamBoard(await clientApi.streams(date));
      } catch {
        // Search catalog is best-effort; My Day still works without it.
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [date]);

  async function completeOccurrence(taskId: string, occurrenceId: string) {
    setTimeline((prev) =>
      prev.filter((item) => !(item.type === "occurrence" && item.id === occurrenceId)),
    );
    setError(null);
    try {
      await clientApi.completeTask(taskId, occurrenceId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete");
      await reload(true);
    }
  }

  async function completeFlex(taskId: string) {
    setTimeline((prev) =>
      prev.filter((item) => !(item.type === "flex" && item.id === taskId)),
    );
    setFlexAvailable((prev) => prev.filter((t) => t.id !== taskId));
    setError(null);
    try {
      await clientApi.completeTask(taskId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not complete");
      await reload(true);
    }
  }

  async function doSkip(
    occurrenceId: string,
    action: "skip" | "defer" | "snooze",
    reason?: string,
    deferDays?: number,
  ) {
    try {
      await clientApi.skipOccurrence(occurrenceId, { action, reason, deferDays });
      setSkipFor(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cannot skip");
    }
  }

  async function pinFlex(taskId: string, pinned: boolean) {
    setError(null);
    try {
      await clientApi.patchMyDay({
        date,
        pin: { refType: "flex", refId: taskId, pinned },
      });
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pin");
      await reload(true);
    }
  }

  async function moveToStream(taskId: string, listId: string) {
    setStreamPickFor(null);
    setError(null);
    try {
      await clientApi.updateTask(taskId, { listId });
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not move");
    }
  }

  async function swapSuggestion(taskId: string) {
    setError(null);
    setSyncMsg(null);
    try {
      const { picks } = await clientApi.pickForToday({ date, swapTaskId: taskId });
      if (picks.length === 0) setSyncMsg("Nothing else in that stream to swap in.");
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not swap");
    }
  }

  /** Stream label on a card; tapping it opens the dots to file the task elsewhere. */
  function streamLabel(item: {
    taskId: string;
    listId: string;
    listName?: string;
    isInbox: boolean;
    streamColor: string | null;
  }) {
    if (streams.length === 0) return null;
    return (
      <button
        type="button"
        onClick={() => setStreamPickFor(streamPickFor === item.taskId ? null : item.taskId)}
        className="mr-1 rounded hover:bg-line/40"
        title={item.isInbox ? "File under a stream" : "Move to another stream"}
      >
        {item.isInbox ? (
          <span className="inline-flex items-center gap-1 text-muted">
            <span className="h-2 w-2 rounded-full border border-muted" aria-hidden />
            Unsorted
          </span>
        ) : (
          <StreamTag name={item.listName ?? "Stream"} color={item.streamColor ?? "#5c635c"} />
        )}
      </button>
    );
  }

  function editButton(taskId: string) {
    return (
      <button
        type="button"
        onClick={() => {
          setModalTaskId(taskId);
          setModalMode("edit");
        }}
        aria-label="Edit task"
        title="Edit: stream, goal, date, repeat"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted hover:bg-line/40 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 20h4L19 9l-4-4L4 16v4z" />
          <path d="M13.5 6.5l4 4" />
        </svg>
      </button>
    );
  }

  function viewButton(taskId: string) {
    return (
      <button
        type="button"
        onClick={() => {
          setModalTaskId(taskId);
          setModalMode("view");
        }}
        aria-label="View task details"
        title="View details"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted hover:bg-line/40 hover:text-ink"
      >
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
    );
  }

  function checklistButton(taskId: string, templateId?: string | null) {
    if (!templateId) return null;
    const active = checklistId === taskId;
    return (
      <button
        type="button"
        onClick={() => setChecklistId(active ? null : taskId)}
        aria-label={active ? "Hide checklist" : "Show checklist"}
        aria-expanded={active}
        title="Checklist"
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-muted hover:bg-line/40 hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          className="h-[18px] w-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      </button>
    );
  }


  function checklist(taskId: string, templateId?: string | null) {
    if (checklistId !== taskId || !templateId) return null;
    return (
      <div className="mt-3 border-t border-line/60 pt-3">
        <TaskChecklist taskId={taskId} templateId={templateId} onError={setError} />
      </div>
    );
  }

  function streamPicker(taskId: string, listId: string) {
    if (streamPickFor !== taskId) return null;
    return (
      <StreamDots
        className="mt-2"
        streams={streams}
        currentId={listId}
        onPick={(id) => (id === listId ? setStreamPickFor(null) : moveToStream(taskId, id))}
      />
    );
  }

  async function addToMyDay(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title || adding) return;
    setAdding(true);
    setError(null);
    try {
      await clientApi.createTask({
        title,
        kind: "flex",
        pinToMyDay: true,
        pinDate: date,
      });
      setNewTitle("");
      await reload(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

  async function trashTask(taskId: string) {
    setError(null);
    try {
      await clientApi.trashTask(taskId);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not trash");
    }
  }

  async function syncCalendar() {
    setSyncMsg(null);
    try {
      const result = await clientApi.syncCalendar();
      if (result.error === "NO_TOKEN") {
        setError("Sign in with Google to sync calendar.");
        return;
      }
      setSyncMsg(`Synced ${result.synced} events`);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sync failed");
    }
  }

  const unpinnedFlex = flexAvailable.filter(
    (t) => !timeline.some((x) => x.type === "flex" && x.id === t.id),
  );
  const plannedToday = unpinnedFlex
    .filter((t) => isScheduledToday(t.dueAt))
    .sort((a, b) => new Date(a.dueAt!).getTime() - new Date(b.dueAt!).getTime());
  const inboxFlex = unpinnedFlex.filter((t) => !isScheduledToday(t.dueAt));

  const onMyDayIds = useMemo(() => {
    const ids = new Set<string>();
    for (const item of timeline) {
      if (item.type === "flex") ids.add(item.id);
      if (item.type === "occurrence") ids.add(item.taskId);
    }
    return ids;
  }, [timeline]);

  const pinnableCatalog = useMemo(() => {
    if (!streamBoard) return [] as PinnableCatalogTask[];
    const lanes: {
      streamName: string;
      streamColor: string | null;
      isInbox: boolean;
      tasks: StreamTask[];
    }[] = [
      ...streamBoard.streams.map((s) => ({
        streamName: s.name,
        streamColor: s.color,
        isInbox: false,
        tasks: s.tasks,
      })),
      {
        streamName: streamBoard.inbox.name,
        streamColor: null,
        isInbox: true,
        tasks: streamBoard.inbox.tasks,
      },
    ];
    return lanes.flatMap((lane) =>
      lane.tasks
        .filter((t) => t.kind === "flex" || t.repeatMode === "rolling")
        .filter((t) => !t.pinnedToday && !onMyDayIds.has(t.id))
        .map((t) => ({
          ...t,
          streamName: lane.streamName,
          streamColor: lane.streamColor,
          isInbox: lane.isInbox,
        })),
    );
  }, [streamBoard, onMyDayIds]);

  const searchHits = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    if (!q) return [] as PinnableCatalogTask[];
    return pinnableCatalog
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.streamName.toLowerCase().includes(q),
      )
      .slice(0, 24);
  }, [pinnableCatalog, taskSearch]);

  const planStreams = timeline.flatMap((item) =>
    item.type === "calendar" ? [] : [item.isInbox ? null : item.streamColor],
  );
  const planSegments = streams
    .map((st) => ({ ...st, count: planStreams.filter((c) => c === st.color).length }))
    .filter((st) => st.count > 0);
  const unsortedCount = planStreams.filter((c) => c === null).length;

  function applyRename(taskId: string, nextTitle: string) {
    setTimeline((prev) =>
      prev.map((item) => {
        if (item.type === "occurrence" && item.taskId === taskId) {
          return { ...item, title: nextTitle };
        }
        if (item.type === "flex" && item.id === taskId) {
          return { ...item, title: nextTitle };
        }
        return item;
      }),
    );
    setSuggestions((prev) =>
      prev.map((s) => ({
        ...s,
        tasks: s.tasks.map((t) => (t.id === taskId ? { ...t, title: nextTitle } : t)),
      })),
    );
    setFlexAvailable((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: nextTitle } : t)),
    );
    setStreamBoard((prev) => {
      if (!prev) return prev;
      const rename = (tasks: StreamTask[]) =>
        tasks.map((t) => (t.id === taskId ? { ...t, title: nextTitle } : t));
      return {
        ...prev,
        inbox: { ...prev.inbox, tasks: rename(prev.inbox.tasks) },
        streams: prev.streams.map((s) => ({ ...s, tasks: rename(s.tasks) })),
      };
    });
  }

  function modeLabel(mode: string) {
    if (mode === "habit") return "Habit";
    if (mode === "rolling") return "Picked up · rolling";
    return "Calendar";
  }

  function pinRowActions(taskId: string, opts?: { canComplete?: boolean }) {
    const canComplete = opts?.canComplete !== false;
    return (
      <div className="flex shrink-0 items-center gap-2">
        {canComplete && (
          <button
            type="button"
            className="rounded bg-ink px-3 py-1.5 text-sm text-paper"
            onClick={() => completeFlex(taskId)}
          >
            Done
          </button>
        )}
        <button
          type="button"
          className="rounded border border-accent px-3 py-1.5 text-sm text-accent"
          onClick={() => pinFlex(taskId, true)}
        >
          Pin
        </button>
        <TrashButton onClick={() => trashTask(taskId)} />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">
            My Day
          </h1>
          <p className="text-sm text-muted">
            {format(new Date(date + "T12:00:00"), "EEEE, MMMM d")}
          </p>
        </div>
        <button
          type="button"
          onClick={syncCalendar}
          className="rounded border border-locked px-3 py-1.5 text-sm text-locked"
        >
          Sync calendar
        </button>
      </div>

      <form
        onSubmit={addToMyDay}
        className="flex flex-wrap items-stretch gap-2 border border-line bg-paper/70 p-3"
      >
        <input
          className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2"
          placeholder="Add to My Day…"
          value={newTitle}
          maxLength={500}
          enterKeyHint="done"
          autoComplete="off"
          disabled={adding}
          onChange={(e) => setNewTitle(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={adding || !newTitle.trim()}
          className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          Add
        </button>
        <button
          type="button"
          onClick={() => setComposerMore(true)}
          className="rounded border border-line px-3 py-2 text-sm"
          title="Stream, goal, date or repeat"
        >
          More…
        </button>
      </form>
      {composerMore && (
        <TaskEditor
          mode={{ kind: "create", title: newTitle, pinDate: date }}
          onCancel={() => setComposerMore(false)}
          onDone={() => {
            setComposerMore(false);
            setNewTitle("");
            void reload(true);
          }}
        />
      )}

      {planSegments.length > 0 && (
        <div className="space-y-1" aria-label="Streams in today’s plan">
          <div className="flex h-2 overflow-hidden rounded">
            {planSegments.map((st) => (
              <div
                key={st.id}
                title={`${st.name}: ${st.count}`}
                style={{ flexGrow: st.count, backgroundColor: st.color }}
              />
            ))}
            {unsortedCount > 0 && (
              <div title={`Unsorted: ${unsortedCount}`} className="bg-line" style={{ flexGrow: unsortedCount }} />
            )}
          </div>
          <p className="text-xs text-muted">
            Today serves {planSegments.map((st) => st.name).join(", ")}
            {streams.length > planSegments.length && (
              <>
                {" · "}
                <a href="/streams" className="text-locked">
                  balance on Streams →
                </a>
              </>
            )}
          </p>
        </div>
      )}

      {error && (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}
      {syncMsg && <p className="text-sm text-ok">{syncMsg}</p>}

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <section className="space-y-3">
          {timeline.length === 0 && (
            <p className="text-muted">
              Empty day. Add above, pin from Inbox, or wait for today’s habits / dues.
            </p>
          )}
          {timeline.map((item) => {
            if (item.type === "calendar") {
              return (
                <article
                  key={`cal-${item.id}`}
                  className="border-l-4 border-locked bg-locked-soft/60 px-4 py-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-locked">
                        Calendar · locked
                      </p>
                      <h2 className="font-semibold text-ink">{item.title}</h2>
                      <p className="text-sm text-muted">
                        {timeLabel(item.start)} – {timeLabel(item.end)}
                        {item.location ? ` · ${item.location}` : ""}
                      </p>
                    </div>
                    <label className="text-xs text-locked">
                      Attention
                      <select
                        className="ml-2 rounded border border-line bg-paper px-2 py-1 text-ink"
                        value={item.attentionMode}
                        onChange={async (e) => {
                          await clientApi.updateAttention(item.id, e.target.value);
                          await reload();
                        }}
                      >
                        <option value="full">Full</option>
                        <option value="partial">Partial</option>
                        <option value="idle">Idle</option>
                      </select>
                    </label>
                  </div>
                </article>
              );
            }

            if (item.type === "occurrence") {
              return (
                <article
                  key={`occ-${item.id}`}
                  className={`border-l-4 px-4 py-3 ${
                    item.hard
                      ? "border-hard bg-hard-soft/50"
                      : item.mode === "habit"
                        ? "border-accent bg-accent-soft/50"
                        : "border-line bg-paper-2/80"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold uppercase tracking-wide">
                        {streamLabel(item)}
                        {modeLabel(item.mode)}
                        {item.hard ? " · hard" : " · soft"}
                        {item.dueSince
                          ? ` · due since ${format(new Date(item.dueSince), "MMM d")}`
                          : ""}
                      </p>
                      <h2 className="font-semibold">
                        <TaskTitle
                          taskId={item.taskId}
                          title={item.title}
                          className="font-semibold"
                          onRenamed={(next) => applyRename(item.taskId, next)}
                          onError={setError}
                        />
                      </h2>
                      <p className="text-sm text-muted">
                        {item.scheduledStart
                          ? `${timeLabel(item.scheduledStart)}${
                              item.scheduledEnd ? `–${timeLabel(item.scheduledEnd)}` : ""
                            }`
                          : "Today"}
                        {item.status !== "pending" ? ` · ${item.status}` : ""}
                      </p>
                      {streamPicker(item.taskId, item.listId)}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        className="rounded bg-ink px-3 py-1.5 text-sm text-paper"
                        onClick={() => completeOccurrence(item.taskId, item.id)}
                      >
                        Done
                      </button>
                      {item.skippable && (
                        <button
                          type="button"
                          className="rounded border border-line px-3 py-1.5 text-sm"
                          onClick={() =>
                            setSkipFor(skipFor === item.id ? null : item.id)
                          }
                        >
                          Skip…
                        </button>
                      )}
                      {viewButton(item.taskId)}
                      {editButton(item.taskId)}
                      <div className="border-l border-line pl-0.5">
                        <TrashButton onClick={() => trashTask(item.taskId)} />
                      </div>
                    </div>
                  </div>

                  {skipFor === item.id && (
                    <div className="mt-3 space-y-2 border-t border-line/50 pt-3 text-sm">
                      {item.mode === "habit" && (
                        <div className="flex flex-wrap gap-2">
                          {HABIT_REASONS.map((r) => (
                            <button
                              key={r.id}
                              type="button"
                              className="rounded border border-line px-2 py-1"
                              onClick={() => doSkip(item.id, "skip", r.id)}
                            >
                              {r.label}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="rounded border border-accent px-2 py-1 text-accent"
                            onClick={() => doSkip(item.id, "snooze", "snooze")}
                          >
                            Snooze → tomorrow
                          </button>
                        </div>
                      )}
                      {item.mode === "rolling" && (
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            className="rounded border border-line px-2 py-1"
                            onClick={() => doSkip(item.id, "defer", "deferred")}
                          >
                            Do later (push next cycle)
                          </button>
                          <button
                            type="button"
                            className="rounded border border-line px-2 py-1"
                            onClick={() => doSkip(item.id, "skip", "skip_cycle")}
                          >
                            Skip this cycle
                          </button>
                          <label className="flex items-center gap-1 text-xs text-muted">
                            Plan for
                            <input
                              type="date"
                              className="rounded border border-line bg-paper px-1 py-0.5 text-ink"
                              min={format(new Date(), "yyyy-MM-dd")}
                              onChange={(e) => {
                                const value = e.target.value;
                                if (!value) return;
                                const days = differenceInCalendarDays(
                                  startOfDay(new Date(`${value}T00:00:00`)),
                                  startOfDay(new Date()),
                                );
                                if (days < 1) {
                                  setError("Pick a future date");
                                  return;
                                }
                                void doSkip(item.id, "defer", "planned", days);
                              }}
                            />
                          </label>
                        </div>
                      )}
                      {item.mode === "fixed" && (
                        <button
                          type="button"
                          className="rounded border border-line px-2 py-1"
                          onClick={() => doSkip(item.id, "skip", "skipped")}
                        >
                          Skip this occurrence
                        </button>
                      )}
                    </div>
                  )}
                </article>
              );
            }

            const suggested = item.source === "suggested";
            return (
              <article
                key={`flex-${item.id}`}
                className={`border-l-4 px-4 py-3 ${
                  suggested ? "border-dashed bg-paper/70" : "border-line bg-paper-2/80"
                }`}
                style={
                  !item.isInbox && item.streamColor
                    ? { borderLeftColor: item.streamColor }
                    : undefined
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {streams.length > 0
                        ? streamLabel({ ...item, taskId: item.id })
                        : "From Inbox"}
                      {suggested && " · Suggested"}
                    </p>
                    <h2 className="font-semibold">
                      <TaskTitle
                        taskId={item.id}
                        title={item.title}
                        className="font-semibold"
                        onRenamed={(next) => applyRename(item.id, next)}
                        onError={setError}
                      />
                    </h2>
                    <ScheduledDate dueAt={item.dueAt} />
                    {streamPicker(item.id, item.listId)}
                  </div>
                  <div className="flex items-center gap-2">
                    {suggested ? (
                      <>
                        <button
                          type="button"
                          className="rounded bg-ink px-3 py-1.5 text-sm text-paper"
                          onClick={() => pinFlex(item.id, true)}
                        >
                          Keep
                        </button>
                        <button
                          type="button"
                          className="rounded border border-line px-3 py-1.5 text-sm"
                          onClick={() => swapSuggestion(item.id)}
                        >
                          Swap
                        </button>
                        <button
                          type="button"
                          className="rounded px-2 py-1.5 text-sm text-muted hover:text-ink"
                          onClick={() => pinFlex(item.id, false)}
                        >
                          Not today
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="rounded bg-ink px-3 py-1.5 text-sm text-paper"
                          onClick={() => completeFlex(item.id)}
                        >
                          Done
                        </button>
                        <button
                          type="button"
                          className="rounded border border-line px-3 py-1.5 text-sm"
                          onClick={() => pinFlex(item.id, false)}
                        >
                          Unpin
                        </button>
                      </>
                    )}
                    {viewButton(item.id)}
                    {editButton(item.id)}
                    {checklistButton(item.id, item.templateId)}
                    <div className="border-l border-line pl-0.5">
                      <TrashButton onClick={() => trashTask(item.id)} />
                    </div>
                  </div>
                </div>
                {checklist(item.id, item.templateId)}
              </article>
            );
          })}
        </section>
      )}

      {!loading && completed.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-ok">
            Completed today
          </h2>
          <ul className="space-y-2">
            {completed.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className="flex items-center justify-between gap-2 border-l-4 border-ok bg-ok/5 px-4 py-2 opacity-60"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-ok">✓</span>
                    <span className="font-medium line-through">{item.title}</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted">
                    {item.streamColor && !item.isInbox && (
                      <StreamTag name={item.listName} color={item.streamColor} />
                    )}
                    <span>{timeLabel(item.completedAt)}</span>
                    {item.type === "occurrence" && item.status === "skipped" && (
                      <span className="text-muted">(skipped)</span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {!loading && plannedToday.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Planned for today
          </h2>
          <ul className="space-y-2">
            {plannedToday.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-2 border-l-4 border-accent bg-accent-soft/40 px-4 py-2"
              >
                <div className="min-w-0 flex-1">
                  <TaskTitle
                    taskId={t.id}
                    title={t.title}
                    className="font-medium"
                    onRenamed={(next) => applyRename(t.id, next)}
                    onError={setError}
                  />
                  <div>
                    <ScheduledDate dueAt={t.dueAt} />
                  </div>
                </div>
                {pinRowActions(t.id)}
              </li>
            ))}
          </ul>
        </section>
      )}

      {suggestions.some((s) => s.tasks.length > 0) && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            Fill this wait
          </h2>
          {suggestions.map((s) =>
            s.tasks.length === 0 ? null : (
              <div key={s.eventId} className="border border-line bg-paper/70 p-4">
                <p className="text-sm text-muted">
                  During <span className="font-medium text-ink">{s.eventTitle}</span>
                  {s.remainingMinutes > 0 ? ` · ~${s.remainingMinutes}m left` : ""}
                </p>
                <ul className="mt-2 space-y-2">
                  {s.tasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <TaskTitle
                          taskId={t.id}
                          title={t.title}
                          onRenamed={(next) => applyRename(t.id, next)}
                          onError={setError}
                        />
                        <div>
                          <ScheduledDate dueAt={t.dueAt} />
                        </div>
                      </div>
                      {pinRowActions(t.id)}
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </section>
      )}

      {!loading && (pinnableCatalog.length > 0 || inboxFlex.length > 0 || taskSearch.trim()) && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
              {streams.length > 0 ? "Find & pin" : "From Inbox"}
            </h2>
            {streams.length > 0 && (
              <input
                type="search"
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                placeholder="Search any stream…"
                className="w-full max-w-sm rounded border border-line bg-paper px-3 py-2 text-sm"
                aria-label="Search tasks from any stream"
              />
            )}
          </div>
          {taskSearch.trim() ? (
            searchHits.length === 0 ? (
              <p className="text-sm text-muted">No matching tasks to pin.</p>
            ) : (
              <ul className="space-y-2">
                {searchHits.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center justify-between gap-2 border-b border-line/60 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <TaskTitle
                        taskId={t.id}
                        title={t.title}
                        onRenamed={(next) => applyRename(t.id, next)}
                        onError={setError}
                      />
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {!t.isInbox && t.streamColor && (
                          <StreamTag name={t.streamName} color={t.streamColor} />
                        )}
                        {t.isInbox && <span className="text-muted">Inbox</span>}
                        {t.repeatMode === "rolling" && (
                          <span className="text-muted">Rolling</span>
                        )}
                        <ScheduledDate dueAt={t.dueAt} />
                      </div>
                    </div>
                    {pinRowActions(t.id, { canComplete: t.kind === "flex" })}
                  </li>
                ))}
              </ul>
            )
          ) : (
            <ul className="space-y-2">
              {inboxFlex.slice(0, 12).map((t) => (
                <li
                  key={t.id}
                  className="flex items-center justify-between gap-2 border-b border-line/60 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <TaskTitle
                      taskId={t.id}
                      title={t.title}
                      onRenamed={(next) => applyRename(t.id, next)}
                      onError={setError}
                    />
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      {!t.list.isInbox && t.list.color && (
                        <StreamTag name={t.list.name} color={t.list.color} />
                      )}
                      <ScheduledDate dueAt={t.dueAt} />
                    </div>
                  </div>
                  {pinRowActions(t.id)}
                </li>
              ))}
              {inboxFlex.length === 0 && pinnableCatalog.length > 0 && (
                <p className="text-sm text-muted">
                  Search above to pin a task from any stream.
                </p>
              )}
            </ul>
          )}
        </section>
      )}

      {/* Task Detail Modal */}
      {modalTaskId && (
        <TaskDetailModal
          taskId={modalTaskId}
          mode={modalMode}
          onClose={() => setModalTaskId(null)}
          onUpdate={() => reload(true)}
        />
      )}
    </div>
  );
}
