# Migration Instructions for Production

The templates and checklists feature requires new database tables.

## Quick Fix

The migration should run automatically via the `vercel-build` script, but if deployment failed:

1. Check that `DATABASE_URL` environment variable is set in Vercel
2. Manually run the migration with your production DATABASE_URL:

```bash
npx prisma migrate deploy
```

This will apply the pending migration: `20261024_add_templates_and_checklists`

## Alternative: Run SQL Directly

If you have direct database access to your Neon/Postgres production database, execute this SQL:

```sql
-- CreateTable
CREATE TABLE "task_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_checklist_items" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_checklist_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checklist_items" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "checked" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_items_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN "templateId" TEXT;

-- CreateIndex
CREATE INDEX "template_checklist_items_templateId_idx" ON "template_checklist_items"("templateId");

-- CreateIndex
CREATE INDEX "checklist_items_taskId_idx" ON "checklist_items"("taskId");

-- AddForeignKey
ALTER TABLE "template_checklist_items" ADD CONSTRAINT "template_checklist_items_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

## Verify It Worked

After running the migration, the deployment should succeed and you can test at:
https://daylock-xi.vercel.app/templates

## Troubleshooting

If deployment continues to fail:

1. **Check Vercel environment variables**: Ensure `DATABASE_URL` is set for Production environment
2. **Check build logs**: View deployment logs at https://vercel.com/iseine/daylock
3. **Retry deployment**: Push a small change to trigger new deployment after migration is applied
4. **Check database connection**: Ensure the production database is accessible from Vercel
