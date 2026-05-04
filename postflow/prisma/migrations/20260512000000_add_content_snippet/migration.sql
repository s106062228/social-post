-- CreateTable
CREATE TABLE "ContentSnippet" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentSnippet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentSnippet_userId_idx" ON "ContentSnippet"("userId");

-- CreateIndex
CREATE INDEX "ContentSnippet_userId_category_idx" ON "ContentSnippet"("userId", "category");

-- CreateIndex
CREATE INDEX "ContentSnippet_userId_createdAt_idx" ON "ContentSnippet"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ContentSnippet" ADD CONSTRAINT "ContentSnippet_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
