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
  /** When the next rolling/habit/fixed occurrence should become due (ISO). */
  nextDueAt: z.string().datetime().optional().nullable(),
});

export const CreateTaskSchema = z.object({
  listId: z.string().min(1).optional(),
  goalId: z.string().min(1).optional(),
  title: z.string().min(1).max(500),
  notes: z.string().max(10000).optional().nullable(),
  priority: TaskPrioritySchema.optional(),
  kind: TaskKindSchema.optional(),
  attentionCost: AttentionCostSchema.optional(),
  estimatedMinutes: z.number().int().positive().max(24 * 60).optional().nullable(),
  dueAt: z.string().datetime().optional().nullable(),
  recurrence: RecurrenceInputSchema.optional(),
  pinToMyDay: z.boolean().optional(),
  pinDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export const UpdateTaskSchema = CreateTaskSchema.partial()
  .omit({ listId: true, pinToMyDay: true, pinDate: true })
  .extend({
    listId: z.string().min(1).optional(),
    goalId: z.string().min(1).nullable().optional(),
    sortOrder: z.number().int().optional(),
    /** null stops the task repeating; it becomes a one-off task. */
    recurrence: RecurrenceInputSchema.nullable().optional(),
    archived: z.boolean().optional(),
  });

const StreamColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const CreateStreamSchema = z.union([
  z.object({ presets: z.literal(true) }),
  z.object({
    name: z.string().trim().min(1).max(60),
    color: StreamColorSchema.optional(),
    weight: z.number().int().min(0).max(100).optional(),
  }),
]);

export const UpdateStreamSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  color: StreamColorSchema.optional(),
  weight: z.number().int().min(0).max(100).optional(),
  sortOrder: z.number().int().optional(),
  archived: z.literal(true).optional(),
});

export const CreateGoalSchema = z.object({
  listId: z.string().min(1),
  title: z.string().trim().min(1).max(200),
});

export const UpdateGoalSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  archived: z.literal(true).optional(),
});

export const PickForTodaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  count: z.number().int().min(1).max(5).optional(),
  swapTaskId: z.string().min(1).optional(),
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

export const AddShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(200),
  storeId: z.string().min(1).nullable().default(null),
});

export const UpdateShoppingItemSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  storeId: z.string().min(1).nullable().optional(),
  checked: z.boolean().optional(),
});

export const ClearShoppingSchema = z.object({
  /** Omit to clear every store; null clears "Any store". */
  storeId: z.string().min(1).nullable().optional(),
});

export const CreateShoppingStoreSchema = z.union([
  z.object({ presets: z.literal(true) }),
  z.object({ name: z.string().trim().min(1).max(60) }),
]);

export const UpdateShoppingStoreSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  move: z.enum(["up", "down"]).optional(),
  archived: z.literal(true).optional(),
});
