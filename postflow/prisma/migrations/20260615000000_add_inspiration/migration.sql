-- CreateTable
CREATE TABLE "InspirationItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "description" TEXT,
    "imageUrl" TEXT,
    "notes" TEXT,
    "platform" "Platform",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InspirationItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InspirationItem_userId_idx" ON "InspirationItem"("userId");

-- CreateIndex
CREATE INDEX "InspirationItem_userId_createdAt_idx" ON "InspirationItem"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "InspirationItem" ADD CONSTRAINT "InspirationItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
