-- CreateTable
CREATE TABLE "UtmPreset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "medium" TEXT NOT NULL,
    "campaign" TEXT,
    "content" TEXT,
    "term" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UtmPreset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "UtmPreset_userId_idx" ON "UtmPreset"("userId");

-- CreateIndex
CREATE INDEX "UtmPreset_userId_isDefault_idx" ON "UtmPreset"("userId", "isDefault");

-- CreateIndex
CREATE INDEX "UtmPreset_userId_createdAt_idx" ON "UtmPreset"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "UtmPreset" ADD CONSTRAINT "UtmPreset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
