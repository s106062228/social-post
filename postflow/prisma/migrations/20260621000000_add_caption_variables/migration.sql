-- CreateTable
CREATE TABLE "CaptionVariable" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CaptionVariable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CaptionVariable_userId_key_key" ON "CaptionVariable"("userId", "key");

-- CreateIndex
CREATE INDEX "CaptionVariable_userId_idx" ON "CaptionVariable"("userId");

-- AddForeignKey
ALTER TABLE "CaptionVariable" ADD CONSTRAINT "CaptionVariable_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
