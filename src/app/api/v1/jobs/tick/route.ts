import { NextResponse } from "next/server";
import {
  expireSoftPastOccurrences,
  materializeAllActiveRules,
  markMissedHardOccurrences,
} from "@server/domain/recurrence";
import { deliverDueAlarms } from "@server/domain/alarms";

function authorize(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization");
  return header === `Bearer ${secret}`;
}

/** Periodic job: expire soft past, materialize one open chip, hard misses, alarms. */
export async function POST(req: Request) {
  if (!authorize(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const expired = await expireSoftPastOccurrences();
  const rules = await materializeAllActiveRules();
  const missed = await markMissedHardOccurrences();
  const alarms = await deliverDueAlarms();

  return NextResponse.json({ expired, rules, missed, alarms });
}
