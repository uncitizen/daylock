"use client";

import { useEffect, useState } from "react";
import { addMinutes, format, getDay } from "date-fns";
import { clientApi, type RecurrenceInput, type StreamOptions, type Task } from "@/lib/client-api";

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
  { day: 1, label: "M" },
  { day: 2, label: "T" },
  { day: 3, label: "W" },
  { day: 4, label: "T" },
  { day: 5, label: "F" },
  { day: 6, label: "S" },
  { day: 0, label: "S" },
];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

const STRICTNESS: { id: Strictness; label: string; hint: string }[] = [
  { id: "habit", label: "Habit", hint: "Skip freely, nothing owed" },
  { id: "soft", label: "Soft", hint: "Expires overnight" },
  { id: "hard", label: "Hard", hint: "Alarms until done" },
];

const field = "rounded border border-line bg-paper px-2 py-1";
const chip = (on: boolean) =>
  `h-8 min-w-8 rounded px-2 text-xs ${on ? "bg-ink text-paper" : "border border-line"}`;

function toLocalDate(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd");
}

function toLocalTime(iso: string) {
  const d = new Date(iso);
  return d.getHours() === 0 && d.getMinutes() === 0 ? "" : format(d, "HH:mm");
}

/**
 * One editor for every task: title, stream, goal, estimate, a one-off date or a
 * repeat schedule. Used to create tasks anywhere and to edit existing ones.
 */
export function TaskEditor({ mode, onDone, onCancel }: Props) {
  const editing = mode.kind === "edit";
  const [options, setOptions] = useState<StreamOptions | null>(null);
  const [loaded, setLoaded] = useState(!editing);
  const [title, setTitle] = useState(mode.kind === "create" ? (mode.title ?? "") : "");
  const [listId, setListId] = useState(mode.kind === "create" ? (mode.listId ?? "") : "");
  const [goalId, setGoalId] = useState(mode.kind === "create" ? (mode.goalId ?? "") : "");
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
    let alive = true;
    void (async () => {
      try {
        const opts = await clientApi.streamOptions();
        if (!alive) return;
        setOptions(opts);
        if (mode.kind === "create") {
          setListId((prev) => prev || opts.inboxId);
          return;
        }
        const { task } = await clientApi.getTask(mode.taskId);
        if (!alive) return;
        fillFromTask(task);
        setLoaded(true);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Could not load");
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
      if (mode.kind === "create") {
        await clientApi.createTask({
          title: trimmed,
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
      } else {
        await clientApi.updateTask(mode.taskId, {
          title: trimmed,
          listId,
          goalId: goalId || null,
          estimatedMinutes,
          dueAt,
          // Only rewrite the schedule when it was changed here.
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

  if (!loaded) {
    return (
      <div className="border border-line bg-paper p-3 text-sm text-muted">
        {error ?? "Loading…"}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="space-y-3 border border-line bg-paper p-3 text-sm">
      <input
        className={`${field} w-full py-2 text-base`}
        placeholder="Task"
        value={title}
        maxLength={500}
        autoFocus={!editing}
        onChange={(e) => setTitle(e.target.value)}
      />

      <div className="flex flex-wrap gap-3">
        {options && (
          <label className="flex items-center gap-2">
            Stream
            <select
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
          </label>
        )}
        {goals.length > 0 && (
          <label className="flex items-center gap-2">
            Goal
            <select className={field} value={goalId} onChange={(e) => setGoalId(e.target.value)}>
              <option value="">No goal</option>
              {goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">
          ~min
          <input
            type="number"
            min={1}
            max={1440}
            className={`${field} w-16`}
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </label>
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">
          When
        </legend>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["none", "Once"],
              ["days", "On days"],
              ["every", "Every N after done"],
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2">
              Date
              <input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="flex items-center gap-2">
              Time
              <input
                type="time"
                className={field}
                value={time}
                disabled={!date}
                onChange={(e) => setTime(e.target.value)}
              />
            </label>
            {date && (
              <button type="button" className="text-xs text-muted hover:text-ink" onClick={() => { setDate(""); setTime(""); }}>
                Clear
              </button>
            )}
            {!date && <span className="text-xs text-muted">No date: it waits in the backlog.</span>}
          </div>
        )}

        {repeat === "days" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1">
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
              <button type="button" className="ml-1 text-xs text-muted hover:text-ink" onClick={() => touch(setDays)(ALL_DAYS)}>
                Every day
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {STRICTNESS.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className={`${chip(strictness === s.id)} text-left`}
                  aria-pressed={strictness === s.id}
                  title={s.hint}
                  onClick={() => touch(setStrictness)(s.id)}
                >
                  {s.label}
                </button>
              ))}
              <span className="self-center text-xs text-muted">
                {STRICTNESS.find((s) => s.id === strictness)?.hint}
              </span>
            </div>
          </div>
        )}

        {repeat === "every" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              Every
              <input
                type="number"
                min={1}
                max={365}
                className={`${field} w-16`}
                value={interval}
                onChange={(e) => touch(setIntervalN)(Math.max(1, Number(e.target.value) || 1))}
              />
              <select className={field} value={unit} onChange={(e) => touch(setUnit)(e.target.value as typeof unit)}>
                <option value="daily">day(s)</option>
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
              </select>
              <span className="text-xs text-muted">counted from when you finish it</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2">
                Next due
                <input
                  type="date"
                  className={field}
                  value={nextDue}
                  onChange={(e) => touch(setNextDue)(e.target.value)}
                />
              </label>
              {nextDue && (
                <button
                  type="button"
                  className="text-xs text-muted hover:text-ink"
                  onClick={() => touch(setNextDue)("")}
                >
                  Clear
                </button>
              )}
              <span className="text-xs text-muted">
                {nextDue
                  ? "Available from this date in Streams — stays off My Day until you pin or Pick 3 it."
                  : "Empty = available now in Streams (still off My Day until you pick it up)."}
              </span>
            </div>
            <div>
              <p className="mb-1 text-xs text-muted">Only in these months (none = all year)</p>
              <div className="flex flex-wrap gap-1">
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
                        touch(setMonths)(on ? months.filter((x) => x !== m) : [...months, m].sort((a, b) => a - b))
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
          <label className="flex items-center gap-2">
            At
            <input type="time" className={field} value={repeatTime} onChange={(e) => touch(setRepeatTime)(e.target.value)} />
            <span className="text-xs text-muted">optional</span>
          </label>
        )}
      </fieldset>

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={saving} className="rounded bg-ink px-4 py-1.5 text-paper disabled:opacity-50">
          {saving ? "Saving…" : editing ? "Save" : "Add"}
        </button>
        <button type="button" onClick={onCancel} className="rounded border border-line px-4 py-1.5">
          Cancel
        </button>
      </div>
    </form>
  );
}
