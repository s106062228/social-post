-- CreateEnum
CREATE TYPE "OutreachStatus" AS ENUM ('PROSPECT', 'CONTACTED', 'RESPONDED', 'NEGOTIATING', 'AGREED', 'COMPLETED', 'DECLINED');

-- CreateTable
CREATE TABLE "InfluencerProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "platform" "Platform",
    "followerCount" INTEGER,
    "engagementRate" DOUBLE PRECISION,
    "niche" TEXT,
    "email" TEXT,
    "profileUrl" TEXT,
    "outreachStatus" "OutreachStatus" NOT NULL DEFAULT 'PROSPECT',
    "notes" TEXT,
    "lastContactedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InfluencerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InfluencerProfile_userId_idx" ON "InfluencerProfile"("userId");

-- CreateIndex
CREATE INDEX "InfluencerProfile_userId_outreachStatus_idx" ON "InfluencerProfile"("userId", "outreachStatus");

-- CreateIndex
CREATE INDEX "InfluencerProfile_userId_createdAt_idx" ON "InfluencerProfile"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InfluencerProfile" ADD CONSTRAINT "InfluencerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
