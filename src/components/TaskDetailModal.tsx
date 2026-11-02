"use client";

import { useEffect, useState } from "react";
import { TaskEditor } from "./TaskEditor";
import { clientApi, type Task } from "@/lib/client-api";

type Props = {
  taskId: string;
  mode?: "view" | "edit";
  onClose: () => void;
  onUpdate?: () => void;
};

/**
 * Modal for viewing and editing task details.
 * View mode shows task info with clickable links in description.
 * Edit mode opens the full TaskEditor.
 */
export function TaskDetailModal({ taskId, mode: initialMode = "view", onClose, onUpdate }: Props) {
  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [task, setTask] = useState<Task & { listId: string; goalId: string | null } | null>(null);
  const [streamName, setStreamName] = useState<string>("");
  const [goalTitle, setGoalTitle] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const [taskData, options] = await Promise.all([
          clientApi.getTask(taskId),
          clientApi.streamOptions(),
        ]);
        if (!alive) return;
        setTask(taskData.task);
        
        // Get stream name
        const stream = options.streams.find((s) => s.id === taskData.task.listId);
        setStreamName(stream ? stream.name : "Inbox");
        
        // Get goal title
        if (taskData.task.goalId) {
          const goal = stream?.goals.find((g) => g.id === taskData.task.goalId);
          setGoalTitle(goal ? goal.title : "");
        }
        
        setLoading(false);
      } catch (e) {
        if (alive) {
          setError(e instanceof Error ? e.message : "Failed to load task");
          setLoading(false);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [taskId]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (mode === "edit") {
          setMode("view");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mode, onClose]);

  // Parse description for links
  function parseLinks(text: string) {
    if (!text) return null;
    
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    
    return parts.map((part, i) => {
      if (part.match(urlRegex)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent underline hover:text-accent/80"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  function formatDate(iso?: string | null) {
    if (!iso) return "No date";
    const d = new Date(iso);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    const time = d.getHours() === 0 && d.getMinutes() === 0 
      ? "" 
      : `, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
    
    if (isToday) return `Today${time}`;
    return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}${time}`;
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
        <div className="w-full max-w-lg rounded-lg border border-line bg-paper p-6 shadow-2xl">
          <p className="text-muted">Loading…</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40">
        <div className="w-full max-w-lg rounded-lg border border-line bg-paper p-6 shadow-2xl">
          <p className="text-danger">{error || "Task not found"}</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-4 rounded border border-line px-4 py-2"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line bg-paper shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {mode === "view" ? (
          <div className="space-y-5 p-6">
            {/* Header */}
            <div className="flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Task Details
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="rounded p-1 text-muted hover:bg-line/40 hover:text-ink"
                aria-label="Close"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Stream tag */}
            {streamName && (
              <div className="inline-flex items-center gap-2 rounded bg-accent-soft px-2 py-1 text-sm text-accent">
                <span className="h-2 w-2 rounded-full bg-accent" />
                {streamName}
              </div>
            )}

            {/* Title */}
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                Title
              </label>
              <div className="rounded border border-line bg-white px-3 py-2.5">
                <p className="text-base">{task.title}</p>
              </div>
            </div>

            {/* Description with parsed links */}
            {task.notes && (
              <div className="space-y-1">
                <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                  Description
                </label>
                <div className="rounded border border-line bg-white px-3 py-2.5">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {parseLinks(task.notes)}
                  </p>
                </div>
              </div>
            )}

            {/* Task info */}
            <div className="space-y-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-muted">
                Task Info
              </label>
              <div className="space-y-2 text-sm">
                {goalTitle && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Goal</span>
                    <span className="text-muted">{goalTitle}</span>
                  </div>
                )}
                {task.dueAt && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Due</span>
                    <span className="text-accent">{formatDate(task.dueAt)}</span>
                  </div>
                )}
                {task.estimatedMinutes && (
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Estimate</span>
                    <span className="text-muted">~{task.estimatedMinutes} min</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className="flex-1 rounded border border-line px-4 py-2.5 text-sm font-semibold hover:bg-line/20"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await clientApi.completeTask(taskId);
                    onUpdate?.();
                    onClose();
                  } catch (e) {
                    setError(e instanceof Error ? e.message : "Failed to complete task");
                  }
                }}
                className="flex-1 rounded bg-ink px-4 py-2.5 text-sm font-semibold text-paper hover:bg-ink/90"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">
                Edit Task
              </h2>
              <button
                type="button"
                onClick={() => setMode("view")}
                className="rounded p-1 text-muted hover:bg-line/40 hover:text-ink"
                aria-label="Back to view"
              >
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <TaskEditor
              mode={{ kind: "edit", taskId }}
              onCancel={() => setMode("view")}
              onDone={() => {
                onUpdate?.();
                onClose();
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
