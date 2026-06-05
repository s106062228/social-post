-- CreateEnum
CREATE TYPE "MentionSentiment" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateTable
CREATE TABLE "BrandMention" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mentionUrl" TEXT,
    "platform" TEXT,
    "authorName" TEXT,
    "content" TEXT NOT NULL,
    "sentiment" "MentionSentiment" NOT NULL DEFAULT 'NEUTRAL',
    "notes" TEXT,
    "responseStatus" TEXT NOT NULL DEFAULT 'none',
    "relatedPostId" TEXT,
    "mentionedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandMention_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BrandMention_userId_mentionedAt_idx" ON "BrandMention"("userId", "mentionedAt" DESC);

-- CreateIndex
CREATE INDEX "BrandMention_userId_sentiment_idx" ON "BrandMention"("userId", "sentiment");

-- CreateIndex
CREATE INDEX "BrandMention_userId_responseStatus_idx" ON "BrandMention"("userId", "responseStatus");

-- AddForeignKey
ALTER TABLE "BrandMention" ADD CONSTRAINT "BrandMention_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandMention" ADD CONSTRAINT "BrandMention_relatedPostId_fkey" FOREIGN KEY ("relatedPostId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
