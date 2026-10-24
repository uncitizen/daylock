import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getTemplates, createTemplate } from "@server/domain/templates";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const templates = await getTemplates(session.user.id);
    return NextResponse.json({ templates });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load templates";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const { name, items } = body;
    
    if (!name || typeof name !== "string") {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }

    const template = await createTemplate(session.user.id, { name, items });
    return NextResponse.json({ template });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create template";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
