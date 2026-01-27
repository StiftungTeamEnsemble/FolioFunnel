-- CreateEnum
CREATE TYPE "PromptRunStatus" AS ENUM ('queued', 'running', 'success', 'error');

-- CreateTable
CREATE TABLE "prompt_runs" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_template" TEXT NOT NULL,
    "rendered_prompt" TEXT NOT NULL,
    "filters" JSONB,
    "document_ids" JSONB,
    "token_count" INTEGER,
    "cost_estimate" DOUBLE PRECISION,
    "status" "PromptRunStatus" NOT NULL DEFAULT 'queued',
    "error" TEXT,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prompt_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "prompt_runs_project_id_idx" ON "prompt_runs"("project_id");

-- CreateIndex
CREATE INDEX "prompt_runs_created_by_id_idx" ON "prompt_runs"("created_by_id");

-- AddForeignKey
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prompt_runs" ADD CONSTRAINT "prompt_runs_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
