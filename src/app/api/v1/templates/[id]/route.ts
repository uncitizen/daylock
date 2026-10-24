import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateTemplate, deleteTemplate } from "@/server/domain/templates";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    const body = await req.json();
    const { name, sortOrder } = body;

    const template = await updateTemplate(id, { name, sortOrder });
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id } = await params;
    await deleteTemplate(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
