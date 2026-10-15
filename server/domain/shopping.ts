import { prisma } from "../db/client";
import { getPersonalWorkspaceId } from "./streams";

export const STORE_PRESETS = ["Costco", "Fortinos", "Home Depot"];

/** How many "Buy again" suggestions to offer per store. */
const BUY_AGAIN_LIMIT = 10;
/** History window for "Buy again", in cleared items. */
const HISTORY_SCAN = 500;

function nameKey(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** The active list, store sections and "Buy again" suggestions. */
export async function getShoppingList(userId: string) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const [stores, items, history] = await Promise.all([
    prisma.shoppingStore.findMany({
      where: { workspaceId, archivedAt: null },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
    prisma.shoppingItem.findMany({
      where: { workspaceId, clearedAt: null },
      // Most recently checked first, so a mis-tap is easy to undo.
      orderBy: [{ checkedAt: { sort: "desc", nulls: "first" } }, { createdAt: "asc" }],
    }),
    prisma.shoppingItem.findMany({
      where: { workspaceId, clearedAt: { not: null } },
      orderBy: { clearedAt: "desc" },
      take: HISTORY_SCAN,
      select: { name: true, storeId: true, clearedAt: true },
    }),
  ]);

  const onList = new Set(items.map((i) => `${i.storeId ?? ""}|${nameKey(i.name)}`));
  // Rank past items by how often they were bought, then by how recently.
  const tally = new Map<string, { name: string; storeId: string | null; count: number; last: Date }>();
  for (const h of history) {
    const key = `${h.storeId ?? ""}|${nameKey(h.name)}`;
    if (onList.has(key)) continue;
    const prev = tally.get(key);
    if (prev) prev.count += 1;
    else tally.set(key, { name: h.name, storeId: h.storeId, count: 1, last: h.clearedAt! });
  }
  const buyAgain: Record<string, string[]> = {};
  for (const t of [...tally.values()].sort(
    (a, b) => b.count - a.count || b.last.getTime() - a.last.getTime(),
  )) {
    const key = t.storeId ?? "";
    buyAgain[key] ??= [];
    if (buyAgain[key].length < BUY_AGAIN_LIMIT) buyAgain[key].push(t.name);
  }

  return {
    stores: stores.map((s) => ({ id: s.id, name: s.name, sortOrder: s.sortOrder })),
    items: items.map((i) => ({
      id: i.id,
      name: i.name,
      storeId: i.storeId,
      checked: i.checkedAt !== null,
    })),
    buyAgain,
  };
}

export async function findStore(storeId: string, userId: string) {
  return prisma.shoppingStore.findFirst({
    where: {
      id: storeId,
      archivedAt: null,
      workspace: { memberships: { some: { userId } } },
    },
  });
}

export async function findItem(itemId: string, userId: string) {
  return prisma.shoppingItem.findFirst({
    where: { id: itemId, workspace: { memberships: { some: { userId } } } },
  });
}

/**
 * Add an item. If the same item is already on the list for that store it is
 * not duplicated; a checked copy goes back to "to buy".
 */
export async function addItem(userId: string, input: { name: string; storeId: string | null }) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const name = input.name.trim().replace(/\s+/g, " ");
  const existing = await prisma.shoppingItem.findFirst({
    where: {
      workspaceId,
      storeId: input.storeId,
      clearedAt: null,
      name: { equals: name, mode: "insensitive" },
    },
  });
  if (existing) {
    return existing.checkedAt
      ? prisma.shoppingItem.update({ where: { id: existing.id }, data: { checkedAt: null } })
      : existing;
  }
  return prisma.shoppingItem.create({
    data: { workspaceId, storeId: input.storeId, name },
  });
}

export async function updateItem(
  itemId: string,
  input: { name?: string; storeId?: string | null; checked?: boolean },
) {
  return prisma.shoppingItem.update({
    where: { id: itemId },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim().replace(/\s+/g, " ") } : {}),
      ...(input.storeId !== undefined ? { storeId: input.storeId } : {}),
      ...(input.checked !== undefined ? { checkedAt: input.checked ? new Date() : null } : {}),
    },
  });
}

/** Delete an item outright (a typo); it won't show up in "Buy again". */
export async function deleteItem(itemId: string) {
  return prisma.shoppingItem.delete({ where: { id: itemId } });
}

/** Clear checked items off the list, for one store or all ("" = no store). */
export async function clearChecked(userId: string, storeId?: string | null) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  return prisma.shoppingItem.updateMany({
    where: {
      workspaceId,
      clearedAt: null,
      checkedAt: { not: null },
      ...(storeId !== undefined ? { storeId } : {}),
    },
    data: { clearedAt: new Date() },
  });
}

export async function createStore(userId: string, name: string) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const max = await prisma.shoppingStore.aggregate({
    where: { workspaceId },
    _max: { sortOrder: true },
  });
  return prisma.shoppingStore.create({
    data: { workspaceId, name: name.trim(), sortOrder: (max._max.sortOrder ?? 0) + 1 },
  });
}

export async function createPresetStores(userId: string) {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const existing = await prisma.shoppingStore.findMany({
    where: { workspaceId, archivedAt: null },
    select: { name: true },
  });
  const names = new Set(existing.map((s) => nameKey(s.name)));
  const missing = STORE_PRESETS.filter((n) => !names.has(nameKey(n)));
  for (const name of missing) await createStore(userId, name);
  return missing.length;
}

export async function updateStore(storeId: string, input: { name?: string }) {
  return prisma.shoppingStore.update({
    where: { id: storeId },
    data: { ...(input.name !== undefined ? { name: input.name.trim() } : {}) },
  });
}

/** Swap a store with its neighbour in the list order. */
export async function moveStore(userId: string, storeId: string, direction: "up" | "down") {
  const workspaceId = await getPersonalWorkspaceId(userId);
  const stores = await prisma.shoppingStore.findMany({
    where: { workspaceId, archivedAt: null },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const i = stores.findIndex((s) => s.id === storeId);
  const j = direction === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= stores.length) return;
  const reordered = [...stores];
  [reordered[i], reordered[j]] = [reordered[j], reordered[i]];
  await prisma.$transaction(
    reordered.map((s, idx) =>
      prisma.shoppingStore.update({ where: { id: s.id }, data: { sortOrder: idx + 1 } }),
    ),
  );
}

/** Remove a store section; its items stay on the list under "Any store". */
export async function archiveStore(storeId: string) {
  return prisma.$transaction([
    prisma.shoppingItem.updateMany({
      where: { storeId, clearedAt: null },
      data: { storeId: null },
    }),
    prisma.shoppingStore.update({ where: { id: storeId }, data: { archivedAt: new Date() } }),
  ]);
}
