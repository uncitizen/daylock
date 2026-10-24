import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { addTemplateItem } from "@server/domain/templates";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { id: templateId } = await params;
    const body = await req.json();
    const { title } = body;

    if (!title || typeof title !== "string") {
      return NextResponse.json({ error: "Title required" }, { status: 400 });
    }

    const item = await addTemplateItem(templateId, title);
    return NextResponse.json({ item });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not add item";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
