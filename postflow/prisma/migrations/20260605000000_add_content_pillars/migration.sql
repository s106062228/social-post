-- CreateTable
CREATE TABLE "ContentPillar" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentPillar_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "pillarId" TEXT;

-- CreateIndex
CREATE INDEX "ContentPillar_userId_idx" ON "ContentPillar"("userId");

-- CreateIndex
CREATE INDEX "ContentPillar_userId_isActive_idx" ON "ContentPillar"("userId", "isActive");

-- CreateIndex
CREATE INDEX "Post_userId_pillarId_idx" ON "Post"("userId", "pillarId");

-- AddForeignKey
ALTER TABLE "ContentPillar" ADD CONSTRAINT "ContentPillar_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_pillarId_fkey" FOREIGN KEY ("pillarId") REFERENCES "ContentPillar"("id") ON DELETE SET NULL ON UPDATE CASCADE;
