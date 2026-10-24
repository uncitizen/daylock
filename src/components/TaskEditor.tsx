"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { addMinutes, format, getDay } from "date-fns";
import { clientApi, type RecurrenceInput, type StreamOptions, type Task, type Template } from "@/lib/client-api";

type Mode =
  | { kind: "create"; listId?: string; goalId?: string | null; title?: string; pinDate?: string }
  | { kind: "edit"; taskId: string };

type Props = {
  mode: Mode;
  onDone: () => void;
  onCancel: () => void;
};

type RepeatKind = "none" | "days" | "every";
type Strictness = "habit" | "soft" | "hard";

const WEEKDAYS = [
  { day: 1, label: "Mon" },
  { day: 2, label: "Tue" },
  { day: 3, label: "Wed" },
  { day: 4, label: "Thu" },
  { day: 5, label: "Fri" },
  { day: 6, label: "Sat" },
  { day: 0, label: "Sun" },
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STRICTNESS: { id: Strictness; label: string; hint: string }[] = [
  { id: "habit", label: "Flexible", hint: "Skip freely" },
  { id: "soft", label: "Soft", hint: "Expires" },
  { id: "hard", label: "Hard", hint: "Alarms" },
];

const field =
  "w-full rounded-[10px] border border-line-soft bg-white px-3 py-2.5 text-[15px] text-ink outline-none focus:border-accent focus:ring-1 focus:ring-accent/30";
const labelCls = "text-[10px] font-bold uppercase tracking-wide text-muted";
const chip = (on: boolean) =>
  `inline-flex min-h-[38px] min-w-[44px] items-center justify-center rounded-lg px-3 text-xs font-medium transition ${
    on ? "bg-ink text-paper" : "border border-line bg-white text-ink/80 hover:border-ink/40"
  }`;

function toLocalDate(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd");
}

function toLocalTime(iso: string) {
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0 ? "" : format(d, "HH:mm");
}

function formatTimeLabel(hhmm: string) {
  if (!hhmm) return "";
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(2000, 0, 1, h, m);
  return format(d, "h:mm a");
}

function dayNames(days: number[]) {
  if (days.length === 7) return "Every day";
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order
    .filter((d) => days.includes(d))
    .map((d) => WEEKDAYS.find((w) => w.day === d)?.label ?? "")
    .filter(Boolean)
    .join(", ");
}

function monthRangeLabel(months: number[]) {
  if (months.length === 0) return "all year";
  if (months.length === 12) return "all year";
  const sorted = [...months].sort((a, b) => a - b);
  const contiguous =
    sorted.length > 1 && sorted.every((m, i) => i === 0 || m === sorted[i - 1]! + 1);
  if (contiguous) {
    return `${MONTHS[sorted[0]! - 1]}–${MONTHS[sorted[sorted.length - 1]! - 1]}`;
  }
  return sorted.map((m) => MONTHS[m - 1]).join(", ");
}

/**
 * One editor for every task: title, stream, goal, estimate, a one-off date or a
 * repeat schedule. Opens as a focused bottom sheet (mobile-first).
 */
export function TaskEditor({ mode, onDone, onCancel }: Props) {
  const editing = mode.kind === "edit";
  const titleId = useId();
  const [mounted, setMounted] = useState(false);
  const [options, setOptions] = useState<StreamOptions | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState(mode.kind === "create" ? (mode.title ?? "") : "");
  const [notes, setNotes] = useState("");
  const [listId, setListId] = useState(mode.kind === "create" ? (mode.listId ?? "") : "");
  const [goalId, setGoalId] = useState(mode.kind === "create" ? (mode.goalId ?? "") : "");
  const [templateId, setTemplateId] = useState("");
  const [estimate, setEstimate] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [repeat, setRepeat] = useState<RepeatKind>("none");
  const [days, setDays] = useState<number[]>([getDay(new Date())]);
  const [strictness, setStrictness] = useState<Strictness>("habit");
  const [interval, setIntervalN] = useState(1);
  const [unit, setUnit] = useState<"daily" | "weekly" | "monthly">("weekly");
  const [months, setMonths] = useState<number[]>([]);
  const [nextDue, setNextDue] = useState("");
  const [repeatTime, setRepeatTime] = useState("");
  const [repeatTouched, setRepeatTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function fillFromTask(task: Task & { listId: string; goalId: string | null }) {
    setTitle(task.title);
    setNotes(task.notes ?? "");
    setListId(task.listId);
    setGoalId(task.goalId ?? "");
    setEstimate(task.estimatedMinutes ? String(task.estimatedMinutes) : "");
    if (task.dueAt) {
      setDate(toLocalDate(task.dueAt));
      setTime(toLocalTime(task.dueAt));
    }
    const rule = task.recurrenceRule;
    if (!rule) return;
    setRepeatTime(rule.windowStart ?? "");
    if (rule.mode === "rolling" || rule.frequency === "monthly") {
      setRepeat("every");
      setIntervalN(rule.interval);
      setUnit(rule.frequency as "daily" | "weekly" | "monthly");
      setMonths(rule.activeMonths ?? []);
      setNextDue(rule.nextDueAt ? toLocalDate(rule.nextDueAt) : "");
      return;
    }
    setRepeat("days");
    setDays(rule.frequency === "daily" ? ALL_DAYS : rule.byWeekday.length > 0 ? rule.byWeekday : days);
    setStrictness(rule.mode === "habit" ? "habit" : rule.skippable ? "soft" : "hard");
  }

  useEffect(() => {
    // Client-only portal target; defer so we don't sync-set during effect setup.
    const t = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [opts, tmpl] = await Promise.all([
          clientApi.streamOptions(),
          clientApi.getTemplates(),
        ]);
        if (!alive) return;
        setOptions(opts);
        setTemplates(tmpl.templates);
        if (mode.kind === "create") {
          setListId((prev) => prev || opts.inboxId);
          setLoaded(true);
          return;
        }
        const { task } = await clientApi.getTask(mode.taskId);
        if (!alive) return;
        fillFromTask(task);
        setLoaded(true);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Could not load");
          setLoaded(true);
        }
      }
    })();
    return () => {
      alive = false;
    };
    // Load once per editor; mode identity changes on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stream = options?.streams.find((s) => s.id === listId);
  const goals = stream?.goals ?? [];

  function touch<T>(set: (v: T) => void) {
    return (v: T) => {
      setRepeatTouched(true);
      set(v);
    };
  }

  const summary = useMemo(() => {
    const mins = estimate ? `~${estimate} min` : null;
    const at = repeat !== "none" && repeatTime ? `around ${formatTimeLabel(repeatTime)}` : null;
    if (repeat === "none") {
      if (!date) return ["No date — waits in backlog", mins].filter(Boolean).join(" · ");
      const when = time
        ? `${format(new Date(`${date}T${time}:00`), "MMM d · h:mm a")}`
        : format(new Date(`${date}T12:00:00`), "MMM d");
      return [when, mins].filter(Boolean).join(" · ");
    }
    if (repeat === "days") {
      const firm = STRICTNESS.find((s) => s.id === strictness)?.label ?? "Flexible";
      return ["Repeats", dayNames(days) || "Pick days", firm, mins, at].filter(Boolean).join(" · ");
    }
    const unitLabel = unit === "daily" ? "day" : unit === "weekly" ? "week" : "month";
    const wait = `${interval} ${unitLabel}${interval === 1 ? "" : "s"} after done`;
    return ["Will schedule", wait, monthRangeLabel(months), mins, at].filter(Boolean).join(" · ");
  }, [repeat, date, time, days, strictness, estimate, repeatTime, interval, unit, months]);

  function buildRecurrence(): RecurrenceInput | null {
    const mins = Number(estimate) || 30;
    const windowStart = repeatTime || null;
    const windowEnd = repeatTime
      ? format(addMinutes(new Date(`2000-01-01T${repeatTime}:00`), mins), "HH:mm")
      : null;
    if (repeat === "days") {
      const everyDay = days.length === 7;
      return {
        mode: strictness === "habit" ? "habit" : "fixed",
        frequency: everyDay ? "daily" : "weekly",
        interval: 1,
        byWeekday: everyDay ? [] : [...days].sort(),
        skippable: strictness !== "hard",
        alarmPolicy: strictness === "hard" ? "panic" : "none",
        windowStart,
        windowEnd,
        activeMonths: [],
      };
    }
    return {
      mode: "rolling",
      frequency: unit,
      interval,
      byWeekday: [],
      skippable: true,
      alarmPolicy: "none",
      windowStart,
      windowEnd,
      activeMonths: months,
      // null = due today (shows on My Day); a future date keeps it off until then.
      nextDueAt: nextDue ? new Date(`${nextDue}T00:00:00`).toISOString() : null,
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setError("Enter a title");
      return;
    }
    if (repeat === "days" && days.length === 0) {
      setError("Pick at least one day");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const dueAt =
        repeat === "none" && date ? new Date(`${date}T${time || "00:00"}:00`).toISOString() : null;
      const estimatedMinutes = estimate ? Number(estimate) : null;
      const notesValue = notes.trim() || null;
      if (mode.kind === "create") {
        const { task: newTask } = await clientApi.createTask({
          title: trimmed,
          notes: notesValue,
          // Leave Inbox implicit so a #stream tag in the title can still file it.
          listId: listId && listId !== options?.inboxId ? listId : undefined,
          goalId: goalId || undefined,
          estimatedMinutes,
          dueAt,
          ...(repeat === "none"
            ? { kind: "flex" }
            : { kind: "template", recurrence: buildRecurrence() }),
          ...(mode.pinDate && repeat === "none" ? { pinToMyDay: true, pinDate: mode.pinDate } : {}),
        });
        if (templateId) {
          await clientApi.applyTemplate(newTask.id, templateId);
        }
      } else {
        await clientApi.updateTask(mode.taskId, {
          title: trimmed,
          notes: notesValue,
          listId,
          goalId: goalId || null,
          estimatedMinutes,
          dueAt,
          ...(repeatTouched ? { recurrence: repeat === "none" ? null : buildRecurrence() } : {}),
        });
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (!mounted) return null;

  const sheet = (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="Dismiss"
        className="absolute inset-0 bg-ink/30"
        onClick={onCancel}
      />
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={save}
        className="relative z-10 flex max-h-[min(92dvh,840px)] w-full max-w-md flex-col overflow-hidden rounded-t-[20px] border border-line-soft bg-sheet text-sm shadow-xl sm:rounded-[20px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-line" aria-hidden />
        </div>

        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
          <h2 id={titleId} className="font-[family-name:var(--font-display)] text-xl font-semibold text-ink">
            {editing ? "Edit task" : "Add with details"}
          </h2>
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-accent">
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 pb-4">
          {!loaded ? (
            <p className="py-8 text-center text-muted">{error ?? "Loading…"}</p>
          ) : (
            <>
              <div className="space-y-1.5">
                <label htmlFor={`${titleId}-title`} className={labelCls}>
                  Title
                </label>
                <input
                  id={`${titleId}-title`}
                  className={field}
                  placeholder="Task"
                  value={title}
                  maxLength={500}
                  autoFocus={!editing}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label htmlFor={`${titleId}-notes`} className={labelCls}>
                  Description
                </label>
                <textarea
                  id={`${titleId}-notes`}
                  className={`${field} min-h-[72px] resize-y`}
                  placeholder="Optional"
                  value={notes}
                  maxLength={10000}
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                {options && (
                  <div className="space-y-1.5">
                    <label htmlFor={`${titleId}-stream`} className={labelCls}>
                      Stream
                    </label>
                    <select
                      id={`${titleId}-stream`}
                      className={field}
                      value={listId}
                      onChange={(e) => {
                        setListId(e.target.value);
                        setGoalId("");
                      }}
                    >
                      <option value={options.inboxId}>Inbox (unsorted)</option>
                      {options.streams.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="space-y-1.5">
                  <label htmlFor={`${titleId}-goal`} className={labelCls}>
                    Goal
                  </label>
                  <select
                    id={`${titleId}-goal`}
                    className={field}
                    value={goalId}
                    onChange={(e) => setGoalId(e.target.value)}
                    disabled={goals.length === 0}
                  >
                    <option value="">{goals.length === 0 ? "None" : "No goal"}</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.title}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1.5">
                  <label htmlFor={`${titleId}-est`} className={labelCls}>
                    Estimate
                  </label>
                  <div className="relative">
                    <input
                      id={`${titleId}-est`}
                      type="number"
                      min={1}
                      max={1440}
                      className={`${field} pr-12`}
                      placeholder="30"
                      value={estimate}
                      onChange={(e) => setEstimate(e.target.value)}
                    />
                    <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted">
                      min
                    </span>
                  </div>
                </div>
                {!editing && templates.length > 0 && (
                  <div className="space-y-1.5">
                    <label htmlFor={`${titleId}-tmpl`} className={labelCls}>
                      Template
                    </label>
                    <select
                      id={`${titleId}-tmpl`}
                      className={field}
                      value={templateId}
                      onChange={(e) => setTemplateId(e.target.value)}
                    >
                      <option value="">None</option>
                      {templates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="border-t border-line-soft pt-4 space-y-3">
                <p className={labelCls}>Schedule</p>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["none", "Once"],
                      ["days", "Weekly"],
                      ["every", "After done"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      className={chip(repeat === id)}
                      aria-pressed={repeat === id}
                      onClick={() => touch(setRepeat)(id)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                {repeat === "none" && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="space-y-1.5">
                        <label className={labelCls}>Date</label>
                        <input
                          type="date"
                          className={field}
                          value={date}
                          onChange={(e) => setDate(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>Time</label>
                        <input
                          type="time"
                          className={field}
                          value={time}
                          disabled={!date}
                          onChange={(e) => setTime(e.target.value)}
                        />
                      </div>
                    </div>
                    {date ? (
                      <button
                        type="button"
                        className="text-xs text-muted hover:text-ink"
                        onClick={() => {
                          setDate("");
                          setTime("");
                        }}
                      >
                        Clear date
                      </button>
                    ) : (
                      <p className="text-xs text-muted">No date: it waits in the backlog.</p>
                    )}
                  </div>
                )}

                {repeat === "days" && (
                  <div className="space-y-3">
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAYS.map((w) => {
                        const on = days.includes(w.day);
                        return (
                          <button
                            key={w.day}
                            type="button"
                            className={chip(on)}
                            aria-pressed={on}
                            aria-label={format(new Date(2024, 0, 7 + w.day), "EEEE")}
                            onClick={() =>
                              touch(setDays)(on ? days.filter((d) => d !== w.day) : [...days, w.day])
                            }
                          >
                            {w.label}
                          </button>
                        );
                      })}
                      <button
                        type="button"
                        className="text-xs font-medium text-muted hover:text-ink"
                        onClick={() => touch(setDays)(ALL_DAYS)}
                      >
                        Every day
                      </button>
                    </div>

                    <div className="space-y-1.5">
                      <p className={labelCls}>How firm</p>
                      <div
                        className="grid grid-cols-3 overflow-hidden rounded-[10px] border border-line bg-white"
                        role="group"
                        aria-label="How firm"
                      >
                        {STRICTNESS.map((s) => {
                          const on = strictness === s.id;
                          return (
                            <button
                              key={s.id}
                              type="button"
                              aria-pressed={on}
                              className={`flex min-h-[48px] flex-col items-center justify-center gap-0.5 px-1 py-2 text-center ${
                                on ? "bg-ink text-paper" : "text-ink hover:bg-paper-2/60"
                              }`}
                              onClick={() => touch(setStrictness)(s.id)}
                            >
                              <span className="text-xs font-semibold">{s.label}</span>
                              <span className={`text-[10px] ${on ? "text-paper/70" : "text-muted"}`}>
                                {s.hint}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {repeat === "every" && (
                  <div className="space-y-3">
                    <p className="rounded-[10px] bg-accent-wash px-3 py-2 text-[13px] text-ink/80">
                      Next due starts when you mark it done — not a fixed calendar day.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px]">Wait</span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        className={`${field} w-16`}
                        value={interval}
                        onChange={(e) => touch(setIntervalN)(Math.max(1, Number(e.target.value) || 1))}
                      />
                      <select
                        className={field}
                        style={{ width: "auto" }}
                        value={unit}
                        onChange={(e) => touch(setUnit)(e.target.value as typeof unit)}
                      >
                        <option value="daily">day(s)</option>
                        <option value="weekly">week(s)</option>
                        <option value="monthly">month(s)</option>
                      </select>
                      <span className="text-xs text-muted">after finishing</span>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelCls}>Next due</label>
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="date"
                          className={field}
                          value={nextDue}
                          onChange={(e) => touch(setNextDue)(e.target.value)}
                        />
                        {nextDue && (
                          <button
                            type="button"
                            className="text-xs text-muted hover:text-ink"
                            onClick={() => touch(setNextDue)("")}
                          >
                            Clear
                          </button>
                        )}
                      </div>
                      <p className="text-xs text-muted">
                        {nextDue
                          ? "Available from this date in Streams — stays off My Day until you pin or Pick 3 it."
                          : "Empty = available now in Streams (still off My Day until you pick it up)."}
                      </p>
                    </div>
                    <div className="space-y-1.5">
                      <p className={labelCls}>Months (empty = all year)</p>
                      <div className="flex flex-wrap gap-1.5">
                        {MONTHS.map((label, i) => {
                          const m = i + 1;
                          const on = months.includes(m);
                          return (
                            <button
                              key={m}
                              type="button"
                              className={chip(on)}
                              aria-pressed={on}
                              aria-label={format(new Date(2024, i, 1), "MMMM")}
                              onClick={() =>
                                touch(setMonths)(
                                  on
                                    ? months.filter((x) => x !== m)
                                    : [...months, m].sort((a, b) => a - b),
                                )
                              }
                            >
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {repeat !== "none" && (
                  <div className="space-y-1.5">
                    <label className={labelCls}>Preferred time</label>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        type="time"
                        className={`${field} max-w-[10rem]`}
                        value={repeatTime}
                        onChange={(e) => touch(setRepeatTime)(e.target.value)}
                      />
                      <span className="text-xs text-muted">optional</span>
                      {repeatTime && (
                        <button
                          type="button"
                          className="text-xs text-muted hover:text-ink"
                          onClick={() => touch(setRepeatTime)("")}
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[10px] bg-accent-soft px-3.5 py-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wide text-accent">
                  {repeat === "none" ? "Schedule" : repeat === "days" ? "Repeats" : "Will schedule"}
                </p>
                <p className="text-[13px] text-ink">{summary}</p>
              </div>

              {error && <p className="text-sm text-danger">{error}</p>}
            </>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-line-soft bg-sheet px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
          <button
            type="submit"
            disabled={saving || !loaded}
            className="flex h-[50px] w-full items-center justify-center rounded-xl bg-ink text-[15px] font-semibold text-paper disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : editing
                ? "Save changes"
                : mode.kind === "create" && mode.pinDate
                  ? "Add to My Day"
                  : "Add task"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex w-full items-center justify-center py-1 text-sm font-semibold text-muted"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );

  return createPortal(sheet, document.body);
}
