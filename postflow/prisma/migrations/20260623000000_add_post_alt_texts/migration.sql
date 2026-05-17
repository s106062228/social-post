-- AlterTable: add altTexts array column to Post
ALTER TABLE "Post" ADD COLUMN "altTexts" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
