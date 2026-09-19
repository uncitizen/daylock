import { prisma } from "../server/db/client";
import { getMyDay } from "../server/domain/my-day";

async function main() {
  const r = await prisma.$executeRawUnsafe(
    `UPDATE recurrence_rules SET "activeMonths" = ARRAY[]::integer[] WHERE "activeMonths" IS NULL`,
  );
  console.log("backfilled", r);
  const user = await prisma.user.findFirst();
  if (!user) {
    console.log("no user");
    return;
  }
  const day = await getMyDay(user.id, new Date());
  console.log("ok timeline", day.timeline.length);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
