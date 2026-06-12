-- CreateTable
CREATE TABLE "HashtagRotation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "groupIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "currentIndex" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HashtagRotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HashtagRotation_userId_idx" ON "HashtagRotation"("userId");

-- CreateIndex
CREATE INDEX "HashtagRotation_userId_createdAt_idx" ON "HashtagRotation"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "HashtagRotation" ADD CONSTRAINT "HashtagRotation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
