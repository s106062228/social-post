-- AlterTable
ALTER TABLE "Template" ADD COLUMN "marketplacePublished" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Template" ADD COLUMN "marketplaceCategory" TEXT;
ALTER TABLE "Template" ADD COLUMN "marketplaceTags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Template" ADD COLUMN "importCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TemplateImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TemplateImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TemplateImport_userId_templateId_key" ON "TemplateImport"("userId", "templateId");

-- CreateIndex
CREATE INDEX "TemplateImport_userId_idx" ON "TemplateImport"("userId");

-- CreateIndex
CREATE INDEX "Template_marketplacePublished_importCount_idx" ON "Template"("marketplacePublished", "importCount" DESC);

-- AddForeignKey
ALTER TABLE "TemplateImport" ADD CONSTRAINT "TemplateImport_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
