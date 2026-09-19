"use client";

import { useEffect, useRef, useState } from "react";
import { addMinutes, format } from "date-fns";
import { TaskTitle } from "@/components/TaskTitle";
import { TrashButton } from "@/components/TrashButton";
import { clientApi, type Task, type TaskAnalysis } from "@/lib/client-api";

type RecurrenceMode = "habit" | "rolling" | "fixed";

function localDateInputValue(d = new Date()) {
  return format(d, "yyyy-MM-dd");
}

function combineLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00`);
}

export default function InboxPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [trash, setTrash] = useState<Task[]>([]);
  const [title, setTitle] = useState("");
  const [repeat, setRepeat] = useState(false);
  const [mode, setMode] = useState<RecurrenceMode>("rolling");
  const [skippable, setSkippable] = useState(true);
  const [frequency, setFrequency] = useState<"daily" | "weekly" | "monthly">("daily");
  const [interval, setInterval] = useState(1);
  const [activeMonths, setActiveMonths] = useState<number[]>([]);
  const [estimatedMinutes, setEstimatedMinutes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState(""); // empty = all-day
  const [syncOnCreate, setSyncOnCreate] = useState(false);
  const [analysis, setAnalysis] = useState<TaskAnalysis | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [timingTouched, setTimingTouched] = useState(false);
  const [dateTouched, setDateTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [calendarConnected, setCalendarConnected] = useState(false);
  const [calendarCanWrite, setCalendarCanWrite] = useState(false);
  const [scheduleFor, setScheduleFor] = useState<string | null>(null);
  const [schedDate, setSchedDate] = useState(localDateInputValue());
  const [schedTime, setSchedTime] = useState(""); // empty = all-day
  const [schedMins, setSchedMins] = useState("30");
  const [syncToCal, setSyncToCal] = useState(true);
  const analyzeSeq = useRef(0);

  async function reload(quiet = false) {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const [data, status] = await Promise.all([
        clientApi.inbox(),
        clientApi.calendarStatus().catch(() => ({ connected: false, canWrite: false })),
      ]);
      setTasks(data.tasks);
      setTrash(data.trash ?? []);
      setCalendarConnected(status.connected);
      setCalendarCanWrite(status.canWrite);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!quiet) setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  useEffect(() => {
    const trimmed = title.trim();
    if (trimmed.length < 3 || repeat) {
      setAnalysis(null);
      return;
    }
    const seq = ++analyzeSeq.current;
    const timer = setTimeout(async () => {
      setAnalyzing(true);
      try {
        const { analysis: result } = await clientApi.analyzeTask(trimmed);
        if (seq !== analyzeSeq.current) return;
        setAnalysis(result);
        if (!timingTouched) {
          setEstimatedMinutes(String(result.estimatedMinutes));
        }
        if (!dateTouched) {
          if (result.suggestedDate) setDueDate(result.suggestedDate);
          // Don't auto-fill time — leave blank for all-day unless title implies a time
          if (result.suggestedWindowStart) setDueTime(result.suggestedWindowStart);
        }
      } catch {
        // ignore
      } finally {
        if (seq === analyzeSeq.current) setAnalyzing(false);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [title, repeat]);

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setError(null);
    setMsg(null);
    try {
      const allDay = Boolean(dueDate && !dueTime);
      const dueAt =
        !repeat && dueDate
          ? (allDay
              ? combineLocal(dueDate, "00:00")
              : combineLocal(dueDate, dueTime)
            ).toISOString()
          : null;

      const { task } = await clientApi.createTask({
        title: title.trim(),
        estimatedMinutes: estimatedMinutes ? Number(estimatedMinutes) : null,
        dueAt,
        ...(repeat
          ? {
              kind: "template",
              recurrence: {
                mode,
                frequency: mode === "habit" ? "daily" : frequency,
                interval: mode === "habit" ? 1 : interval,
                byWeekday: frequency === "weekly" ? [1, 2, 3, 4, 5] : [],
                skippable: mode === "habit" ? true : mode === "fixed" ? skippable : true,
                alarmPolicy: mode === "fixed" && !skippable ? "panic" : "none",
                activeMonths: mode === "rolling" ? activeMonths : [],
              },
            }
          : { kind: "flex" }),
      });

      if (!repeat && dueDate) {
        const start = allDay
          ? combineLocal(dueDate, "00:00")
          : combineLocal(dueDate, dueTime);
        const end = allDay
          ? addMinutes(start, 24 * 60)
          : addMinutes(start, Number(estimatedMinutes) || 30);
        const result = await clientApi.scheduleTask(task.id, {
          start: start.toISOString(),
          end: end.toISOString(),
          allDay,
          date: dueDate,
          syncToCalendar: syncOnCreate && calendarConnected,
        });
        if (syncOnCreate && result.calendarEvent) {
          setMsg(
            allDay
              ? "Added as all-day and synced to Google Calendar."
              : "Added and synced to Google Calendar.",
          );
        } else if (syncOnCreate && result.calendarError) {
          setMsg("Added with a date. Calendar sync needs Google sign-in (write access).");
        } else if (dueDate) {
          setMsg(allDay ? "Added as an all-day task." : "Added with a due date.");
        }
      }

      setTitle("");
      setEstimatedMinutes("");
      setDueDate("");
      setDueTime("");
      setSyncOnCreate(false);
      setAnalysis(null);
      setTimingTouched(false);
      setDateTouched(false);
      setRepeat(false);
      setMode("rolling");
      setSkippable(true);
      setActiveMonths([]);
      setInterval(1);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add");
    }
  }

  function openSchedule(t: Task) {
    setScheduleFor(t.id);
    setMsg(null);
    setError(null);
    const mins = t.estimatedMinutes ?? 30;
    setSchedMins(String(mins));
    setSchedDate(localDateInputValue());
    setSchedTime(""); // default all-day
    setSyncToCal(calendarConnected);
    void clientApi
      .analyzeTask(t.title)
      .then(({ analysis: a }) => {
        if (a.suggestedDate) setSchedDate(a.suggestedDate);
        if (a.suggestedWindowStart) setSchedTime(a.suggestedWindowStart);
        if (a.estimatedMinutes) setSchedMins(String(a.estimatedMinutes));
      })
      .catch(() => undefined);
  }

  async function submitSchedule(taskId: string) {
    setError(null);
    setMsg(null);
    try {
      const allDay = !schedTime;
      const start = allDay
        ? combineLocal(schedDate, "00:00")
        : combineLocal(schedDate, schedTime);
      const end = allDay
        ? addMinutes(start, 24 * 60)
        : addMinutes(start, Number(schedMins) || 30);
      const result = await clientApi.scheduleTask(taskId, {
        start: start.toISOString(),
        end: end.toISOString(),
        allDay,
        date: schedDate,
        syncToCalendar: syncToCal,
      });
      if (result.calendarError === "NO_TOKEN") {
        setMsg("Scheduled in Daylock. Sign in with Google to push to Calendar.");
      } else if (result.calendarError === "NEED_REAUTH") {
        setMsg(
          "Scheduled in Daylock. Re-sign in with Google to grant calendar write access.",
        );
      } else if (result.calendarError) {
        setMsg("Scheduled in Daylock, but Google Calendar sync failed.");
      } else if (result.calendarEvent) {
        setMsg(
          allDay
            ? `All-day on Google Calendar: ${result.calendarEvent.title}`
            : `Scheduled on Google Calendar: ${result.calendarEvent.title}`,
        );
      } else {
        setMsg(allDay ? "Scheduled as all-day." : "Scheduled (due set).");
      }
      setScheduleFor(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Schedule failed");
    }
  }

  function toggleMonth(m: number) {
    setActiveMonths((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m].sort((a, b) => a - b),
    );
  }

  function applyRename(taskId: string, nextTitle: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, title: nextTitle } : t)),
    );
  }

  async function trashTask(taskId: string) {
    setError(null);
    try {
      await clientApi.trashTask(taskId);
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not trash");
    }
  }

  async function restoreTask(taskId: string) {
    setError(null);
    try {
      await clientApi.updateTask(taskId, { archived: false });
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not restore");
    }
  }

  const open = tasks.filter((t) => !t.completedAt);
  const done = tasks.filter((t) => t.completedAt);
  const monthLabels = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Inbox</h1>
        <p className="text-sm text-muted">
          Capture here. Schedule flex tasks onto a time — syncs to Google when connected.
          {calendarConnected
            ? calendarCanWrite
              ? " Calendar: connected (write)."
              : " Calendar: connected (re-auth needed for write)."
            : " Calendar: not connected."}
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {msg && <p className="text-sm text-ok">{msg}</p>}

      <form onSubmit={addTask} className="space-y-3 border border-line bg-paper/70 p-4">
        <input
          className="w-full rounded border border-line bg-paper px-3 py-2"
          placeholder="Add a task…"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            setTimingTouched(false);
            setDateTouched(false);
          }}
          required
        />

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Repeats
        </label>

        {repeat && (
          <fieldset className="space-y-2 text-sm">
            <legend className="font-medium">How should it repeat?</legend>
            {(
              [
                {
                  id: "habit" as const,
                  label: "Habit (daily target, no backlog)",
                  hint: "Exercise — skip today, nothing owed",
                },
                {
                  id: "rolling" as const,
                  label: "Every X days after I finish",
                  hint: "Grass / flexible chores — due slides",
                },
                {
                  id: "fixed" as const,
                  label: "On the calendar",
                  hint: "Meds / trash night — fixed slot",
                },
              ] as const
            ).map((opt) => (
              <label
                key={opt.id}
                className="flex cursor-pointer gap-2 rounded border border-line/60 p-2"
              >
                <input
                  type="radio"
                  name="mode"
                  checked={mode === opt.id}
                  onChange={() => {
                    setMode(opt.id);
                    if (opt.id === "habit") {
                      setFrequency("daily");
                      setSkippable(true);
                    }
                  }}
                />
                <span>
                  <span className="font-medium">{opt.label}</span>
                  <span className="block text-xs text-muted">{opt.hint}</span>
                </span>
              </label>
            ))}

            {mode !== "habit" && (
              <div className="flex flex-wrap gap-3 pt-1">
                <label className="flex items-center gap-2">
                  Every
                  <input
                    type="number"
                    min={1}
                    className="w-14 rounded border border-line bg-paper px-2 py-1"
                    value={interval}
                    onChange={(e) => setInterval(Number(e.target.value) || 1)}
                  />
                </label>
                <select
                  className="rounded border border-line bg-paper px-2 py-1"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value as typeof frequency)}
                >
                  <option value="daily">day(s)</option>
                  <option value="weekly">week(s)</option>
                  <option value="monthly">month(s)</option>
                </select>
              </div>
            )}

            {mode === "rolling" && (
              <div>
                <p className="mb-1 text-xs text-muted">
                  Active months (empty = year-round). Grass: Apr–Sep.
                </p>
                <div className="flex flex-wrap gap-1">
                  {monthLabels.map((label, i) => {
                    const m = i + 1;
                    const on = activeMonths.includes(m);
                    return (
                      <button
                        key={m}
                        type="button"
                        onClick={() => toggleMonth(m)}
                        className={`h-8 w-8 rounded text-xs ${
                          on ? "bg-ink text-paper" : "border border-line"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {mode === "fixed" && (
              <div className="flex flex-wrap gap-3">
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={skippable}
                    onChange={() => setSkippable(true)}
                  />
                  Soft (expires overnight)
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="radio"
                    checked={!skippable}
                    onChange={() => setSkippable(false)}
                  />
                  Hard (alarms)
                </label>
              </div>
            )}
          </fieldset>
        )}

        {!repeat && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                Date
                <input
                  type="date"
                  className="rounded border border-line bg-paper px-2 py-1"
                  value={dueDate}
                  onChange={(e) => {
                    setDateTouched(true);
                    setDueDate(e.target.value);
                  }}
                />
              </label>
              <label className="flex items-center gap-2">
                Time (optional)
                <input
                  type="time"
                  className="rounded border border-line bg-paper px-2 py-1"
                  value={dueTime}
                  onChange={(e) => {
                    setDateTouched(true);
                    setDueTime(e.target.value);
                  }}
                  disabled={!dueDate}
                />
              </label>
              {dueDate && !dueTime && (
                <span className="self-center text-xs text-muted">All-day</span>
              )}
              <label className="flex items-center gap-2">
                ~min
                <input
                  type="number"
                  min={1}
                  className="w-16 rounded border border-line bg-paper px-2 py-1"
                  value={estimatedMinutes}
                  onChange={(e) => {
                    setTimingTouched(true);
                    setEstimatedMinutes(e.target.value);
                  }}
                />
              </label>
              {analyzing && <span className="text-muted">Estimating…</span>}
            </div>
            <p className="text-xs text-muted">
              Date is optional. Leave time empty for an all-day task.
            </p>
            {dueDate && (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={syncOnCreate}
                  onChange={(e) => setSyncOnCreate(e.target.checked)}
                />
                Also add to Google Calendar
                {!calendarConnected && (
                  <span className="text-xs text-muted">
                    (sign in with Google later to sync)
                  </span>
                )}
              </label>
            )}
            {analysis && (
              <p className="text-xs text-muted">
                {analysis.source === "llm" ? "AI" : "Heuristic"} ({analysis.confidence}):{" "}
                {analysis.rationale}
              </p>
            )}
          </div>
        )}

        <button type="submit" className="rounded bg-ink px-4 py-2 text-sm text-paper">
          Add to Inbox
        </button>
      </form>

      {loading ? (
        <p className="text-muted">Loading…</p>
      ) : (
        <ul className="divide-y divide-line border border-line bg-paper/60">
          {open.map((t) => (
            <li key={t.id} className="space-y-2 px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <TaskTitle
                    taskId={t.id}
                    title={t.title}
                    className="font-medium"
                    onRenamed={(next) => applyRename(t.id, next)}
                    onError={setError}
                  />
                  <p className="text-xs text-muted">
                    {t.recurrenceRule
                      ? `${t.recurrenceRule.mode} · every ${t.recurrenceRule.interval} ${t.recurrenceRule.frequency}`
                      : t.estimatedMinutes
                        ? `flex · ${t.estimatedMinutes}m`
                        : "flex"}
                    {t.dueAt
                      ? ` · ${
                          new Date(t.dueAt).getHours() === 0 &&
                          new Date(t.dueAt).getMinutes() === 0
                            ? format(new Date(t.dueAt), "MMM d") + " (all-day)"
                            : format(new Date(t.dueAt), "MMM d h:mm a")
                        }`
                      : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center">
                  {!t.recurrenceRule && (
                    <div className="flex gap-2 pr-1">
                      <button
                        type="button"
                        className="text-sm text-locked"
                        onClick={() =>
                          scheduleFor === t.id ? setScheduleFor(null) : openSchedule(t)
                        }
                      >
                        Schedule
                      </button>
                      <button
                        type="button"
                        className="text-sm text-accent"
                        onClick={async () => {
                          await clientApi.completeTask(t.id);
                          await reload();
                        }}
                      >
                        Done
                      </button>
                    </div>
                  )}
                  <div
                    className={
                      t.recurrenceRule ? undefined : "ml-1 border-l border-line pl-0.5"
                    }
                  >
                    <TrashButton onClick={() => trashTask(t.id)} />
                  </div>
                </div>
              </div>

              {scheduleFor === t.id && (
                <div className="space-y-2 rounded border border-line bg-paper p-3 text-sm">
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2">
                      Date
                      <input
                        type="date"
                        className="rounded border border-line bg-paper px-2 py-1"
                        value={schedDate}
                        onChange={(e) => setSchedDate(e.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2">
                      Start (optional)
                      <input
                        type="time"
                        className="rounded border border-line bg-paper px-2 py-1"
                        value={schedTime}
                        onChange={(e) => setSchedTime(e.target.value)}
                      />
                    </label>
                    {schedTime && (
                      <label className="flex items-center gap-2">
                        ~min
                        <input
                          type="number"
                          min={1}
                          className="w-16 rounded border border-line bg-paper px-2 py-1"
                          value={schedMins}
                          onChange={(e) => setSchedMins(e.target.value)}
                        />
                      </label>
                    )}
                    {!schedTime && (
                      <span className="text-xs text-muted self-center">All-day</span>
                    )}
                  </div>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={syncToCal}
                      onChange={(e) => setSyncToCal(e.target.checked)}
                      disabled={!calendarConnected}
                    />
                    Add to Google Calendar
                    {!calendarConnected && (
                      <span className="text-xs text-muted">(connect via Google sign-in)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    className="rounded bg-locked px-3 py-1.5 text-paper"
                    onClick={() => submitSchedule(t.id)}
                  >
                    Confirm schedule
                  </button>
                </div>
              )}
            </li>
          ))}
          {open.length === 0 && (
            <li className="px-4 py-6 text-sm text-muted">Inbox is empty.</li>
          )}
        </ul>
      )}

      {done.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Completed ({done.length})</summary>
          <ul className="mt-2 space-y-1">
            {done.map((t) => (
              <li key={t.id} className="line-through">
                {t.title}
              </li>
            ))}
          </ul>
        </details>
      )}

      {trash.length > 0 && (
        <details className="text-sm text-muted">
          <summary className="cursor-pointer">Trash ({trash.length})</summary>
          <ul className="mt-2 space-y-2">
            {trash.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-2">
                <span>{t.title}</span>
                <button
                  type="button"
                  className="text-sm font-medium text-accent"
                  onClick={() => restoreTask(t.id)}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
