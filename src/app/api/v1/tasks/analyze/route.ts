import { requireUser, jsonOk, jsonError } from "@/lib/api";
import { AnalyzeRequestSchema, analyzeTaskTiming } from "@server/integrations/llm";

export async function POST(req: Request) {
  const authResult = await requireUser();
  if ("error" in authResult) return authResult.error;

  const body = await req.json().catch(() => null);
  const parsed = AnalyzeRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(parsed.error.message);

  const analysis = await analyzeTaskTiming(
    parsed.data.title,
    parsed.data.notes,
    parsed.data.today,
  );
  return jsonOk({ analysis });
}
