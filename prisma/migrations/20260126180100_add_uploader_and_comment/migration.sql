-- AlterEnum
ALTER TYPE "ProcessorType" ADD VALUE 'url_to_html';

-- AlterTable: Add comment column (nullable)
ALTER TABLE "documents" ADD COLUMN "comment" TEXT;

-- AlterTable: Add uploaded_by_id with temporary default
ALTER TABLE "documents" ADD COLUMN "uploaded_by_id" UUID;

-- Set uploaded_by_id to the project creator for existing documents
UPDATE "documents" d
SET "uploaded_by_id" = p."created_by_id"
FROM "projects" p
WHERE d."project_id" = p.id AND d."uploaded_by_id" IS NULL;

-- Make uploaded_by_id required
ALTER TABLE "documents" ALTER COLUMN "uploaded_by_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "documents_uploaded_by_id_idx" ON "documents"("uploaded_by_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_id_fkey" FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
