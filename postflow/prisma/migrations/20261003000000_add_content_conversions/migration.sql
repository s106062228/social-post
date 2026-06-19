-- CreateEnum
CREATE TYPE "ConversionType" AS ENUM ('SALE', 'LEAD', 'SIGNUP', 'DOWNLOAD', 'CLICK', 'OTHER');

-- CreateTable
CREATE TABLE "ContentConversion" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "type" "ConversionType" NOT NULL,
    "value" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "notes" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContentConversion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ContentConversion_userId_idx" ON "ContentConversion"("userId");

-- CreateIndex
CREATE INDEX "ContentConversion_postId_idx" ON "ContentConversion"("postId");

-- CreateIndex
CREATE INDEX "ContentConversion_userId_occurredAt_idx" ON "ContentConversion"("userId", "occurredAt" DESC);

-- CreateIndex
CREATE INDEX "ContentConversion_userId_type_idx" ON "ContentConversion"("userId", "type");

-- AddForeignKey
ALTER TABLE "ContentConversion" ADD CONSTRAINT "ContentConversion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentConversion" ADD CONSTRAINT "ContentConversion_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
