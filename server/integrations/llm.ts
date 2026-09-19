import { z } from "zod";

export const TaskAnalysisSchema = z.object({
  estimatedMinutes: z.number().int().min(1).max(480),
  attentionCost: z.enum(["deep", "light", "any"]),
  suggestedDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  suggestedWindowStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  suggestedWindowEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .nullable()
    .optional(),
  rationale: z.string().max(500),
  confidence: z.enum(["low", "medium", "high"]),
});

export type TaskAnalysis = z.infer<typeof TaskAnalysisSchema>;

const AnalyzeRequestSchema = z.object({
  title: z.string().min(1).max(500),
  notes: z.string().max(5000).optional().nullable(),
  today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export { AnalyzeRequestSchema };

const SYSTEM = `You estimate how long a personal task takes and when to schedule it.
Return ONLY valid JSON matching this shape:
{
  "estimatedMinutes": number (1-480),
  "attentionCost": "deep" | "light" | "any",
  "suggestedDate": "YYYY-MM-DD" or null,
  "suggestedWindowStart": "HH:MM" or null,
  "suggestedWindowEnd": "HH:MM" or null,
  "rationale": short reason,
  "confidence": "low" | "medium" | "high"
}

Rules:
- Prefer realistic personal-life estimates; round to 5/10/15/30/45/60 when sensible
- Suggest a date within the next 7 days when the task implies timing (appointment, call, deadline, weekend chore); else null
- Suggest a start time when implied (morning gym, evening call); else a reasonable default like 10:00 or 14:00
- suggestedWindowEnd = start + duration when you suggest a start
- Be concise in rationale`;

function heuristicAnalyze(
  title: string,
  notes?: string | null,
  today?: string,
): TaskAnalysis {
  const text = `${title} ${notes ?? ""}`.toLowerCase();
  let estimatedMinutes = 20;
  let attentionCost: TaskAnalysis["attentionCost"] = "any";
  let suggestedWindowStart: string | null = null;
  const day = today ?? new Date().toISOString().slice(0, 10);

  if (/\b(email|reply|slack|text|call|check|quick|skim)\b/.test(text)) {
    estimatedMinutes = 15;
    attentionCost = "light";
    suggestedWindowStart = "10:00";
  }
  if (/\b(read|review|plan|organize|inbox)\b/.test(text)) {
    estimatedMinutes = 25;
    attentionCost = "light";
  }
  if (/\b(code|implement|write|draft|design|debug|meeting)\b/.test(text)) {
    estimatedMinutes = 60;
    attentionCost = "deep";
    suggestedWindowStart = "09:00";
  }
  if (/\b(buy|grocer|errand|laundry|clean|dishes)\b/.test(text)) {
    estimatedMinutes = 30;
    attentionCost = "any";
  }
  if (/\b(workout|run|gym|exercise)\b/.test(text)) {
    estimatedMinutes = 45;
    attentionCost = "any";
    suggestedWindowStart = "07:00";
  }
  if (/\b(doctor|dentist|appointment)\b/.test(text)) {
    estimatedMinutes = 60;
    attentionCost = "any";
    suggestedWindowStart = "11:00";
  }

  const endMin = suggestedWindowStart
    ? (() => {
        const [h, m] = suggestedWindowStart!.split(":").map(Number);
        const total = h * 60 + m + estimatedMinutes;
        return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
      })()
    : null;

  return {
    estimatedMinutes,
    attentionCost,
    suggestedDate: suggestedWindowStart ? day : null,
    suggestedWindowStart,
    suggestedWindowEnd: endMin,
    rationale: "Heuristic estimate (no LLM key configured).",
    confidence: "low",
  };
}

function llmConfigured() {
  return Boolean(process.env.OPENAI_API_KEY);
}

export async function analyzeTaskTiming(
  title: string,
  notes?: string | null,
  today?: string,
): Promise<TaskAnalysis & { source: "llm" | "heuristic" }> {
  const todayStr = today ?? new Date().toISOString().slice(0, 10);
  if (!llmConfigured()) {
    return { ...heuristicAnalyze(title, notes, todayStr), source: "heuristic" };
  }

  const baseUrl = (process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1").replace(
    /\/$/,
    "",
  );
  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM },
        {
          role: "user",
          content: JSON.stringify({
            title,
            notes: notes ?? null,
            today: todayStr,
          }),
        },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    console.warn("LLM analyze failed, falling back:", res.status, errText);
    return { ...heuristicAnalyze(title, notes, todayStr), source: "heuristic" };
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    return { ...heuristicAnalyze(title, notes, todayStr), source: "heuristic" };
  }

  try {
    const parsed = TaskAnalysisSchema.parse(JSON.parse(content));
    return { ...parsed, source: "llm" };
  } catch {
    return { ...heuristicAnalyze(title, notes, todayStr), source: "heuristic" };
  }
}
