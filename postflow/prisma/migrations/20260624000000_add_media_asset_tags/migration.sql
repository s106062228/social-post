-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN "description" TEXT,
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
