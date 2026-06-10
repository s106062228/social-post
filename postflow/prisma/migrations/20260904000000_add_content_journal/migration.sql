-- CreateEnum
CREATE TYPE "JournalEntryType" AS ENUM ('SUCCESS', 'FAILURE', 'INSIGHT', 'HYPOTHESIS', 'EXPERIMENT');

-- CreateTable
CREATE TABLE "ContentJournalEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT,
    "title" TEXT NOT NULL,
    "entryType" "JournalEntryType" NOT NULL DEFAULT 'INSIGHT',
    "content" TEXT NOT NULL,
    "rating" INTEGER,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublicToTeam" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentJournalEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentJournalEntry_userId_idx" ON "ContentJournalEntry"("userId");

-- CreateIndex
CREATE INDEX "ContentJournalEntry_userId_createdAt_idx" ON "ContentJournalEntry"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ContentJournalEntry_postId_idx" ON "ContentJournalEntry"("postId");

-- CreateIndex
CREATE INDEX "ContentJournalEntry_entryType_idx" ON "ContentJournalEntry"("entryType");

-- AddForeignKey
ALTER TABLE "ContentJournalEntry" ADD CONSTRAINT "ContentJournalEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentJournalEntry" ADD CONSTRAINT "ContentJournalEntry_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
