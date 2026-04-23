-- CreateTable
CREATE TABLE "HashtagGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hashtags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashtagGroup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "HashtagGroup_userId_name_key" ON "HashtagGroup"("userId", "name");

-- CreateIndex
CREATE INDEX "HashtagGroup_userId_idx" ON "HashtagGroup"("userId");

-- CreateIndex
CREATE INDEX "HashtagGroup_userId_createdAt_idx" ON "HashtagGroup"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HashtagGroup" ADD CONSTRAINT "HashtagGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
