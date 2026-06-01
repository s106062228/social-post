-- CreateTable
CREATE TABLE "FeedToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FeedToken_userId_key" ON "FeedToken"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "FeedToken_token_key" ON "FeedToken"("token");

-- CreateIndex
CREATE INDEX "FeedToken_token_idx" ON "FeedToken"("token");

-- AddForeignKey
ALTER TABLE "FeedToken" ADD CONSTRAINT "FeedToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
