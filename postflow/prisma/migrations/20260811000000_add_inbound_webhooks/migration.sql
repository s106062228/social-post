-- CreateTable
CREATE TABLE "InboundWebhook" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "fieldMapping" JSONB NOT NULL DEFAULT '{}',
    "defaultPlatforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMP(3),
    "triggerCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboundWebhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookTriggerLog" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL,
    "statusCode" INTEGER NOT NULL,
    "requestBody" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookTriggerLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboundWebhook_userId_idx" ON "InboundWebhook"("userId");

-- CreateIndex
CREATE INDEX "InboundWebhook_userId_isActive_idx" ON "InboundWebhook"("userId", "isActive");

-- CreateIndex
CREATE INDEX "WebhookTriggerLog_webhookId_idx" ON "WebhookTriggerLog"("webhookId");

-- CreateIndex
CREATE INDEX "WebhookTriggerLog_webhookId_createdAt_idx" ON "WebhookTriggerLog"("webhookId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InboundWebhook" ADD CONSTRAINT "InboundWebhook_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookTriggerLog" ADD CONSTRAINT "WebhookTriggerLog_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "InboundWebhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;
