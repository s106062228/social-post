-- CreateTable
CREATE TABLE "RssFeed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "autoCreate" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RssFeed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RssItem" (
    "id" TEXT NOT NULL,
    "feedId" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "link" TEXT,
    "imageUrl" TEXT,
    "publishedAt" TIMESTAMP(3),
    "postId" TEXT,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RssItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RssFeed_userId_url_key" ON "RssFeed"("userId", "url");

-- CreateIndex
CREATE INDEX "RssFeed_userId_idx" ON "RssFeed"("userId");

-- CreateIndex
CREATE INDEX "RssFeed_userId_createdAt_idx" ON "RssFeed"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "RssItem_feedId_guid_key" ON "RssItem"("feedId", "guid");

-- CreateIndex
CREATE INDEX "RssItem_feedId_idx" ON "RssItem"("feedId");

-- CreateIndex
CREATE INDEX "RssItem_postId_idx" ON "RssItem"("postId");

-- CreateIndex
CREATE INDEX "RssItem_feedId_importedAt_idx" ON "RssItem"("feedId", "importedAt" DESC);

-- AddForeignKey
ALTER TABLE "RssFeed" ADD CONSTRAINT "RssFeed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssItem" ADD CONSTRAINT "RssItem_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "RssFeed"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RssItem" ADD CONSTRAINT "RssItem_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;
