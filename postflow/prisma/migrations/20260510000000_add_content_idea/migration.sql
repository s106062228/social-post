-- CreateEnum
CREATE TYPE "IdeaStatus" AS ENUM ('IDEA', 'RESEARCHING', 'DRAFTING', 'REVIEW', 'DONE');

-- CreateTable
CREATE TABLE "ContentIdea" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "IdeaStatus" NOT NULL DEFAULT 'IDEA',
    "platform" "Platform",
    "notes" TEXT,
    "dueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentIdea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentIdea_userId_idx" ON "ContentIdea"("userId");

-- CreateIndex
CREATE INDEX "ContentIdea_userId_status_idx" ON "ContentIdea"("userId", "status");

-- CreateIndex
CREATE INDEX "ContentIdea_userId_createdAt_idx" ON "ContentIdea"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ContentIdea" ADD CONSTRAINT "ContentIdea_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
