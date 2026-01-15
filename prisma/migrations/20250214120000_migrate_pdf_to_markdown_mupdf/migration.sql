BEGIN;

UPDATE "columns"
SET "processor_type" = 'pdf_to_markdown_mupdf'
WHERE "processor_type" = 'pdf_to_markdown';

ALTER TYPE "ProcessorType" RENAME TO "ProcessorType_old";

CREATE TYPE "ProcessorType" AS ENUM (
  'pdf_to_markdown_mupdf',
  'pdf_to_metadata',
  'url_to_text',
  'url_to_markdown',
  'chunk_text',
  'create_embeddings',
  'ai_transform',
  'count_tokens'
);

ALTER TABLE "columns"
ALTER COLUMN "processor_type" TYPE "ProcessorType"
USING ("processor_type"::text::"ProcessorType");

DROP TYPE "ProcessorType_old";

COMMIT;
