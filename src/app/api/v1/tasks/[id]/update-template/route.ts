import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateTemplateFromTask } from "@/server/domain/templates";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: taskId } = await params;
    const template = await updateTemplateFromTask(taskId);
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
