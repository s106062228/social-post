-- CreateTable: SlackIntegration
CREATE TABLE "SlackIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceName" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SlackIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DiscordIntegration
CREATE TABLE "DiscordIntegration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channelName" TEXT NOT NULL,
    "webhookUrl" TEXT NOT NULL,
    "events" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SlackIntegration_userId_idx" ON "SlackIntegration"("userId");
CREATE INDEX "SlackIntegration_userId_isActive_idx" ON "SlackIntegration"("userId", "isActive");
CREATE INDEX "SlackIntegration_userId_createdAt_idx" ON "SlackIntegration"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "DiscordIntegration_userId_idx" ON "DiscordIntegration"("userId");
CREATE INDEX "DiscordIntegration_userId_isActive_idx" ON "DiscordIntegration"("userId", "isActive");
CREATE INDEX "DiscordIntegration_userId_createdAt_idx" ON "DiscordIntegration"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "SlackIntegration" ADD CONSTRAINT "SlackIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordIntegration" ADD CONSTRAINT "DiscordIntegration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
