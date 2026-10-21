import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@server/db/client";
import { createTask, getInboxForUser } from "@server/domain/tasks";
import { patchMyDay } from "@server/domain/my-day";

export function createMcpServer(userId: string) {
  const mcpServer = new McpServer({
    name: "daylock-task-manager",
    version: "1.0.0",
  });

  // ─── List Tasks ───────────────────────────────────────────────────
  mcpServer.registerTool(
    "list_tasks",
    {
      title: "List tasks",
      description:
        "Get all tasks from a list. If no listId is provided, returns tasks from the user's inbox.",
      inputSchema: {
        listId: z
          .string()
          .optional()
          .describe("Optional list ID. Defaults to user's inbox."),
        includeCompleted: z
          .boolean()
          .optional()
          .default(false)
          .describe("Include completed tasks"),
      },
    },
    async ({ listId, includeCompleted }) => {
      let targetListId = listId;
      if (!targetListId) {
        const inbox = await getInboxForUser(userId);
        targetListId = inbox.id;
      }

      const list = await prisma.list.findFirst({
        where: {
          id: targetListId,
          workspace: { memberships: { some: { userId } } },
        },
      });

      if (!list) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "List not found" }) }],
        };
      }

      const tasks = await prisma.task.findMany({
        where: {
          listId: targetListId,
          archivedAt: null,
          ...(includeCompleted ? {} : { completedAt: null }),
        },
        include: { recurrenceRule: true, goal: true },
        orderBy: [{ completedAt: "asc" }, { createdAt: "desc" }],
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              listName: list.name,
              listId: list.id,
              tasks: tasks.map((t) => ({
                id: t.id,
                title: t.title,
                notes: t.notes,
                priority: t.priority,
                completed: !!t.completedAt,
                dueAt: t.dueAt,
                goalTitle: t.goal?.title,
                estimatedMinutes: t.estimatedMinutes,
                attentionCost: t.attentionCost,
              })),
            }),
          },
        ],
      };
    },
  );

  // ─── Create Task ──────────────────────────────────────────────────
  mcpServer.registerTool(
    "create_task",
    {
      title: "Create a new task",
      description:
        "Create a new task in the specified list (defaults to inbox). Optionally pin it to My Day.",
      inputSchema: {
        title: z.string().min(1).describe("Task title (required)"),
        notes: z.string().optional().describe("Optional notes/description"),
        listId: z
          .string()
          .optional()
          .describe("List ID to create the task in (defaults to inbox)"),
        priority: z
          .enum(["none", "low", "medium", "high"])
          .optional()
          .describe("Task priority"),
        dueAt: z
          .string()
          .optional()
          .describe("Due date/time in ISO format (e.g., 2024-01-15T10:00:00Z)"),
        estimatedMinutes: z.number().int().positive().optional().describe("Estimated duration"),
        attentionCost: z
          .enum(["deep", "light", "any"])
          .optional()
          .describe("Attention cost level"),
        pinToMyDay: z
          .boolean()
          .optional()
          .describe("Pin this task to My Day for today"),
      },
    },
    async ({ title, notes, listId, priority, dueAt, estimatedMinutes, attentionCost, pinToMyDay }) => {
      let targetListId = listId;
      if (!targetListId) {
        const inbox = await getInboxForUser(userId);
        targetListId = inbox.id;
      }

      const list = await prisma.list.findFirst({
        where: {
          id: targetListId,
          workspace: { memberships: { some: { userId } } },
        },
      });

      if (!list) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "List not found" }) }],
        };
      }

      const task = await createTask({
        title,
        notes,
        listId: targetListId,
        priority: priority as any,
        dueAt: dueAt || null,
        estimatedMinutes,
        attentionCost: attentionCost as any,
      });

      if (pinToMyDay) {
        const today = new Date().toISOString().split("T")[0];
        await patchMyDay(userId, {
          date: today,
          pin: { refType: "flex", refId: task.id, pinned: true },
        });
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              task: {
                id: task.id,
                title: task.title,
                listId: task.listId,
                createdAt: task.createdAt,
                pinnedToMyDay: pinToMyDay,
              },
            }),
          },
        ],
      };
    },
  );

  // ─── Complete Task ────────────────────────────────────────────────
  mcpServer.registerTool(
    "complete_task",
    {
      title: "Mark task as complete",
      description: "Mark a task as completed",
      inputSchema: {
        taskId: z.string().describe("Task ID to complete"),
      },
    },
    async ({ taskId }) => {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          list: { workspace: { memberships: { some: { userId } } } },
        },
      });

      if (!task) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
        };
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: { completedAt: new Date() },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              task: { id: updated.id, title: updated.title, completedAt: updated.completedAt },
            }),
          },
        ],
      };
    },
  );

  // ─── Update Task ──────────────────────────────────────────────────
  mcpServer.registerTool(
    "update_task",
    {
      title: "Update a task",
      description: "Update task properties like title, notes, priority, or due date",
      inputSchema: {
        taskId: z.string().describe("Task ID to update"),
        title: z.string().optional().describe("New title"),
        notes: z.string().optional().describe("New notes"),
        priority: z.enum(["none", "low", "medium", "high"]).optional().describe("New priority"),
        dueAt: z.string().optional().describe("New due date/time in ISO format"),
        estimatedMinutes: z.number().int().positive().optional().describe("Estimated duration"),
      },
    },
    async ({ taskId, title, notes, priority, dueAt, estimatedMinutes }) => {
      const task = await prisma.task.findFirst({
        where: {
          id: taskId,
          list: { workspace: { memberships: { some: { userId } } } },
        },
      });

      if (!task) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Task not found" }) }],
        };
      }

      const updated = await prisma.task.update({
        where: { id: taskId },
        data: {
          ...(title !== undefined && { title }),
          ...(notes !== undefined && { notes }),
          ...(priority !== undefined && { priority }),
          ...(dueAt !== undefined && { dueAt: new Date(dueAt) }),
          ...(estimatedMinutes !== undefined && { estimatedMinutes }),
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              task: {
                id: updated.id,
                title: updated.title,
                notes: updated.notes,
                priority: updated.priority,
                dueAt: updated.dueAt,
              },
            }),
          },
        ],
      };
    },
  );

  // ─── List Workspaces & Streams ────────────────────────────────────
  mcpServer.registerTool(
    "list_streams",
    {
      title: "List life streams",
      description: "Get all life streams (non-inbox lists) accessible to the user",
      inputSchema: {},
    },
    async () => {
      const lists = await prisma.list.findMany({
        where: {
          workspace: { memberships: { some: { userId } } },
          isInbox: false,
          archivedAt: null,
        },
        orderBy: { sortOrder: "asc" },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              streams: lists.map((l) => ({
                id: l.id,
                name: l.name,
                color: l.color,
                weight: l.weight,
              })),
            }),
          },
        ],
      };
    },
  );

  // ─── Get My Day ───────────────────────────────────────────────────
  mcpServer.registerTool(
    "get_my_day",
    {
      title: "Get My Day items",
      description: "Get all items pinned to My Day for a specific date (defaults to today)",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe("Date in YYYY-MM-DD format (defaults to today)"),
      },
    },
    async ({ date }) => {
      const targetDate = date || new Date().toISOString().split("T")[0];

      const items = await prisma.myDayItem.findMany({
        where: {
          userId,
          date: new Date(targetDate),
        },
        orderBy: { sortOrder: "asc" },
      });

      const flexTasks = await prisma.task.findMany({
        where: {
          id: { in: items.filter((i) => i.refType === "flex").map((i) => i.refId) },
        },
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              date: targetDate,
              items: items.map((item) => {
                const task = flexTasks.find((t) => t.id === item.refId);
                return {
                  id: item.id,
                  refType: item.refType,
                  refId: item.refId,
                  pinned: item.pinned,
                  source: item.source,
                  taskTitle: task?.title,
                };
              }),
            }),
          },
        ],
      };
    },
  );

  return mcpServer;
}
