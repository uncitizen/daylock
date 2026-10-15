-- CreateTable
CREATE TABLE "shopping_stores" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_items" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "storeId" TEXT,
    "name" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shopping_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shopping_stores_workspaceId_idx" ON "shopping_stores"("workspaceId");

-- CreateIndex
CREATE INDEX "shopping_items_workspaceId_clearedAt_idx" ON "shopping_items"("workspaceId", "clearedAt");

-- CreateIndex
CREATE INDEX "shopping_items_storeId_idx" ON "shopping_items"("storeId");

-- AddForeignKey
ALTER TABLE "shopping_stores" ADD CONSTRAINT "shopping_stores_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_items" ADD CONSTRAINT "shopping_items_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "shopping_stores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

