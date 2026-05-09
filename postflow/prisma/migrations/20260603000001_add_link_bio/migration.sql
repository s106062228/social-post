-- CreateTable
CREATE TABLE "LinkBioPage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bio" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkBioPage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LinkBioItem" (
    "id" TEXT NOT NULL,
    "pageId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "icon" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LinkBioItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkBioPage_slug_key" ON "LinkBioPage"("slug");

-- CreateIndex
CREATE INDEX "LinkBioPage_userId_idx" ON "LinkBioPage"("userId");

-- CreateIndex
CREATE INDEX "LinkBioPage_slug_idx" ON "LinkBioPage"("slug");

-- CreateIndex
CREATE INDEX "LinkBioPage_userId_createdAt_idx" ON "LinkBioPage"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "LinkBioItem_pageId_idx" ON "LinkBioItem"("pageId");

-- CreateIndex
CREATE INDEX "LinkBioItem_pageId_order_idx" ON "LinkBioItem"("pageId", "order");

-- AddForeignKey
ALTER TABLE "LinkBioPage" ADD CONSTRAINT "LinkBioPage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkBioItem" ADD CONSTRAINT "LinkBioItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "LinkBioPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
