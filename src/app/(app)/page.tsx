"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { TaskTitle } from "@/components/TaskTitle";
import {
  clientApi,
  type FlexTask,
  type Suggestion,
  type TimelineItem,
} from "@/lib/client-api";

function timeLabel(iso?: string | null) {
  if (!iso) return null;
  return format(new Date(iso), "h:mm a");
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
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [skipFor, setSkipFor] = useState<string | null>(null);

  async function reload() {
    setLoading(true);
    setError(null);
    try {
      const data = await clientApi.myDay(date);
      setTimeline(data.timeline);
      setSuggestions(data.suggestions);
      setFlexAvailable(data.flexAvailable);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, [date]);

  async function completeOccurrence(taskId: string, occurrenceId: string) {
    await clientApi.completeTask(taskId, occurrenceId);
    await reload();
  }

  async function completeFlex(taskId: string) {
    await clientApi.completeTask(taskId);
    await reload();
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
    await clientApi.patchMyDay({
      date,
      pin: { refType: "flex", refId: taskId, pinned },
    });
    await reload();
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
  }

  function modeLabel(mode: string) {
    if (mode === "habit") return "Habit";
    if (mode === "rolling") return "Rolling due";
    return "Calendar";
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
              Empty day. Pin from Inbox, or wait for today’s habits / dues.
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
                    </div>
                    <div className="flex flex-wrap gap-2">
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
                        <div className="flex flex-wrap gap-2">
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

            return (
              <article
                key={`flex-${item.id}`}
                className="border-l-4 border-line bg-paper-2/80 px-4 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                      From Inbox
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
                  </div>
                  <div className="flex gap-2">
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
                  </div>
                </div>
              </article>
            );
          })}
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
                      </div>
                      <button
                        type="button"
                        className="rounded border border-accent px-2 py-1 text-sm text-accent"
                        onClick={() => pinFlex(t.id, true)}
                      >
                        Add to My Day
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ),
          )}
        </section>
      )}

      {unpinnedFlex.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
            From Inbox
          </h2>
          <ul className="space-y-2">
            {unpinnedFlex.slice(0, 12).map((t) => (
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
                </div>
                <button
                  type="button"
                  className="shrink-0 text-sm font-medium text-accent"
                  onClick={() => pinFlex(t.id, true)}
                >
                  Pin
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
