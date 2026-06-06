-- CreateTable
CREATE TABLE "LinkHealthCheck" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "statusCode" INTEGER,
    "isHealthy" BOOLEAN NOT NULL,
    "errorMessage" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LinkHealthCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LinkHealthCheck_postId_url_key" ON "LinkHealthCheck"("postId", "url");

-- CreateIndex
CREATE INDEX "LinkHealthCheck_postId_checkedAt_idx" ON "LinkHealthCheck"("postId", "checkedAt" DESC);

-- CreateIndex
CREATE INDEX "LinkHealthCheck_userId_idx" ON "LinkHealthCheck"("userId");

-- AddForeignKey
ALTER TABLE "LinkHealthCheck" ADD CONSTRAINT "LinkHealthCheck_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LinkHealthCheck" ADD CONSTRAINT "LinkHealthCheck_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
