"use client";

import { useRef, useState } from "react";
import { clientApi } from "@/lib/client-api";

type Props = {
  taskId: string;
  title: string;
  className?: string;
  onRenamed?: (title: string) => void;
  onError?: (message: string) => void;
};

/**
 * Zero-chrome rename: the title itself is the control.
 * Desktop: click / Enter / F2. Mobile: tap (scroll does not fire click).
 * Save on form submit or blur — iOS keyboard Done only fires blur.
 * Escape cancels. Empty titles revert.
 */
export function TaskTitle({
  taskId,
  title,
  className = "",
  onRenamed,
  onError,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const openedAt = useRef(0);
  const skipBlur = useRef(false);

  function startEdit() {
    if (saving) return;
    skipBlur.current = false;
    openedAt.current = Date.now();
    setDraft(title);
    setEditing(true);
  }

  function cancel() {
    skipBlur.current = true;
    setDraft(title);
    setEditing(false);
  }

  async function commit() {
    skipBlur.current = true;
    const next = (inputRef.current?.value ?? draft).trim();
    setEditing(false);
    if (!next || next === title) {
      setDraft(title);
      return;
    }
    setSaving(true);
    onRenamed?.(next);
    try {
      await clientApi.updateTask(taskId, { title: next });
    } catch (e) {
      onRenamed?.(title);
      setDraft(title);
      onError?.(e instanceof Error ? e.message : "Could not rename");
    } finally {
      setSaving(false);
    }
  }

  const sharedClass = `m-0 block min-w-0 w-full appearance-none border-0 bg-transparent p-0 font-[inherit] text-[length:inherit] leading-[inherit] text-inherit ${className}`;

  if (editing) {
    return (
      <form
        className="m-0 min-w-0 w-full"
        onSubmit={(e) => {
          e.preventDefault();
          void commit();
        }}
      >
        <input
          ref={inputRef}
          type="text"
          name="task-title"
          value={draft}
          maxLength={500}
          aria-label="Task title"
          enterKeyHint="done"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          autoFocus
          disabled={saving}
          className={`${sharedClass} cursor-text rounded-none outline-none shadow-[inset_0_-1px_0_var(--accent)]`}
          onChange={(e) => setDraft(e.target.value)}
          onFocus={(e) => {
            const el = e.currentTarget;
            el.scrollIntoView({ block: "nearest", inline: "nearest" });
            if (window.matchMedia("(pointer: coarse)").matches) {
              const end = el.value.length;
              el.setSelectionRange(end, end);
            } else {
              el.select();
            }
          }}
          onBlur={() => {
            if (skipBlur.current) return;
            if (Date.now() - openedAt.current < 200) {
              inputRef.current?.focus();
              return;
            }
            void commit();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
      </form>
    );
  }

  return (
    <button
      type="button"
      aria-label={`Rename ${title}`}
      title="Rename"
      disabled={saving}
      className={`${sharedClass} cursor-text rounded-sm text-left hover:underline hover:decoration-line hover:underline-offset-2 [@media(hover:none)]:hover:no-underline`}
      onClick={startEdit}
      onKeyDown={(e) => {
        if (e.key === "F2") {
          e.preventDefault();
          startEdit();
        }
      }}
    >
      {title}
    </button>
  );
}
