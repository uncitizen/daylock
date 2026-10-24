import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { updateChecklistItem, deleteChecklistItem } from "@server/domain/templates";

type Params = { params: Promise<{ id: string; itemId: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { itemId } = await params;
    const body = await req.json();
    const { title, checked, sortOrder } = body;

    const item = await updateChecklistItem(itemId, { title, checked, sortOrder });
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { itemId } = await params;
    await deleteChecklistItem(itemId);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
