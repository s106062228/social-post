-- CreateTable
CREATE TABLE "PostQueueSlot" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "platform" "Platform",
    "hour" INTEGER NOT NULL,
    "minute" INTEGER NOT NULL DEFAULT 0,
    "daysOfWeek" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostQueueSlot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostQueueSlot_userId_idx" ON "PostQueueSlot"("userId");

-- CreateIndex
CREATE INDEX "PostQueueSlot_userId_isActive_idx" ON "PostQueueSlot"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "PostQueueSlot" ADD CONSTRAINT "PostQueueSlot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
