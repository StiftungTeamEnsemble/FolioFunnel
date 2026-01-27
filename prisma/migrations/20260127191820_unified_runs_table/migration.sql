-- Drop old tables (data will be lost as requested by user)
DROP TABLE IF EXISTS "processor_runs" CASCADE;
DROP TABLE IF EXISTS "prompt_runs" CASCADE;

-- Drop old enum
DROP TYPE IF EXISTS "PromptRunStatus";

-- Create new RunType enum
CREATE TYPE "RunType" AS ENUM ('processor', 'prompt');

-- Create unified runs table
CREATE TABLE "runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "type" "RunType" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'queued',
    
    -- Common fields
    "created_by_id" UUID,
    "started_at" TIMESTAMP(3),
    "finished_at" TIMESTAMP(3),
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    
    -- Processor-specific fields (nullable for prompt runs)
    "document_id" UUID,
    "column_id" UUID,
    
    -- Prompt-specific fields (nullable for processor runs)
    "model" TEXT,
    "prompt_template" TEXT,
    "rendered_prompt" TEXT,
    
    -- Common output/metrics
    "result" TEXT,
    "input_token_count" INTEGER,
    "output_token_count" INTEGER,
    "token_count" INTEGER,
    "cost_estimate" DOUBLE PRECISION,
    
    -- Flexible fields
    "config" JSONB,
    "meta" JSONB,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- Create indices
CREATE INDEX "runs_project_id_type_idx" ON "runs"("project_id", "type");
CREATE INDEX "runs_status_idx" ON "runs"("status");
CREATE INDEX "runs_document_id_idx" ON "runs"("document_id");
CREATE INDEX "runs_column_id_idx" ON "runs"("column_id");
CREATE INDEX "runs_created_by_id_idx" ON "runs"("created_by_id");
CREATE INDEX "runs_created_at_idx" ON "runs"("created_at");

-- Add foreign key constraints
ALTER TABLE "runs" ADD CONSTRAINT "runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "runs" ADD CONSTRAINT "runs_column_id_fkey" FOREIGN KEY ("column_id") REFERENCES "columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
