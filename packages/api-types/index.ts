import { z } from "zod";

export const AttentionCostSchema = z.enum(["deep", "light", "any"]);
export const TaskKindSchema = z.enum(["flex", "template"]);
export const TaskPrioritySchema = z.enum(["none", "low", "medium", "high"]);
export const AlarmPolicySchema = z.enum(["none", "gentle", "panic"]);
export const RecurrenceModeSchema = z.enum(["habit", "rolling", "fixed"]);
export const OccurrenceStatusSchema = z.enum([
  "pending",
  "done",
  "skipped",
  "missed",
  "snoozed",
  "expired",
]);
export const SkipActionSchema = z.enum(["skip", "defer", "snooze"]);
export const AttentionModeSchema = z.enum(["full", "partial", "idle"]);
export const MyDayRefTypeSchema = z.enum(["occurrence", "flex", "calendar"]);
export const MembershipRoleSchema = z.enum(["owner", "member"]);
export const WorkspaceTypeSchema = z.enum(["personal", "shared"]);

export const RecurrenceInputSchema = z.object({
  mode: RecurrenceModeSchema.optional(),
  frequency: z.enum(["daily", "weekly", "monthly"]),
  interval: z.number().int().positive().max(365).default(1),
  byWeekday: z.array(z.number().int().min(0).max(6)).optional(),
  skippable: z.boolean().default(true),
  alarmPolicy: AlarmPolicySchema.default("none"),
  windowStart: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  windowEnd: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  activeMonths: z.array(z.number().int().min(1).max(12)).optional(),
  pauseUntil: z.string().datetime().optional().nullable(),
});

export const CreateTaskSchema = z.object({
  listId: z.string().min(1).optional(),
  title: z.string().min(1).max(500),
  notes: z.string().max(10000).optional().nullable(),
  priority: TaskPrioritySchema.optional(),
  kind: TaskKindSchema.optional(),
  attentionCost: AttentionCostSchema.optional(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  recurrence: RecurrenceInputSchema.optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial().omit({ listId: true }).extend({
  listId: z.string().min(1).optional(),
  archived: z.boolean().optional(),
});

export const CompleteTaskSchema = z.object({
  occurrenceId: z.string().optional(),
});

export const ScheduleTaskSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
  allDay: z.boolean().default(false),
  /** YYYY-MM-DD — required for all-day Google events */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  syncToCalendar: z.boolean().default(true),
});

export const SkipOccurrenceSchema = z.object({
  action: SkipActionSchema.default("skip"),
  reason: z.string().max(100).optional().nullable(),
  deferDays: z.number().int().positive().max(365).optional(),
});

export const MyDayPatchSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  items: z
    .array(
      z.object({
        refType: MyDayRefTypeSchema,
        refId: z.string().min(1),
        sortOrder: z.number().int(),
        pinned: z.boolean().optional(),
      }),
    )
    .optional(),
  pin: z
    .object({
      refType: MyDayRefTypeSchema,
      refId: z.string().min(1),
      pinned: z.boolean(),
    })
    .optional(),
});

export const UpdateCalendarEventSchema = z.object({
  attentionMode: AttentionModeSchema,
});

export const CreateListSchema = z.object({
  workspaceId: z.string().min(1),
  name: z.string().min(1).max(200),
});

export const CreateWorkspaceSchema = z.object({
  name: z.string().min(1).max(200),
  type: WorkspaceTypeSchema.default("shared"),
});

export const InviteMemberSchema = z.object({
  email: z.string().email(),
  role: MembershipRoleSchema.default("member"),
});

export const PushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export type CreateTaskInput = z.infer<typeof CreateTaskSchema>;
export type UpdateTaskInput = z.infer<typeof UpdateTaskSchema>;
export type MyDayPatchInput = z.infer<typeof MyDayPatchSchema>;
export type SkipOccurrenceInput = z.infer<typeof SkipOccurrenceSchema>;
