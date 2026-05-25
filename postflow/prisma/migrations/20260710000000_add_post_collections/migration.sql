-- CreateTable
CREATE TABLE "PostCollection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PostCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionPost" (
    "collectionId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CollectionPost_pkey" PRIMARY KEY ("collectionId","postId")
);

-- CreateIndex
CREATE INDEX "PostCollection_userId_idx" ON "PostCollection"("userId");
CREATE INDEX "PostCollection_userId_createdAt_idx" ON "PostCollection"("userId", "createdAt" DESC);
CREATE INDEX "CollectionPost_collectionId_idx" ON "CollectionPost"("collectionId");
CREATE INDEX "CollectionPost_postId_idx" ON "CollectionPost"("postId");

-- AddForeignKey
ALTER TABLE "PostCollection" ADD CONSTRAINT "PostCollection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionPost" ADD CONSTRAINT "CollectionPost_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "PostCollection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CollectionPost" ADD CONSTRAINT "CollectionPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
