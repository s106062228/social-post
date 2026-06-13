-- AlterTable: add sentiment fields to SocialComment
ALTER TABLE "SocialComment" ADD COLUMN "sentiment" TEXT;
ALTER TABLE "SocialComment" ADD COLUMN "sentimentScore" DOUBLE PRECISION;
