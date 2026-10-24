"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { TaskTitle } from "@/components/TaskTitle";
import { TrashButton } from "@/components/TrashButton";
import { TaskChecklist } from "@/components/TaskChecklist";
import { StreamDots, guessStream, type StreamOption } from "@/components/StreamDots";
import { TaskEditor } from "@/components/TaskEditor";
import {
  clientApi,
  type StreamCard,
  type StreamPick,
  type StreamTask,
  type StreamsBoard,
} from "@/lib/client-api";

const STATUS_LABEL: Record<StreamCard["status"], string> = {
  needs_you: "Needs you",
  drifting: "Drifting",
  on_track: "On track",
};

const COLLAPSED_TASKS = 3;

function pct(n: number) {
  return `${Math.round(n)}%`;
}

type Creating = { key: string; listId?: string; goalId?: string | null; title?: string };

function EditButton({ onClick, active }: { onClick: () => void; active: boolean }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={active ? "Close editor" : "Edit task"}
      aria-expanded={active}
      title="Edit: stream, goal, date, repeat"
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line/40 hover:text-ink"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 20h4L19 9l-4-4L4 16v4z" />
        <path d="M13.5 6.5l4 4" />
      </svg>
    </button>
  );
}

function taskMeta(t: StreamTask) {
  const parts: string[] = [];
  if (t.repeatMode) parts.push(`repeats · ${t.repeatMode}`);
  if (t.repeatMode === "rolling") {
    if (t.rollingDue) parts.push("ready");
    else if (t.nextDueAt) parts.push(`next ${format(new Date(t.nextDueAt), "MMM d")}`);
  }
  if (t.estimatedMinutes) parts.push(`${t.estimatedMinutes}m`);
  if (t.dueAt) parts.push(format(new Date(t.dueAt), "MMM d"));
  return parts.join(" · ");
}

export default function StreamsPage() {
  const date = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);
  const [board, setBoard] = useState<StreamsBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [picks, setPicks] = useState<StreamPick[] | null>(null);
  const [picking, setPicking] = useState(false);
  const [selected, setSelected] = useState(0);
  const [capture, setCapture] = useState("");
  const [newStream, setNewStream] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [checklistId, setChecklistId] = useState<string | null>(null);
  const [creating, setCreating] = useState<Creating | null>(null);
  const weightTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const reload = useCallback(
    async (quiet = false) => {
      if (!quiet) setLoading(true);
      setError(null);
      try {
        setBoard(await clientApi.streams(date));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [date],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    }
  }

  // Dots keep a stable order (the order streams were created), not pressure order,
  // so number keys always mean the same stream.
  const options: StreamOption[] = useMemo(
    () =>
      [...(board?.streams ?? [])]
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({ id: s.id, name: s.name, color: s.color })),
    [board],
  );

  const vocab = useMemo(
    () =>
      (board?.streams ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        color: s.color,
        titles: s.tasks.map((t) => t.title),
      })),
    [board],
  );

  const inboxTasks = useMemo(() => board?.inbox.tasks ?? [], [board]);
  // Filing a task shrinks the lane; keep the selection on a real row.
  const selectedRow = Math.max(0, Math.min(selected, inboxTasks.length - 1));

  const moveTo = useCallback(
    async (taskId: string, listId: string) => {
      setBoard((prev) => {
        if (!prev) return prev;
        const task = [prev.inbox, ...prev.streams]
          .flatMap((l) => l.tasks)
          .find((t) => t.id === taskId);
        if (!task) return prev;
        const moved = { ...task, goalId: null };
        const strip = (tasks: StreamTask[]) => tasks.filter((t) => t.id !== taskId);
        return {
          ...prev,
          inbox: {
            ...prev.inbox,
            tasks:
              listId === prev.inbox.id ? [moved, ...strip(prev.inbox.tasks)] : strip(prev.inbox.tasks),
          },
          streams: prev.streams.map((s) => ({
            ...s,
            tasks: s.id === listId ? [...strip(s.tasks), moved] : strip(s.tasks),
          })),
        };
      });
      await run(() => clientApi.updateTask(taskId, { listId }), "Could not move");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // 1–9 files the selected Inbox task; j/k or arrows move the selection.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || inboxTasks.length === 0) return;
      if (e.key === "j" || e.key === "ArrowDown") {
        setSelected(Math.min(inboxTasks.length - 1, selectedRow + 1));
        e.preventDefault();
      } else if (e.key === "k" || e.key === "ArrowUp") {
        setSelected(Math.max(0, selectedRow - 1));
        e.preventDefault();
      } else if (/^[1-9]$/.test(e.key)) {
        const stream = options[Number(e.key) - 1];
        const task = inboxTasks[selectedRow];
        if (stream && task) {
          e.preventDefault();
          void moveTo(task.id, stream.id);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inboxTasks, options, selectedRow, moveTo]);

  async function pickThree() {
    setPicking(true);
    setError(null);
    try {
      const result = await clientApi.pickForToday({ date });
      setPicks(result.picks);
      await reload(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pick");
    } finally {
      setPicking(false);
    }
  }

  async function addCapture(e: React.FormEvent) {
    e.preventDefault();
    const title = capture.trim();
    if (!title) return;
    await run(async () => {
      await clientApi.createTask({ title, kind: "flex" });
      setCapture("");
    }, "Could not add");
  }

  async function addStream(e: React.FormEvent) {
    e.preventDefault();
    const name = newStream.trim();
    if (!name) return;
    await run(async () => {
      await clientApi.createStream({ name });
      setNewStream("");
    }, "Could not add stream");
  }

  function setWeight(stream: StreamCard, weight: number) {
    setBoard((prev) =>
      prev
        ? { ...prev, streams: prev.streams.map((s) => (s.id === stream.id ? { ...s, weight } : s)) }
        : prev,
    );
    clearTimeout(weightTimers.current[stream.id]);
    weightTimers.current[stream.id] = setTimeout(() => {
      void run(() => clientApi.updateStream(stream.id, { weight }), "Could not save importance");
    }, 400);
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applyRename(taskId: string, title: string) {
    setBoard((prev) => {
      if (!prev) return prev;
      const rename = (tasks: StreamTask[]) =>
        tasks.map((t) => (t.id === taskId ? { ...t, title } : t));
      return {
        ...prev,
        inbox: { ...prev.inbox, tasks: rename(prev.inbox.tasks) },
        streams: prev.streams.map((s) => ({ ...s, tasks: rename(s.tasks) })),
      };
    });
  }

  if (loading && !board) return <p className="text-muted">Loading…</p>;

  const streams = board?.streams ?? [];
  const totalWeight = streams.reduce((a, s) => a + s.weight, 0) || 1;
  const byOrder = [...streams].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Streams</h1>
          <p className="text-sm text-muted">
            Last {board?.windowDays ?? 7} days · what you want each stream to get vs what it got
          </p>
        </div>
        {streams.length > 0 && (
          <button
            type="button"
            onClick={pickThree}
            disabled={picking}
            className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
          >
            {picking ? "Picking…" : "Pick 3 for today"}
          </button>
        )}
      </div>

      {error && (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {picks && (
        <div className="border border-accent/40 bg-accent-soft/40 px-4 py-3 text-sm">
          {picks.length === 0 ? (
            <p>Nothing left to suggest. Add tasks to a stream first.</p>
          ) : (
            <>
              <p className="font-medium">Suggested for today — keep or swap them in My Day:</p>
              <ul className="mt-1 space-y-0.5">
                {picks.map((p) => (
                  <li key={p.taskId}>
                    <span className="font-medium">{p.title}</span>{" "}
                    <span className="text-muted">
                      · {p.streamName} · {p.reason}
                    </span>
                  </li>
                ))}
              </ul>
              <Link href="/" className="mt-1 inline-block font-medium text-accent">
                Open My Day →
              </Link>
            </>
          )}
        </div>
      )}

      {streams.length > 0 && (
        <section aria-label="Balance" className="space-y-1">
          {board && board.totalMinutes > 0 ? (
            <div className="flex h-3 overflow-hidden rounded" title="What each stream got">
              {byOrder.map((s) =>
                s.actualPct > 0 ? (
                  <div
                    key={s.id}
                    style={{ width: `${s.actualPct}%`, backgroundColor: s.color }}
                    title={`${s.name}: got ${pct(s.actualPct)}`}
                  />
                ) : null,
              )}
            </div>
          ) : (
            <div className="flex h-3 items-center rounded bg-paper-2 px-2 text-[10px] text-muted">
              Nothing finished in a stream this week yet
            </div>
          )}
          <div className="flex h-1 overflow-hidden rounded opacity-60" title="What you want each stream to get">
            {byOrder.map((s) => (
              <div key={s.id} style={{ width: `${(s.weight / totalWeight) * 100}%`, backgroundColor: s.color }} />
            ))}
          </div>
          <p className="text-xs text-muted">Thick bar: what each stream got · thin bar: what you want</p>
        </section>
      )}

      {/* Inbox lane */}
      <section className="space-y-3 border border-line bg-paper/70 p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Inbox{" "}
            <span className="font-[family-name:var(--font-body)] text-sm font-normal text-muted">
              {inboxTasks.length === 0 ? "· all sorted" : `· ${inboxTasks.length} to sort`}
            </span>
          </h2>
          <Link href="/inbox" className="text-sm text-locked">
            Trash and full Inbox →
          </Link>
        </div>
        <form onSubmit={addCapture} className="flex gap-2">
          <input
            className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2"
            placeholder={streams.length > 0 ? "Capture… add #kids to file it" : "Capture a task…"}
            value={capture}
            maxLength={500}
            autoComplete="off"
            onChange={(e) => setCapture(e.target.value)}
          />
          <button
            type="submit"
            disabled={!capture.trim()}
            className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
          >
            Add
          </button>
          <button
            type="button"
            onClick={() => setCreating({ key: "inbox", title: capture })}
            className="rounded border border-line px-3 py-2 text-sm"
            title="Stream, goal, date or repeat"
          >
            Details
          </button>
        </form>
        {creating?.key === "inbox" && (
          <TaskEditor
            mode={{ kind: "create", title: creating.title }}
            onCancel={() => setCreating(null)}
            onDone={() => {
              setCreating(null);
              setCapture("");
              void reload(true);
            }}
          />
        )}
        {inboxTasks.length > 0 && (
          <ul className="divide-y divide-line/60">
            {inboxTasks.map((t, i) => {
              const isSel = i === selectedRow && options.length > 0;
              return (
                <li
                  key={t.id}
                  onClick={() => setSelected(i)}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2 pl-2 ${
                    isSel ? "border-l-2 border-ink bg-paper-2/60" : "border-l-2 border-transparent"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <TaskTitle
                      taskId={t.id}
                      title={t.title}
                      onRenamed={(next) => applyRename(t.id, next)}
                      onError={setError}
                    />
                    {taskMeta(t) && <p className="text-xs text-muted">{taskMeta(t)}</p>}
                  </div>
                  <StreamDots
                    streams={options}
                    suggestedId={guessStream(t.title, vocab)}
                    showKeys={isSel}
                    onPick={(id) => moveTo(t.id, id)}
                  />
                  <EditButton
                    active={editingId === t.id}
                    onClick={() => setEditingId(editingId === t.id ? null : t.id)}
                  />
                  {editingId === t.id && (
                    <TaskEditor
                      mode={{ kind: "edit", taskId: t.id }}
                      onCancel={() => setEditingId(null)}
                      onDone={() => {
                        setEditingId(null);
                        void reload(true);
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {inboxTasks.length > 0 && options.length > 0 && (
          <p className="hidden text-xs text-muted sm:block">
            Keys: j/k to move, 1–{Math.min(9, options.length)} to file the selected task.
          </p>
        )}
      </section>

      {streams.length === 0 ? (
        <section className="space-y-3 border border-line bg-paper/70 p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Set up your streams
          </h2>
          <p className="text-sm text-muted">
            Streams are the parts of life you want to keep in balance. Start with these, then rename,
            recolor or archive them any time.
          </p>
          <button
            type="button"
            className="rounded bg-ink px-4 py-2 text-sm text-paper"
            onClick={() => run(() => clientApi.createStream({ presets: true }), "Could not set up")}
          >
            Add Kids, Health, House, Work and App
          </button>
        </section>
      ) : (
        <section className="space-y-3">
          {streams.map((s, i) => (
            <StreamLane
              key={s.id}
              stream={s}
              top={i === 0 && s.status === "needs_you"}
              expanded={expanded.has(s.id)}
              onToggle={() => toggle(s.id)}
              options={options}
              colors={board?.colors ?? []}
              totalWeight={totalWeight}
              hasActivity={(board?.totalMinutes ?? 0) > 0}
              date={date}
              run={run}
              moveTo={moveTo}
              setWeight={(w) => setWeight(s, w)}
              onRenamed={applyRename}
              onError={setError}
              editingId={editingId}
              setEditingId={setEditingId}
              checklistId={checklistId}
              setChecklistId={setChecklistId}
              creating={creating?.key === s.id ? creating : null}
              setCreating={setCreating}
              reload={() => reload(true)}
            />
          ))}
        </section>
      )}

      <form onSubmit={addStream} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2 text-sm"
          placeholder="New stream (e.g. Friends)"
          value={newStream}
          maxLength={60}
          onChange={(e) => setNewStream(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newStream.trim()}
          className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
        >
          Add stream
        </button>
      </form>
      {streams.length > 7 && (
        <p className="text-xs text-hard">
          {streams.length} streams is a lot to balance. Consider merging or archiving some.
        </p>
      )}
    </div>
  );
}

type LaneProps = {
  stream: StreamCard;
  top: boolean;
  expanded: boolean;
  onToggle: () => void;
  options: StreamOption[];
  colors: string[];
  totalWeight: number;
  hasActivity: boolean;
  date: string;
  run: (action: () => Promise<unknown>, fallback: string) => Promise<void>;
  moveTo: (taskId: string, listId: string) => Promise<void>;
  setWeight: (weight: number) => void;
  onRenamed: (taskId: string, title: string) => void;
  onError: (msg: string | null) => void;
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  checklistId: string | null;
  setChecklistId: (id: string | null) => void;
  creating: Creating | null;
  setCreating: (c: Creating | null) => void;
  reload: () => Promise<void>;
};

function StreamLane({
  stream: s,
  top,
  expanded,
  onToggle,
  options,
  colors,
  totalWeight,
  hasActivity,
  date,
  run,
  moveTo,
  setWeight,
  onRenamed,
  onError,
  editingId,
  setEditingId,
  checklistId,
  setChecklistId,
  creating,
  setCreating,
  reload,
}: LaneProps) {
  const [newTask, setNewTask] = useState("");
  const [newTaskGoal, setNewTaskGoal] = useState("");
  const [newGoal, setNewGoal] = useState("");
  const [name, setName] = useState(s.name);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const targetPct = (s.weight / totalWeight) * 100;
  const pressureWidth = Math.min(100, (s.pressure / 60) * 100);
  const next = s.tasks.slice(0, COLLAPSED_TASKS);
  const goalTitle = new Map(s.goals.map((g) => [g.id, g.title]));

  function canPin(t: StreamTask) {
    return t.kind === "flex" || t.repeatMode === "rolling";
  }

  async function pin(t: StreamTask) {
    if (!canPin(t)) return;
    await run(
      () => clientApi.patchMyDay({ date, pin: { refType: "flex", refId: t.id, pinned: !t.pinnedToday } }),
      "Could not pin",
    );
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    const title = newTask.trim();
    if (!title) return;
    await run(async () => {
      await clientApi.createTask({
        title,
        kind: "flex",
        listId: s.id,
        ...(newTaskGoal ? { goalId: newTaskGoal } : {}),
      });
      setNewTask("");
    }, "Could not add");
  }

  async function addGoal(e: React.FormEvent) {
    e.preventDefault();
    const title = newGoal.trim();
    if (!title) return;
    await run(async () => {
      await clientApi.createGoal(s.id, title);
      setNewGoal("");
    }, "Could not add goal");
  }

  function moveToTop(t: StreamTask) {
    const min = Math.min(...s.tasks.map((x) => x.sortOrder));
    void run(() => clientApi.updateTask(t.id, { sortOrder: min - 1 }), "Could not reorder");
  }

  const row = (t: StreamTask, full: boolean) => (
    <li key={t.id} className="flex flex-wrap items-center gap-2 py-1.5">
      <button
        type="button"
        onClick={() => pin(t)}
        disabled={!canPin(t)}
        title={
          !canPin(t)
            ? "Habits and fixed repeats show on My Day on their schedule"
            : t.pinnedToday
              ? "Remove from My Day"
              : t.repeatMode === "rolling"
                ? "Add to My Day (rolling stays off until you pick it up)"
                : "Add to My Day"
        }
        aria-label={t.pinnedToday ? "Remove from My Day" : "Add to My Day"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded hover:bg-line/40 disabled:opacity-30"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill={t.pinnedToday ? s.color : "none"} stroke={s.color} strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
      <div className="min-w-0 flex-1">
        <TaskTitle
          taskId={t.id}
          title={t.title}
          className={t.pinnedToday ? "text-muted" : ""}
          onRenamed={(title) => onRenamed(t.id, title)}
          onError={onError}
        />
        {(taskMeta(t) || (!full && t.goalId)) && (
          <p className="text-xs text-muted">
            {[!full && t.goalId ? goalTitle.get(t.goalId) : null, taskMeta(t)].filter(Boolean).join(" · ")}
          </p>
        )}
      </div>
      {full && (
        <div className="flex flex-wrap items-center gap-1">
          {s.goals.length > 0 && (
            <select
              aria-label="Goal"
              className="max-w-36 rounded border border-line bg-paper px-1 py-0.5 text-xs"
              value={t.goalId ?? ""}
              onChange={(e) =>
                run(() => clientApi.updateTask(t.id, { goalId: e.target.value || null }), "Could not set goal")
              }
            >
              <option value="">No goal</option>
              {s.goals.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={() => moveToTop(t)} className="rounded px-1.5 py-0.5 text-xs text-muted hover:bg-line/40" title="Move to top of this stream">
            ↑ Top
          </button>
          <StreamDots
            streams={options.filter((o) => o.id !== s.id)}
            onPick={(id) => moveTo(t.id, id)}
          />
          {t.kind === "flex" && (
            <button
              type="button"
              className="rounded px-1.5 py-0.5 text-xs text-accent hover:bg-accent-soft/60"
              onClick={() => run(() => clientApi.completeTask(t.id), "Could not complete")}
            >
              Done
            </button>
          )}
          <TrashButton onClick={() => run(() => clientApi.trashTask(t.id), "Could not trash")} />
        </div>
      )}
      <EditButton
        active={editingId === t.id}
        onClick={() => setEditingId(editingId === t.id ? null : t.id)}
      />
      {full && t.templateId && (
        <button
          type="button"
          onClick={() => setChecklistId(checklistId === t.id ? null : t.id)}
          aria-label={checklistId === t.id ? "Hide checklist" : "Show checklist"}
          aria-expanded={checklistId === t.id}
          title="Checklist"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted hover:bg-line/40 hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            className="h-4 w-4"
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
      )}
      {editingId === t.id && (
        <TaskEditor
          mode={{ kind: "edit", taskId: t.id }}
          onCancel={() => setEditingId(null)}
          onDone={() => {
            setEditingId(null);
            void reload();
          }}
        />
      )}
      {checklistId === t.id && (
        <div className="basis-full border-t border-line/60 pt-2 mt-2">
          <TaskChecklist taskId={t.id} templateId={t.templateId} onError={onError} />
        </div>
      )}
    </li>
  );

  const ungrouped = s.tasks.filter((t) => !t.goalId || !goalTitle.has(t.goalId));

  return (
    <article
      className="border bg-paper/70 px-4 py-3"
      style={{ borderColor: top ? s.color : "var(--line)", borderWidth: top ? 2 : 1 }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 text-left"
      >
        <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: s.color }} aria-hidden />
        <span className="font-[family-name:var(--font-display)] text-lg font-semibold">{s.name}</span>
        <span className="text-xs text-muted">
          want {pct(targetPct)} · got {hasActivity ? pct(s.actualPct) : "—"}
        </span>
        {s.daysQuiet >= 5 && (
          <span className="rounded bg-hard-soft/70 px-1.5 py-0.5 text-xs font-medium text-hard">
            {s.daysQuiet}d quiet
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          {STATUS_LABEL[s.status]}
          <span aria-hidden>{expanded ? "▴" : "▾"}</span>
        </span>
      </button>

      <div className="mt-2 h-1.5 overflow-hidden rounded bg-paper-2" title={`Pressure ${Math.round(s.pressure)}`}>
        <div className="h-full" style={{ width: `${pressureWidth}%`, backgroundColor: s.color }} />
      </div>

      {!expanded && (
        <>
          {next.length > 0 ? (
            <ul className="mt-2">{next.map((t) => row(t, false))}</ul>
          ) : (
            <p className="mt-2 text-sm text-muted">Nothing queued. Open the stream to add a task.</p>
          )}
          {s.tasks.length > next.length && (
            <button type="button" onClick={onToggle} className="mt-1 text-xs text-muted hover:text-ink">
              +{s.tasks.length - next.length} more
            </button>
          )}
        </>
      )}

      {expanded && (
        <div className="mt-3 space-y-4">
          {s.goals.map((g) => {
            const tasks = s.tasks.filter((t) => t.goalId === g.id);
            return (
              <div key={g.id}>
                <div className="flex items-center justify-between gap-2 border-b border-line/60 pb-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted">{g.title}</p>
                  <button
                    type="button"
                    className="text-xs text-muted hover:text-danger"
                    onClick={() => run(() => clientApi.updateGoal(g.id, { archived: true }), "Could not archive goal")}
                  >
                    Archive goal
                  </button>
                </div>
                {tasks.length > 0 ? (
                  <ul>{tasks.map((t) => row(t, true))}</ul>
                ) : (
                  <p className="py-1.5 text-xs text-muted">No tasks for this goal yet.</p>
                )}
              </div>
            );
          })}
          {(ungrouped.length > 0 || s.goals.length === 0) && (
            <div>
              {s.goals.length > 0 && (
                <p className="border-b border-line/60 pb-1 text-xs font-semibold uppercase tracking-wide text-muted">
                  No goal
                </p>
              )}
              {ungrouped.length > 0 ? (
                <ul>{ungrouped.map((t) => row(t, true))}</ul>
              ) : (
                <p className="py-1.5 text-xs text-muted">No tasks yet.</p>
              )}
            </div>
          )}

          <form onSubmit={addTask} className="flex flex-wrap gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-1.5 text-sm"
              placeholder={`Add to ${s.name}…`}
              value={newTask}
              maxLength={500}
              onChange={(e) => setNewTask(e.target.value)}
            />
            {s.goals.length > 0 && (
              <select
                aria-label="Goal for new task"
                className="rounded border border-line bg-paper px-2 py-1.5 text-sm"
                value={newTaskGoal}
                onChange={(e) => setNewTaskGoal(e.target.value)}
              >
                <option value="">No goal</option>
                {s.goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" disabled={!newTask.trim()} className="rounded bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50">
              Add
            </button>
            <button
              type="button"
              onClick={() => setCreating({ key: s.id, listId: s.id, goalId: newTaskGoal || null, title: newTask })}
              className="rounded border border-line px-3 py-1.5 text-sm"
              title="Date or repeat"
            >
              Details
            </button>
          </form>
          {creating && (
            <TaskEditor
              mode={{ kind: "create", listId: creating.listId, goalId: creating.goalId, title: creating.title }}
              onCancel={() => setCreating(null)}
              onDone={() => {
                setCreating(null);
                setNewTask("");
                void reload();
              }}
            />
          )}

          <form onSubmit={addGoal} className="flex gap-2">
            <input
              className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-1.5 text-sm"
              placeholder="New goal (e.g. Fix back problem)"
              value={newGoal}
              maxLength={200}
              onChange={(e) => setNewGoal(e.target.value)}
            />
            <button type="submit" disabled={!newGoal.trim()} className="rounded border border-line px-3 py-1.5 text-sm disabled:opacity-50">
              Add goal
            </button>
          </form>

          <div className="space-y-3 border-t border-line/60 pt-3 text-sm">
            <label className="flex items-center gap-3">
              <span className="w-24 text-muted">Importance</span>
              <input
                type="range"
                min={0}
                max={50}
                step={1}
                value={s.weight}
                onChange={(e) => setWeight(Number(e.target.value))}
                className="flex-1"
                style={{ accentColor: s.color }}
              />
              <span className="w-12 text-right tabular-nums">{pct(targetPct)}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3">
              <span className="w-24 text-muted">Color</span>
              <div className="flex gap-1">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Color ${c}`}
                    aria-pressed={c === s.color}
                    onClick={() => run(() => clientApi.updateStream(s.id, { color: c }), "Could not recolor")}
                    className="h-6 w-6 rounded-full"
                    style={{ backgroundColor: c, boxShadow: c === s.color ? `0 0 0 2px var(--paper), 0 0 0 4px ${c}` : undefined }}
                  />
                ))}
              </div>
            </div>
            <form
              className="flex flex-wrap items-center gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                const trimmed = name.trim();
                if (trimmed && trimmed !== s.name) {
                  void run(() => clientApi.updateStream(s.id, { name: trimmed }), "Could not rename");
                }
              }}
            >
              <span className="w-24 text-muted">Name</span>
              <input
                className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1"
                value={name}
                maxLength={60}
                onChange={(e) => setName(e.target.value)}
              />
              <button type="submit" disabled={!name.trim() || name.trim() === s.name} className="rounded border border-line px-3 py-1 disabled:opacity-50">
                Rename
              </button>
            </form>
            <div className="flex flex-wrap items-center gap-3">
              {confirmArchive ? (
                <>
                  <span className="text-muted">
                    Archive {s.name}? Its open tasks go back to the Inbox.
                  </span>
                  <button
                    type="button"
                    className="rounded border border-danger px-3 py-1 text-danger"
                    onClick={() => run(() => clientApi.updateStream(s.id, { archived: true }), "Could not archive")}
                  >
                    Archive
                  </button>
                  <button type="button" className="text-muted" onClick={() => setConfirmArchive(false)}>
                    Cancel
                  </button>
                </>
              ) : (
                <button type="button" className="text-muted hover:text-danger" onClick={() => setConfirmArchive(true)}>
                  Archive stream…
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
