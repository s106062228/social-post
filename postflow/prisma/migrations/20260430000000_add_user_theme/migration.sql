-- AlterTable: add theme preference to User
ALTER TABLE "User" ADD COLUMN "theme" TEXT NOT NULL DEFAULT 'system';
