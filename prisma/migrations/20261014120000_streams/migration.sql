-- CreateEnum
CREATE TYPE "MyDaySource" AS ENUM ('manual', 'suggested');

-- AlterTable
ALTER TABLE "lists" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "color" TEXT,
ADD COLUMN     "weight" INTEGER NOT NULL DEFAULT 20;

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "goalId" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "my_day_items" ADD COLUMN     "source" "MyDaySource" NOT NULL DEFAULT 'manual';

-- CreateTable
CREATE TABLE "goals" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "goals_listId_idx" ON "goals"("listId");

-- CreateIndex
CREATE INDEX "tasks_goalId_idx" ON "tasks"("goalId");

-- AddForeignKey
ALTER TABLE "goals" ADD CONSTRAINT "goals_listId_fkey" FOREIGN KEY ("listId") REFERENCES "lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

