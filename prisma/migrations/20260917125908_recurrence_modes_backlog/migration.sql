-- CreateEnum
CREATE TYPE "RecurrenceMode" AS ENUM ('habit', 'rolling', 'fixed');

-- AlterEnum
ALTER TYPE "OccurrenceStatus" ADD VALUE 'expired';

-- AlterTable
ALTER TABLE "recurrence_rules" ADD COLUMN     "activeMonths" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
ADD COLUMN     "mode" "RecurrenceMode" NOT NULL DEFAULT 'rolling',
ADD COLUMN     "nextDueAt" TIMESTAMP(3),
ADD COLUMN     "pauseUntil" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "task_occurrences" ADD COLUMN     "dueSince" DATE,
ADD COLUMN     "skipReason" TEXT;

-- CreateIndex
CREATE INDEX "task_occurrences_taskId_status_idx" ON "task_occurrences"("taskId", "status");
