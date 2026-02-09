-- Add project-level result tags
ALTER TABLE "projects"
ADD COLUMN "result_tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Add tags to prompt runs/results
ALTER TABLE "runs"
ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
