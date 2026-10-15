"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { shoppingApi, type ShoppingList } from "@/lib/client-api";

type Item = ShoppingList["items"][number];
type Section = { id: string | null; name: string };

const ANY = "";
const LAST_STORE_KEY = "daylock.shopping.lastStore";
const BUY_AGAIN_SHOWN = 6;

function readLastStore() {
  try {
    return localStorage.getItem(LAST_STORE_KEY) ?? ANY;
  } catch {
    return ANY;
  }
}

function writeLastStore(id: string) {
  try {
    localStorage.setItem(LAST_STORE_KEY, id);
  } catch {
    // Private mode etc.; remembering the store is only a convenience.
  }
}

export default function ShoppingPage() {
  const [list, setList] = useState<ShoppingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quick, setQuick] = useState("");
  // The select only renders after the list loads, so reading storage here can't mismatch SSR.
  const [quickStore, setQuickStore] = useState(readLastStore);
  const [newStore, setNewStore] = useState("");
  const [editingStores, setEditingStores] = useState(false);

  const reload = useCallback(async () => {
    try {
      setList(await shoppingApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function run(action: () => Promise<unknown>, fallback: string) {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    }
    await reload();
  }

  function patchLocal(id: string, change: Partial<Item>) {
    setList((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, ...change } : i)) } : prev,
    );
  }

  async function toggle(item: Item) {
    patchLocal(item.id, { checked: !item.checked });
    await run(() => shoppingApi.updateItem(item.id, { checked: !item.checked }), "Could not update");
  }

  async function add(name: string, storeId: string | null) {
    const trimmed = name.trim();
    if (!trimmed) return;
    await run(() => shoppingApi.addItem(trimmed, storeId), "Could not add");
  }

  const stores = useMemo(() => list?.stores ?? [], [list]);
  // A remembered store that was since removed falls back to "Any store".
  const quickStoreId = stores.some((s) => s.id === quickStore) ? quickStore : ANY;

  const sections: Section[] = useMemo(() => {
    const items = list?.items ?? [];
    const anyHasContent =
      items.some((i) => i.storeId === null) || (list?.buyAgain[ANY]?.length ?? 0) > 0;
    return [
      ...stores.map((s) => ({ id: s.id, name: s.name })),
      ...(anyHasContent || stores.length === 0 ? [{ id: null, name: "Any store" }] : []),
    ];
  }, [list, stores]);

  if (!list) return <p className="text-muted">{error ?? "Loading…"}</p>;

  const toBuy = list.items.filter((i) => !i.checked).length;
  const inCart = list.items.length - toBuy;
  const allNames = [...new Set(Object.values(list.buyAgain).flat())];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Shopping</h1>
          <p className="text-sm text-muted">
            {toBuy === 0 ? "Nothing to buy" : `${toBuy} to buy`}
            {inCart > 0 ? ` · ${inCart} in cart` : ""}
          </p>
        </div>
        {inCart > 0 && (
          <button
            type="button"
            onClick={() => run(() => shoppingApi.clear(), "Could not clear")}
            className="rounded border border-line px-3 py-1.5 text-sm"
          >
            Clear {inCart} in cart
          </button>
        )}
      </div>

      {error && (
        <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void add(quick, quickStoreId || null).then(() => setQuick(""));
        }}
        className="flex flex-wrap gap-2 border border-line bg-paper/70 p-3"
      >
        <input
          className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2"
          placeholder="Add an item…"
          value={quick}
          maxLength={200}
          autoComplete="off"
          list="shopping-history"
          enterKeyHint="done"
          onChange={(e) => setQuick(e.target.value)}
        />
        {stores.length > 0 && (
          <select
            aria-label="Store"
            className="rounded border border-line bg-paper px-2 py-2 text-sm"
            value={quickStoreId}
            onChange={(e) => {
              setQuickStore(e.target.value);
              writeLastStore(e.target.value);
            }}
          >
            <option value={ANY}>Any store</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="submit"
          disabled={!quick.trim()}
          className="rounded bg-ink px-4 py-2 text-sm text-paper disabled:opacity-50"
        >
          Add
        </button>
        <datalist id="shopping-history">
          {allNames.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
      </form>

      {stores.length === 0 && (
        <section className="space-y-2 border border-line bg-paper/70 p-4">
          <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">Add your stores</h2>
          <p className="text-sm text-muted">
            Group items by where you buy them, so each trip is one short list.
          </p>
          <button
            type="button"
            className="rounded bg-ink px-4 py-2 text-sm text-paper"
            onClick={() => run(() => shoppingApi.addStore({ presets: true }), "Could not add stores")}
          >
            Add Costco, Fortinos and Home Depot
          </button>
        </section>
      )}

      {sections.map((section, idx) => (
        <StoreSection
          key={section.id ?? "any"}
          section={section}
          items={list.items.filter((i) => i.storeId === section.id)}
          buyAgain={list.buyAgain[section.id ?? ANY] ?? []}
          stores={stores}
          editing={editingStores && section.id !== null}
          isFirst={idx === 0}
          isLast={idx === stores.length - 1}
          onToggle={toggle}
          onAdd={(name) => add(name, section.id)}
          run={run}
        />
      ))}

      <div className="space-y-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const name = newStore.trim();
            if (!name) return;
            void run(() => shoppingApi.addStore({ name }), "Could not add store").then(() => setNewStore(""));
          }}
          className="flex gap-2"
        >
          <input
            className="min-w-0 flex-1 rounded border border-line bg-paper px-3 py-2 text-sm"
            placeholder="New store (e.g. Shoppers)"
            value={newStore}
            maxLength={60}
            onChange={(e) => setNewStore(e.target.value)}
          />
          <button
            type="submit"
            disabled={!newStore.trim()}
            className="rounded border border-line px-4 py-2 text-sm disabled:opacity-50"
          >
            Add store
          </button>
        </form>
        {stores.length > 0 && (
          <button
            type="button"
            onClick={() => setEditingStores((v) => !v)}
            className="text-sm text-muted hover:text-ink"
          >
            {editingStores ? "Done editing stores" : "Rename, reorder or remove stores…"}
          </button>
        )}
      </div>
    </div>
  );
}

type SectionProps = {
  section: Section;
  items: Item[];
  buyAgain: string[];
  stores: ShoppingList["stores"];
  editing: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggle: (item: Item) => void;
  onAdd: (name: string) => Promise<void>;
  run: (action: () => Promise<unknown>, fallback: string) => Promise<void>;
};

function StoreSection({
  section,
  items,
  buyAgain,
  stores,
  editing,
  isFirst,
  isLast,
  onToggle,
  onAdd,
  run,
}: SectionProps) {
  const [draft, setDraft] = useState("");
  const [name, setName] = useState(section.name);
  const [showAllAgain, setShowAllAgain] = useState(false);
  const [itemMenu, setItemMenu] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const toBuy = items.filter((i) => !i.checked);
  const inCart = items.filter((i) => i.checked);
  const again = showAllAgain ? buyAgain : buyAgain.slice(0, BUY_AGAIN_SHOWN);
  const storeId = section.id;

  const itemRow = (item: Item) => (
    <li key={item.id} className="py-0.5">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onToggle(item)}
          aria-pressed={item.checked}
          className="flex min-h-11 flex-1 items-center gap-3 rounded px-1 text-left hover:bg-paper-2/60"
        >
          <span
            aria-hidden
            className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
              item.checked ? "border-accent bg-accent text-paper" : "border-line"
            }`}
          >
            {item.checked && (
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3">
                <path d="M5 12l5 5 9-10" />
              </svg>
            )}
          </span>
          <span className={item.checked ? "text-muted line-through" : ""}>{item.name}</span>
        </button>
        <button
          type="button"
          aria-label={`Options for ${item.name}`}
          aria-expanded={itemMenu === item.id}
          onClick={() => setItemMenu(itemMenu === item.id ? null : item.id)}
          className="h-9 w-9 shrink-0 rounded text-muted hover:bg-line/40 hover:text-ink"
        >
          ⋯
        </button>
      </div>
      {itemMenu === item.id && (
        <div className="ml-10 flex flex-wrap items-center gap-2 pb-2 text-sm">
          {stores.length > 0 && (
            <select
              aria-label="Move to store"
              className="rounded border border-line bg-paper px-2 py-1"
              value={item.storeId ?? ANY}
              onChange={(e) => {
                setItemMenu(null);
                void run(
                  () => shoppingApi.updateItem(item.id, { storeId: e.target.value || null }),
                  "Could not move",
                );
              }}
            >
              <option value={ANY}>Any store</option>
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            className="rounded border border-line px-2 py-1 text-danger"
            onClick={() => {
              setItemMenu(null);
              void run(() => shoppingApi.deleteItem(item.id), "Could not delete");
            }}
          >
            Delete
          </button>
        </div>
      )}
    </li>
  );

  return (
    <section className="border border-line bg-paper/70 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold">
          {section.name}{" "}
          <span className="font-[family-name:var(--font-body)] text-sm font-normal text-muted">
            {toBuy.length > 0 ? `· ${toBuy.length}` : ""}
          </span>
        </h2>
        {editing && storeId && (
          <div className="flex items-center gap-1 text-sm">
            <button
              type="button"
              disabled={isFirst}
              aria-label={`Move ${section.name} up`}
              onClick={() => run(() => shoppingApi.updateStore(storeId, { move: "up" }), "Could not move")}
              className="rounded border border-line px-2 py-0.5 disabled:opacity-30"
            >
              ↑
            </button>
            <button
              type="button"
              disabled={isLast}
              aria-label={`Move ${section.name} down`}
              onClick={() => run(() => shoppingApi.updateStore(storeId, { move: "down" }), "Could not move")}
              className="rounded border border-line px-2 py-0.5 disabled:opacity-30"
            >
              ↓
            </button>
          </div>
        )}
      </div>

      {editing && storeId && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-b border-line/60 pb-3 text-sm">
          <input
            className="min-w-0 flex-1 rounded border border-line bg-paper px-2 py-1"
            value={name}
            maxLength={60}
            onChange={(e) => setName(e.target.value)}
          />
          <button
            type="button"
            disabled={!name.trim() || name.trim() === section.name}
            onClick={() => run(() => shoppingApi.updateStore(storeId, { name: name.trim() }), "Could not rename")}
            className="rounded border border-line px-2 py-1 disabled:opacity-50"
          >
            Rename
          </button>
          {confirmRemove ? (
            <>
              <button
                type="button"
                onClick={() => run(() => shoppingApi.updateStore(storeId, { archived: true }), "Could not remove")}
                className="rounded border border-danger px-2 py-1 text-danger"
              >
                Remove {section.name}
              </button>
              <button type="button" className="text-muted" onClick={() => setConfirmRemove(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="text-muted hover:text-danger" onClick={() => setConfirmRemove(true)}>
              Remove…
            </button>
          )}
          {confirmRemove && (
            <p className="basis-full text-xs text-muted">Its items stay on the list under Any store.</p>
          )}
        </div>
      )}

      {toBuy.length > 0 && <ul className="mt-1">{toBuy.map(itemRow)}</ul>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onAdd(draft).then(() => setDraft(""));
        }}
        className="mt-2"
      >
        <input
          className="w-full rounded border border-line bg-paper px-3 py-2 text-sm"
          placeholder={`Add to ${section.name}…`}
          value={draft}
          maxLength={200}
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setDraft(e.target.value)}
        />
      </form>

      {buyAgain.length > 0 && (
        <div className="mt-3">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Buy again</p>
          <div className="flex flex-wrap gap-1.5">
            {again.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => onAdd(n)}
                className="rounded-full border border-line px-3 py-1 text-sm hover:bg-paper-2"
              >
                + {n}
              </button>
            ))}
            {buyAgain.length > BUY_AGAIN_SHOWN && (
              <button
                type="button"
                onClick={() => setShowAllAgain((v) => !v)}
                className="px-2 py-1 text-sm text-muted hover:text-ink"
              >
                {showAllAgain ? "Less" : `+${buyAgain.length - BUY_AGAIN_SHOWN} more`}
              </button>
            )}
          </div>
        </div>
      )}

      {inCart.length > 0 && (
        <div className="mt-3 border-t border-line/60 pt-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              In cart ({inCart.length})
            </p>
            <button
              type="button"
              onClick={() => run(() => shoppingApi.clear(storeId), "Could not clear")}
              className="text-sm text-accent"
            >
              Clear
            </button>
          </div>
          <ul>{inCart.map(itemRow)}</ul>
        </div>
      )}
    </section>
  );
}
