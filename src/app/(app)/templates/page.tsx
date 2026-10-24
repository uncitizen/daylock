"use client";

import { useCallback, useEffect, useState } from "react";
import { TrashButton } from "@/components/TrashButton";
import { clientApi, type Template, type TemplateItem } from "@/lib/client-api";

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newItemTitle, setNewItemTitle] = useState<Record<string, string>>({});
  const [editingName, setEditingName] = useState<Record<string, string>>({});
  const [editingItemTitle, setEditingItemTitle] = useState<Record<string, string>>({});

  const reload = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError(null);
    try {
      const { templates: data } = await clientApi.getTemplates();
      setTemplates(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

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

  async function addTemplate(e: React.FormEvent) {
    e.preventDefault();
    const name = newTemplateName.trim();
    if (!name) return;
    await run(async () => {
      await clientApi.createTemplate({ name });
      setNewTemplateName("");
    }, "Could not create template");
  }

  async function addItem(templateId: string, e: React.FormEvent) {
    e.preventDefault();
    const title = (newItemTitle[templateId] ?? "").trim();
    if (!title) return;
    await run(async () => {
      await clientApi.addTemplateItem(templateId, title);
      setNewItemTitle((prev) => ({ ...prev, [templateId]: "" }));
    }, "Could not add item");
  }

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function saveTemplateName(template: Template) {
    const name = (editingName[template.id] ?? "").trim();
    if (!name || name === template.name) {
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[template.id];
        return next;
      });
      return;
    }
    await run(async () => {
      await clientApi.updateTemplate(template.id, { name });
      setEditingName((prev) => {
        const next = { ...prev };
        delete next[template.id];
        return next;
      });
    }, "Could not rename template");
  }

  async function saveItemTitle(templateId: string, item: TemplateItem) {
    const title = (editingItemTitle[item.id] ?? "").trim();
    if (!title || title === item.title) {
      setEditingItemTitle((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      return;
    }
    await run(async () => {
      await clientApi.updateTemplateItem(templateId, item.id, { title });
      setEditingItemTitle((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
    }, "Could not update item");
  }

  if (loading && templates.length === 0) return <p className="text-muted">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-muted">
          Reusable checklists for trips, projects, or routines
        </p>
      </div>

      {error && (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {templates.length === 0 ? (
        <section className="space-y-3 border border-line bg-paper/70 p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
            Get started with templates
          </h2>
          <p className="text-sm text-muted">
            Create your first template to reuse checklists across tasks. Perfect for packing lists,
            trip preparation, or recurring projects.
          </p>
        </section>
      ) : (
        <section className="space-y-3">
          {templates.map((template) => (
            <article
              key={template.id}
              className="border border-line bg-paper/70 px-4 py-3"
            >
              <button
                type="button"
                onClick={() => toggle(template.id)}
                aria-expanded={expanded.has(template.id)}
                className="flex w-full items-center justify-between gap-3 text-left"
              >
                <div className="flex-1">
                  {editingName[template.id] !== undefined ? (
                    <form
                      onClick={(e) => e.stopPropagation()}
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveTemplateName(template);
                      }}
                      className="flex gap-2"
                    >
                      <input
                        className="flex-1 rounded border border-line bg-paper px-2 py-1"
                        value={editingName[template.id]}
                        autoFocus
                        onChange={(e) =>
                          setEditingName((prev) => ({ ...prev, [template.id]: e.target.value }))
                        }
                        onBlur={() => saveTemplateName(template)}
                      />
                    </form>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-[family-name:var(--font-display)] text-lg font-semibold">
                        {template.name}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingName((prev) => ({ ...prev, [template.id]: template.name }));
                        }}
                        className="text-xs text-muted hover:text-ink"
                      >
                        Rename
                      </button>
                    </div>
                  )}
                  <p className="text-xs text-muted">
                    {template.items.length} {template.items.length === 1 ? "item" : "items"}
                  </p>
                </div>
                <span className="text-xs text-muted" aria-hidden>
                  {expanded.has(template.id) ? "▴" : "▾"}
                </span>
              </button>

              {expanded.has(template.id) && (
                <div className="mt-3 space-y-3">
                  {template.items.length > 0 ? (
                    <ul className="divide-y divide-line/60">
                      {template.items.map((item) => (
                        <li key={item.id} className="flex items-center gap-2 py-1.5">
                          <span className="h-4 w-4 shrink-0 rounded border border-line" aria-hidden />
                          {editingItemTitle[item.id] !== undefined ? (
                            <form
                              onSubmit={(e) => {
                                e.preventDefault();
                                void saveItemTitle(template.id, item);
                              }}
                              className="flex flex-1 gap-2"
                            >
                              <input
                                className="flex-1 rounded border border-line bg-paper px-2 py-1 text-sm"
                                value={editingItemTitle[item.id]}
                                autoFocus
                                onChange={(e) =>
                                  setEditingItemTitle((prev) => ({ ...prev, [item.id]: e.target.value }))
                                }
                                onBlur={() => saveItemTitle(template.id, item)}
                              />
                            </form>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() =>
                                  setEditingItemTitle((prev) => ({ ...prev, [item.id]: item.title }))
                                }
                                className="flex-1 text-left text-sm hover:text-muted"
                              >
                                {item.title}
                              </button>
                              <TrashButton
                                onClick={() =>
                                  run(
                                    () => clientApi.deleteTemplateItem(template.id, item.id),
                                    "Could not delete item",
                                  )
                                }
                              />
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-muted">No items yet. Add your first checklist item below.</p>
                  )}

                  <form onSubmit={(e) => addItem(template.id, e)} className="flex gap-2">
                    <input
                      className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-1.5 text-sm"
                      placeholder="Add item…"
                      value={newItemTitle[template.id] ?? ""}
                      onChange={(e) =>
                        setNewItemTitle((prev) => ({ ...prev, [template.id]: e.target.value }))
                      }
                    />
                    <button
                      type="submit"
                      disabled={!(newItemTitle[template.id] ?? "").trim()}
                      className="rounded bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
                    >
                      Add
                    </button>
                  </form>

                  <div className="border-t border-line/60 pt-3">
                    <button
                      type="button"
                      onClick={() =>
                        run(() => clientApi.deleteTemplate(template.id), "Could not delete template")
                      }
                      className="text-sm text-muted hover:text-danger"
                    >
                      Delete template
                    </button>
                  </div>
                </div>
              )}
            </article>
          ))}
        </section>
      )}

      <form onSubmit={addTemplate} className="flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2 text-sm"
          placeholder="New template (e.g. Pack for Brazil trip)"
          value={newTemplateName}
          maxLength={100}
          onChange={(e) => setNewTemplateName(e.target.value)}
        />
        <button
          type="submit"
          disabled={!newTemplateName.trim()}
          className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          Add template
        </button>
      </form>
    </div>
  );
}
