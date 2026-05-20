-- CreateTable
CREATE TABLE "ThreadPost" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "mediaUrls" TEXT[],
    "mediaType" "MediaType" NOT NULL DEFAULT 'NONE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ThreadPost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ThreadPost_postId_idx" ON "ThreadPost"("postId");

-- CreateIndex
CREATE INDEX "ThreadPost_postId_order_idx" ON "ThreadPost"("postId", "order");

-- AddForeignKey
ALTER TABLE "ThreadPost" ADD CONSTRAINT "ThreadPost_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
