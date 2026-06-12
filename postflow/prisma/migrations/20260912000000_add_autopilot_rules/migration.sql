-- CreateEnum
CREATE TYPE "TriggerType" AS ENUM ('QUEUE_EMPTY', 'LOW_ENGAGEMENT', 'EVERGREEN_DUE', 'POSTING_GAP', 'DAILY_SCHEDULE');

-- CreateEnum
CREATE TYPE "ActionType" AS ENUM ('PUBLISH_EVERGREEN', 'RESCHEDULE_POST', 'SEND_NOTIFICATION', 'PAUSE_PUBLISHING', 'CREATE_FROM_TEMPLATE');

-- CreateTable
CREATE TABLE "AutopilotRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "trigger" "TriggerType" NOT NULL,
    "conditionJson" JSONB NOT NULL,
    "action" "ActionType" NOT NULL,
    "actionDataJson" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AutopilotRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutopilotRule_userId_idx" ON "AutopilotRule"("userId");

-- CreateIndex
CREATE INDEX "AutopilotRule_userId_isActive_idx" ON "AutopilotRule"("userId", "isActive");

-- CreateIndex
CREATE INDEX "AutopilotRule_userId_createdAt_idx" ON "AutopilotRule"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AutopilotRule" ADD CONSTRAINT "AutopilotRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
