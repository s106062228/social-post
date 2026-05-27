-- CreateTable
CREATE TABLE "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "version" TEXT,
    "publishedAt" TIMESTAMP(3) NOT NULL,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserChangelogView" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserChangelogView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChangelogEntry_isPublished_publishedAt_idx" ON "ChangelogEntry"("isPublished", "publishedAt" DESC);

-- CreateIndex
CREATE INDEX "ChangelogEntry_publishedAt_idx" ON "ChangelogEntry"("publishedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "UserChangelogView_userId_entryId_key" ON "UserChangelogView"("userId", "entryId");

-- CreateIndex
CREATE INDEX "UserChangelogView_userId_idx" ON "UserChangelogView"("userId");

-- CreateIndex
CREATE INDEX "UserChangelogView_entryId_idx" ON "UserChangelogView"("entryId");

-- AddForeignKey
ALTER TABLE "UserChangelogView" ADD CONSTRAINT "UserChangelogView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserChangelogView" ADD CONSTRAINT "UserChangelogView_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "ChangelogEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
