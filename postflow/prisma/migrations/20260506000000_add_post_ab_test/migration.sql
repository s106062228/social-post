-- CreateTable
CREATE TABLE "PostABTest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postAId" TEXT NOT NULL,
    "postBId" TEXT NOT NULL,
    "winner" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PostABTest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostABTest_userId_idx" ON "PostABTest"("userId");

-- CreateIndex
CREATE INDEX "PostABTest_userId_createdAt_idx" ON "PostABTest"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "PostABTest" ADD CONSTRAINT "PostABTest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostABTest" ADD CONSTRAINT "PostABTest_postAId_fkey" FOREIGN KEY ("postAId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostABTest" ADD CONSTRAINT "PostABTest_postBId_fkey" FOREIGN KEY ("postBId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
