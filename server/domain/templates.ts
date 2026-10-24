import { prisma } from "../db/client";

export async function getTemplates(userId: string) {
  // Templates are global, but we scope them to the user's workspace for now
  const membership = await prisma.membership.findFirst({
    where: { userId, workspace: { type: "personal" } },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error("WORKSPACE_MISSING");

  return prisma.taskTemplate.findMany({
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function createTemplate(userId: string, input: { name: string; items?: string[] }) {
  const membership = await prisma.membership.findFirst({
    where: { userId, workspace: { type: "personal" } },
    select: { workspaceId: true },
  });
  if (!membership) throw new Error("WORKSPACE_MISSING");

  const maxSort = await prisma.taskTemplate.aggregate({ _max: { sortOrder: true } });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  return prisma.taskTemplate.create({
    data: {
      name: input.name,
      sortOrder,
      items: input.items
        ? { create: input.items.map((title, i) => ({ title, sortOrder: i })) }
        : undefined,
    },
    include: { items: true },
  });
}

export async function updateTemplate(
  templateId: string,
  input: { name?: string; sortOrder?: number },
) {
  return prisma.taskTemplate.update({
    where: { id: templateId },
    data: input,
    include: { items: true },
  });
}

export async function deleteTemplate(templateId: string) {
  return prisma.taskTemplate.delete({ where: { id: templateId } });
}

export async function addTemplateItem(templateId: string, title: string) {
  const maxSort = await prisma.templateChecklistItem.aggregate({
    where: { templateId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  return prisma.templateChecklistItem.create({
    data: { templateId, title, sortOrder },
  });
}

export async function updateTemplateItem(itemId: string, input: { title?: string; sortOrder?: number }) {
  return prisma.templateChecklistItem.update({
    where: { id: itemId },
    data: input,
  });
}

export async function deleteTemplateItem(itemId: string) {
  return prisma.templateChecklistItem.delete({ where: { id: itemId } });
}

export async function getTaskChecklist(taskId: string) {
  return prisma.checklistItem.findMany({
    where: { taskId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

export async function addChecklistItem(taskId: string, title: string) {
  const maxSort = await prisma.checklistItem.aggregate({
    where: { taskId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? 0) + 1;

  return prisma.checklistItem.create({
    data: { taskId, title, sortOrder },
  });
}

export async function updateChecklistItem(
  itemId: string,
  input: { title?: string; checked?: boolean; sortOrder?: number },
) {
  return prisma.checklistItem.update({
    where: { id: itemId },
    data: input,
  });
}

export async function deleteChecklistItem(itemId: string) {
  return prisma.checklistItem.delete({ where: { id: itemId } });
}

/** Apply a template to a task: copy all template items as unchecked checklist items */
export async function applyTemplateToTask(taskId: string, templateId: string) {
  const template = await prisma.taskTemplate.findUnique({
    where: { id: templateId },
    include: { items: { orderBy: { sortOrder: "asc" } } },
  });
  if (!template) throw new Error("TEMPLATE_NOT_FOUND");

  // Delete existing checklist items
  await prisma.checklistItem.deleteMany({ where: { taskId } });

  // Create new items from template
  await prisma.checklistItem.createMany({
    data: template.items.map((item) => ({
      taskId,
      title: item.title,
      sortOrder: item.sortOrder,
      checked: false,
    })),
  });

  // Update task to track which template was used
  await prisma.task.update({
    where: { id: taskId },
    data: { templateId },
  });

  return getTaskChecklist(taskId);
}

/** Update template from task's current checklist */
export async function updateTemplateFromTask(taskId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: { templateId: true },
  });
  if (!task?.templateId) throw new Error("TASK_HAS_NO_TEMPLATE");

  const items = await prisma.checklistItem.findMany({
    where: { taskId },
    orderBy: { sortOrder: "asc" },
  });

  // Delete existing template items
  await prisma.templateChecklistItem.deleteMany({ where: { templateId: task.templateId } });

  // Create new template items from task checklist
  await prisma.templateChecklistItem.createMany({
    data: items.map((item) => ({
      templateId: task.templateId!,
      title: item.title,
      sortOrder: item.sortOrder,
    })),
  });

  return prisma.taskTemplate.findUnique({
    where: { id: task.templateId },
    include: { items: true },
  });
}
