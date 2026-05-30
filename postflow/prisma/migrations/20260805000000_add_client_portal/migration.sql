-- CreateTable
CREATE TABLE "ClientPortal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "accentColor" TEXT NOT NULL DEFAULT '#6366f1',
    "showCalendar" BOOLEAN NOT NULL DEFAULT true,
    "showAnalytics" BOOLEAN NOT NULL DEFAULT true,
    "showPosts" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientPortal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientPortal_slug_key" ON "ClientPortal"("slug");

-- CreateIndex
CREATE INDEX "ClientPortal_userId_idx" ON "ClientPortal"("userId");

-- CreateIndex
CREATE INDEX "ClientPortal_slug_idx" ON "ClientPortal"("slug");

-- AddForeignKey
ALTER TABLE "ClientPortal" ADD CONSTRAINT "ClientPortal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
