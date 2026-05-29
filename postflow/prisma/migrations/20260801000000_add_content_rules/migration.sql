-- CreateEnum
CREATE TYPE "RuleType" AS ENUM ('REQUIRED_HASHTAG', 'FORBIDDEN_WORD', 'MIN_LENGTH', 'MAX_HASHTAGS', 'REQUIRED_CTA', 'CUSTOM_REGEX');

-- CreateEnum
CREATE TYPE "RuleSeverity" AS ENUM ('ERROR', 'WARNING');

-- CreateTable
CREATE TABLE "ContentRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "RuleType" NOT NULL,
    "value" TEXT NOT NULL,
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "severity" "RuleSeverity" NOT NULL DEFAULT 'WARNING',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContentRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentRule_userId_idx" ON "ContentRule"("userId");

-- CreateIndex
CREATE INDEX "ContentRule_userId_isActive_idx" ON "ContentRule"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "ContentRule" ADD CONSTRAINT "ContentRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
