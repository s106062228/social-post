-- CreateTable
CREATE TABLE "SmartList" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "filters" JSONB NOT NULL DEFAULT '{}',
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SmartList_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SmartList_userId_idx" ON "SmartList"("userId");

-- CreateIndex
CREATE INDEX "SmartList_userId_pinned_idx" ON "SmartList"("userId", "pinned");

-- AddForeignKey
ALTER TABLE "SmartList" ADD CONSTRAINT "SmartList_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
