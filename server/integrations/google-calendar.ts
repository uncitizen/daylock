import { google } from "googleapis";
import { prisma } from "../db/client";

function oauthClient() {
  return new google.auth.OAuth2(
    process.env.AUTH_GOOGLE_ID,
    process.env.AUTH_GOOGLE_SECRET,
    `${process.env.AUTH_URL ?? "http://localhost:3000"}/api/auth/callback/google`,
  );
}

export async function upsertGoogleCalendarTokens(
  userId: string,
  tokens: {
    access_token?: string | null;
    refresh_token?: string | null;
    expiry_date?: number | null;
    scope?: string | null;
  },
) {
  if (!tokens.access_token) return;
  await prisma.googleCalendarToken.upsert({
    where: { userId },
    create: {
      userId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope ?? null,
    },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? undefined,
      expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
      scope: tokens.scope ?? undefined,
    },
  });
}

async function getAuthedCalendar(userId: string) {
  const stored = await prisma.googleCalendarToken.findUnique({ where: { userId } });
  if (!stored?.accessToken) return null;

  const client = oauthClient();
  client.setCredentials({
    access_token: stored.accessToken,
    refresh_token: stored.refreshToken,
    expiry_date: stored.expiresAt?.getTime(),
  });

  client.on("tokens", async (tokens) => {
    await upsertGoogleCalendarTokens(userId, tokens);
  });

  return google.calendar({ version: "v3", auth: client });
}

export async function syncGoogleCalendar(userId: string, daysAhead = 14) {
  const calendar = await getAuthedCalendar(userId);
  if (!calendar) {
    return { synced: 0, error: "NO_TOKEN" as const };
  }

  const timeMin = new Date();
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin);
  timeMax.setDate(timeMax.getDate() + daysAhead);

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    maxResults: 250,
  });

  const events = res.data.items ?? [];
  let synced = 0;

  for (const ev of events) {
    if (!ev.id || !ev.start || !ev.end) continue;
    const start = ev.start.dateTime
      ? new Date(ev.start.dateTime)
      : new Date(ev.start.date + "T00:00:00");
    const end = ev.end.dateTime
      ? new Date(ev.end.dateTime)
      : new Date(ev.end.date + "T23:59:59");
    const allDay = Boolean(ev.start.date && !ev.start.dateTime);

    await prisma.calendarEventCache.upsert({
      where: { userId_googleEventId: { userId, googleEventId: ev.id } },
      create: {
        userId,
        googleEventId: ev.id,
        title: ev.summary ?? "(No title)",
        location: ev.location ?? null,
        description: ev.description ?? null,
        start,
        end,
        allDay,
        moveable: false,
        syncedAt: new Date(),
      },
      update: {
        title: ev.summary ?? "(No title)",
        location: ev.location ?? null,
        description: ev.description ?? null,
        start,
        end,
        allDay,
        syncedAt: new Date(),
        // preserve attentionMode override
      },
    });
    synced++;
  }

  return { synced, error: null };
}

export async function listCalendarEvents(userId: string, from: Date, to: Date) {
  return prisma.calendarEventCache.findMany({
    where: {
      userId,
      start: { lte: to },
      end: { gte: from },
    },
    orderBy: { start: "asc" },
  });
}

export async function updateEventAttentionMode(
  userId: string,
  eventId: string,
  attentionMode: "full" | "partial" | "idle",
) {
  return prisma.calendarEventCache.updateMany({
    where: { id: eventId, userId },
    data: { attentionMode },
  });
}

export async function hasCalendarConnection(userId: string) {
  const token = await prisma.googleCalendarToken.findUnique({
    where: { userId },
    select: { id: true, scope: true },
  });
  if (!token) return { connected: false as const, canWrite: false as const };
  const scope = token.scope ?? "";
  const canWrite =
    scope.includes("auth/calendar.events") ||
    (scope.includes("auth/calendar") && !scope.includes("calendar.readonly"));
  return { connected: true as const, canWrite };
}

export async function createGoogleCalendarEvent(
  userId: string,
  input: {
    title: string;
    description?: string | null;
    start: Date;
    end: Date;
    allDay?: boolean;
    /** YYYY-MM-DD when allDay */
    date?: string;
  },
) {
  const calendar = await getAuthedCalendar(userId);
  if (!calendar) {
    return { error: "NO_TOKEN" as const, event: null };
  }

  try {
    let requestBody: {
      summary: string;
      description: string;
      start: { date?: string; dateTime?: string };
      end: { date?: string; dateTime?: string };
    };

    if (input.allDay && input.date) {
      const [y, m, d] = input.date.split("-").map(Number);
      const next = new Date(y, m - 1, d + 1);
      const endDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
      requestBody = {
        summary: input.title,
        description: input.description
          ? `${input.description}\n\n(Scheduled from Daylock)`
          : "Scheduled from Daylock",
        start: { date: input.date },
        end: { date: endDate },
      };
    } else {
      requestBody = {
        summary: input.title,
        description: input.description
          ? `${input.description}\n\n(Scheduled from Daylock)`
          : "Scheduled from Daylock",
        start: { dateTime: input.start.toISOString() },
        end: { dateTime: input.end.toISOString() },
      };
    }

    const res = await calendar.events.insert({
      calendarId: "primary",
      requestBody,
    });

    const ev = res.data;
    if (!ev.id || !ev.start || !ev.end) {
      return { error: "CREATE_FAILED" as const, event: null };
    }

    const start = ev.start.dateTime
      ? new Date(ev.start.dateTime)
      : new Date((ev.start.date ?? input.date!) + "T00:00:00");
    const end = ev.end.dateTime
      ? new Date(ev.end.dateTime)
      : new Date((ev.end.date ?? input.date!) + "T23:59:59");
    const allDay = Boolean(ev.start.date && !ev.start.dateTime);

    const cached = await prisma.calendarEventCache.upsert({
      where: { userId_googleEventId: { userId, googleEventId: ev.id } },
      create: {
        userId,
        googleEventId: ev.id,
        title: ev.summary ?? input.title,
        location: ev.location ?? null,
        description: ev.description ?? null,
        start,
        end,
        allDay,
        moveable: false,
        attentionMode: "full",
        syncedAt: new Date(),
      },
      update: {
        title: ev.summary ?? input.title,
        start,
        end,
        allDay,
        syncedAt: new Date(),
      },
    });

    return { error: null, event: cached, googleEventId: ev.id };
  } catch (err) {
    console.error("createGoogleCalendarEvent failed", err);
    return { error: "CREATE_FAILED" as const, event: null };
  }
}
