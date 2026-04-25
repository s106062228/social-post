-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "Post" ADD COLUMN "approverNote" TEXT;
