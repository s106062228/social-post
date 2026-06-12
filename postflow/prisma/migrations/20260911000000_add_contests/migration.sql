-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED');

-- CreateTable
CREATE TABLE "Contest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "platform" "Platform",
    "postId" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "prizeDescription" TEXT,
    "requiredAction" TEXT NOT NULL DEFAULT 'comment',
    "winnersCount" INTEGER NOT NULL DEFAULT 1,
    "status" "ContestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContestEntry" (
    "id" TEXT NOT NULL,
    "contestId" TEXT NOT NULL,
    "participantName" TEXT NOT NULL,
    "participantHandle" TEXT NOT NULL,
    "platform" "Platform",
    "entryType" TEXT NOT NULL DEFAULT 'manual',
    "metadata" JSONB,
    "isWinner" BOOLEAN NOT NULL DEFAULT false,
    "pickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContestEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contest_userId_idx" ON "Contest"("userId");

-- CreateIndex
CREATE INDEX "Contest_userId_createdAt_idx" ON "Contest"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Contest_status_idx" ON "Contest"("status");

-- CreateIndex
CREATE INDEX "ContestEntry_contestId_idx" ON "ContestEntry"("contestId");

-- CreateIndex
CREATE INDEX "ContestEntry_contestId_isWinner_idx" ON "ContestEntry"("contestId", "isWinner");

-- CreateIndex
CREATE INDEX "ContestEntry_contestId_createdAt_idx" ON "ContestEntry"("contestId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contest" ADD CONSTRAINT "Contest_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContestEntry" ADD CONSTRAINT "ContestEntry_contestId_fkey" FOREIGN KEY ("contestId") REFERENCES "Contest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
