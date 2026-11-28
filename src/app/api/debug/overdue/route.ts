import { NextResponse } from "next/server";
import { prisma } from "@server/db/client";
import { startOfDay } from "date-fns";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const today = startOfDay(new Date());
    
    const overdueTasks = await prisma.task.findMany({
      where: {
        kind: "flex",
        completedAt: null,
        archivedAt: null,
        dueAt: { lt: today },
      },
      include: {
        list: {
          select: {
            name: true,
            isInbox: true,
            workspace: {
              select: {
                memberships: {
                  select: {
                    user: {
                      select: {
                        email: true,
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      orderBy: { dueAt: "desc" },
    });

    const formatted = overdueTasks.map(task => ({
      id: task.id,
      title: task.title,
      dueAt: task.dueAt?.toISOString(),
      list: task.list.isInbox ? 'Inbox' : task.list.name,
      userEmails: task.list.workspace.memberships.map(m => m.user.email),
    }));

    return NextResponse.json({
      count: overdueTasks.length,
      today: today.toISOString(),
      tasks: formatted,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
