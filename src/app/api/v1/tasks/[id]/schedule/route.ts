import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { ScheduleTaskSchema } from "@api-types";
import { getTaskForUser } from "@server/domain/tasks";
import {
  createGoogleCalendarEvent,
  hasCalendarConnection,
} from "@server/integrations/google-calendar";
import { prisma } from "@server/db/client";
import { addDays, addMinutes, startOfDay } from "date-fns";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const parsed = ScheduleTaskSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const task = await getTaskForUser(id, authResult.userId);
  if (!task) return jsonError("Not found", 404);
  if (task.kind === "template") {
    return jsonError("Schedule flex tasks only (not recurring templates)", 400);
  }

  const allDay = parsed.data.allDay;
  const dateOnly = parsed.data.date;

  let start: Date;
  let end: Date;

  if (allDay) {
    if (!dateOnly) return jsonError("date (YYYY-MM-DD) required for all-day tasks");
    const [y, m, d] = dateOnly.split("-").map(Number);
    start = startOfDay(new Date(y, m - 1, d));
    end = addDays(start, 1);
  } else {
    start = new Date(parsed.data.start);
    end = parsed.data.end
      ? new Date(parsed.data.end)
      : addMinutes(start, task.estimatedMinutes ?? 30);
    if (end <= start) return jsonError("End must be after start");
  }

  let calendarEvent = null;
  let calendarError: string | null = null;

  if (parsed.data.syncToCalendar) {
    const status = await hasCalendarConnection(authResult.userId);
    if (!status.connected) {
      calendarError = "NO_TOKEN";
    } else if (!status.canWrite) {
      calendarError = "NEED_REAUTH";
    } else {
      const result = await createGoogleCalendarEvent(authResult.userId, {
        title: task.title,
        description: task.notes,
        start,
        end,
        allDay,
        date: dateOnly,
      });
      if (result.error) {
        calendarError = result.error;
      } else {
        calendarEvent = result.event;
      }
    }
  }

  const updated = await prisma.task.update({
    where: { id },
    data: { dueAt: start },
  });

  return jsonOk({
    task: updated,
    calendarEvent,
    calendarError,
    scheduled: { start, end, allDay },
  });
}
