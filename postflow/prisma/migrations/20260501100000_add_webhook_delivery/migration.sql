-- AlterTable
ALTER TABLE "WebhookConfig" ADD COLUMN IF NOT EXISTS "deliveries" TEXT;

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "statusCode" INTEGER,
    "success" BOOLEAN NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebhookDelivery_configId_attemptedAt_idx" ON "WebhookDelivery"("configId", "attemptedAt" DESC);

-- AddForeignKey
ALTER TABLE "WebhookDelivery" ADD CONSTRAINT "WebhookDelivery_configId_fkey" FOREIGN KEY ("configId") REFERENCES "WebhookConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;
