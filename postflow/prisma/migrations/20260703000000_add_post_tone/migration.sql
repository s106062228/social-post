-- AlterTable: add tone fields to Post
ALTER TABLE "Post" ADD COLUMN "tone" TEXT;
ALTER TABLE "Post" ADD COLUMN "toneTraits" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Index for tone filtering
CREATE INDEX "Post_userId_tone_idx" ON "Post"("userId", "tone");
