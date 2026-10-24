"use client";

import { useEffect, useState } from "react";
import { TrashButton } from "./TrashButton";
import { clientApi, type ChecklistItem } from "@/lib/client-api";

type Props = {
  taskId: string;
  templateId: string | null;
  onError: (msg: string) => void;
};

export function TaskChecklist({ taskId, templateId, onError }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newItem, setNewItem] = useState("");
  const [editingTitle, setEditingTitle] = useState<Record<string, string>>({});

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  async function load() {
    try {
      const { items: data } = await clientApi.getTaskChecklist(taskId);
      setItems(data);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not load checklist");
    } finally {
      setLoading(false);
    }
  }

  async function toggleCheck(item: ChecklistItem) {
    try {
      const updated = await clientApi.updateChecklistItem(taskId, item.id, { checked: !item.checked });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated.item : i)));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update item");
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const title = newItem.trim();
    if (!title) return;
    try {
      const { item } = await clientApi.addChecklistItem(taskId, title);
      setItems((prev) => [...prev, item]);
      setNewItem("");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not add item");
    }
  }

  async function saveTitle(item: ChecklistItem) {
    const title = (editingTitle[item.id] ?? "").trim();
    if (!title || title === item.title) {
      setEditingTitle((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    try {
      const updated = await clientApi.updateChecklistItem(taskId, item.id, { title });
      setItems((prev) => prev.map((i) => (i.id === item.id ? updated.item : i)));
      setEditingTitle((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update item");
    }
  }

  async function deleteItem(itemId: string) {
    try {
      await clientApi.deleteChecklistItem(taskId, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not delete item");
    }
  }

  async function updateTemplate() {
    try {
      await clientApi.updateTemplateFromTask(taskId);
      onError("Template updated!");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Could not update template");
    }
  }

  if (loading) return <p className="text-xs text-muted">Loading checklist…</p>;

  const checkedCount = items.filter((i) => i.checked).length;

  return (
    <div className="space-y-2">
      {items.length > 0 && (
        <p className="text-xs text-muted">
          {checkedCount}/{items.length} completed
        </p>
      )}
      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toggleCheck(item)}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-line hover:border-ink"
              aria-label={item.checked ? "Uncheck" : "Check"}
            >
              {item.checked && (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                  <path d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
            {editingTitle[item.id] !== undefined ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveTitle(item);
                }}
                className="flex flex-1 gap-2"
              >
                <input
                  className="flex-1 rounded border border-line bg-paper px-2 py-0.5 text-xs"
                  value={editingTitle[item.id]}
                  autoFocus
                  onChange={(e) =>
                    setEditingTitle((prev) => ({ ...prev, [item.id]: e.target.value }))
                  }
                  onBlur={() => saveTitle(item)}
                />
              </form>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setEditingTitle((prev) => ({ ...prev, [item.id]: item.title }))}
                  className={`flex-1 text-left text-xs hover:text-muted ${
                    item.checked ? "text-muted line-through" : ""
                  }`}
                >
                  {item.title}
                </button>
                <TrashButton onClick={() => deleteItem(item.id)} />
              </>
            )}
          </li>
        ))}
      </ul>
      <form onSubmit={addItem} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1 text-xs"
          placeholder="Add item…"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newItem.trim()}
          className="rounded border border-line px-2 py-1 text-xs disabled:opacity-50"
        >
          Add
        </button>
      </form>
      {templateId && (
        <button
          type="button"
          onClick={updateTemplate}
          className="text-xs text-muted hover:text-accent"
        >
          Save changes to template
        </button>
      )}
    </div>
  );
}
