-- CreateTable
CREATE TABLE "LegalDisclaimer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "platforms" "Platform"[] DEFAULT ARRAY[]::"Platform"[],
    "position" TEXT NOT NULL DEFAULT 'append',
    "autoAppend" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LegalDisclaimer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LegalDisclaimer_userId_idx" ON "LegalDisclaimer"("userId");

-- CreateIndex
CREATE INDEX "LegalDisclaimer_userId_isActive_idx" ON "LegalDisclaimer"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "LegalDisclaimer" ADD CONSTRAINT "LegalDisclaimer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
