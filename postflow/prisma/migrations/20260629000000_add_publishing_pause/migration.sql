-- AlterTable
ALTER TABLE "User" ADD COLUMN "publishingPaused" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "publishingPausedReason" TEXT;
ALTER TABLE "User" ADD COLUMN "publishingPausedAt" TIMESTAMP(3);
