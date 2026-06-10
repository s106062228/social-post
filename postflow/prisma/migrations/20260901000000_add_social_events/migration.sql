-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('HOLIDAY', 'OBSERVANCE', 'AWARENESS_DAY', 'CUSTOM');

-- CreateTable
CREATE TABLE "SocialEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "date" TEXT NOT NULL,
    "type" "EventType" NOT NULL DEFAULT 'CUSTOM',
    "platforms" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isGlobal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SocialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SocialEvent_date_idx" ON "SocialEvent"("date");

-- CreateIndex
CREATE INDEX "SocialEvent_userId_idx" ON "SocialEvent"("userId");

-- CreateIndex
CREATE INDEX "SocialEvent_isGlobal_idx" ON "SocialEvent"("isGlobal");

-- CreateIndex
CREATE INDEX "SocialEvent_type_idx" ON "SocialEvent"("type");

-- AddForeignKey
ALTER TABLE "SocialEvent" ADD CONSTRAINT "SocialEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
