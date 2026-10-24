import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { applyTemplateToTask } from "@server/domain/templates";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: taskId } = await params;
    const body = await req.json();
    const { templateId } = body;

    if (!templateId || typeof templateId !== "string") {
      return NextResponse.json({ error: "Template ID required" }, { status: 400 });
    }

    const items = await applyTemplateToTask(taskId, templateId);
    return NextResponse.json({ items });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not apply template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
