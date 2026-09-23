import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { CreateTaskSchema } from "@api-types";
import { createTask, getInboxForUser } from "@server/domain/tasks";
import { patchMyDay } from "@server/domain/my-day";
import { prisma } from "@server/db/client";
import { format } from "date-fns";

export async function GET(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const url = new URL(req.url);
  let listId = url.searchParams.get("listId");

  if (!listId) {
    try {
      const inbox = await getInboxForUser(authResult.userId);
      listId = inbox.id;
    } catch {
      return jsonError("Inbox not found", 404);
    }
  }

  const list = await prisma.list.findFirst({
    where: {
      id: listId,
      workspace: { memberships: { some: { userId: authResult.userId } } },
    },
  });
  if (!list) return jsonError("List not found", 404);

  const tasks = await prisma.task.findMany({
    where: { listId, archivedAt: null },
    include: { recurrenceRule: true },
    orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
  });
  return jsonOk({ tasks, listId });
}

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json();
  const parsed = CreateTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  let listId = parsed.data.listId;
  if (!listId) {
    try {
      const inbox = await getInboxForUser(authResult.userId);
      listId = inbox.id;
    } catch {
      return jsonError("Inbox not found", 404);
    }
  }

  const list = await prisma.list.findFirst({
    where: {
      id: listId,
      workspace: { memberships: { some: { userId: authResult.userId } } },
    },
  });
  if (!list) return jsonError("List not found", 404);

  const { pinToMyDay, pinDate, ...taskInput } = parsed.data;

  const task = await createTask({ ...taskInput, listId });
  if (pinToMyDay) {
    await patchMyDay(authResult.userId, {
      date: pinDate ?? format(new Date(), "yyyy-MM-dd"),
      pin: { refType: "flex", refId: task.id, pinned: true },
    });
  }
  return jsonOk({ task }, 201);
}
