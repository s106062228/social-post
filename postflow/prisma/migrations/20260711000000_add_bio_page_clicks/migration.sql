-- CreateTable
CREATE TABLE "BioPageClick" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "clickedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "referrer" TEXT,
    "deviceType" TEXT,

    CONSTRAINT "BioPageClick_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BioPageClick_itemId_idx" ON "BioPageClick"("itemId");

-- CreateIndex
CREATE INDEX "BioPageClick_itemId_clickedAt_idx" ON "BioPageClick"("itemId", "clickedAt");

-- AddForeignKey
ALTER TABLE "BioPageClick" ADD CONSTRAINT "BioPageClick_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "LinkBioItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
