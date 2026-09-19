import webpush from "web-push";
import { prisma } from "../db/client";

function configureWebPush() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:you@example.com";
  if (!publicKey || !privateKey) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function savePushSubscription(
  userId: string,
  endpoint: string,
  p256dh: string,
  auth: string,
) {
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { userId, endpoint, p256dh, auth },
    update: { userId, p256dh, auth },
  });
}

export async function deliverDueAlarms() {
  const configured = configureWebPush();
  const now = new Date();
  const due = await prisma.alarmEvent.findMany({
    where: { deliveredAt: null, fireAt: { lte: now } },
    include: {
      occurrence: {
        include: {
          task: {
            include: {
              list: {
                include: {
                  workspace: { include: { memberships: true } },
                },
              },
            },
          },
        },
      },
    },
    take: 50,
  });

  let sent = 0;
  for (const alarm of due) {
    const members = alarm.occurrence.task.list.workspace.memberships;
    const payload = JSON.stringify({
      title:
        alarm.level >= 3
          ? `⚠ PANIC: ${alarm.occurrence.task.title}`
          : `Due: ${alarm.occurrence.task.title}`,
      body:
        alarm.channel === "email"
          ? "Escalated reminder — check My Day."
          : `Hard task still incomplete (level ${alarm.level}).`,
      occurrenceId: alarm.occurrenceId,
      level: alarm.level,
    });

    for (const member of members) {
      if (alarm.channel === "email") {
        // Phase 1: log email fallback; wire SMTP later
        console.info(`[alarm:email] user=${member.userId} ${payload}`);
        continue;
      }
      if (!configured) {
        console.info(`[alarm:webpush:dry] user=${member.userId} ${payload}`);
        continue;
      }
      const subs = await prisma.pushSubscription.findMany({
        where: { userId: member.userId },
      });
      for (const sub of subs) {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            payload,
          );
          sent++;
        } catch (err) {
          console.warn("webpush failed", err);
          // stale subscription
          const statusCode = (err as { statusCode?: number })?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            await prisma.pushSubscription.delete({ where: { id: sub.id } });
          }
        }
      }
    }

    await prisma.alarmEvent.update({
      where: { id: alarm.id },
      data: { deliveredAt: new Date() },
    });
  }

  return { processed: due.length, sent };
}
