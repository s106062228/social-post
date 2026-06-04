-- CreateTable
CREATE TABLE "ContentDigestConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "dayOfWeek" INTEGER NOT NULL DEFAULT 1,
    "hourUTC" INTEGER NOT NULL DEFAULT 9,
    "lookAheadDays" INTEGER NOT NULL DEFAULT 7,
    "includeContent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentDigestConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentDigestConfig_userId_key" ON "ContentDigestConfig"("userId");

-- AddForeignKey
ALTER TABLE "ContentDigestConfig" ADD CONSTRAINT "ContentDigestConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
