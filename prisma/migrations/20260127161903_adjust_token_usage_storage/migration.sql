-- AlterTable
ALTER TABLE "prompt_runs" ADD COLUMN     "input_token_count" INTEGER,
ADD COLUMN     "output_token_count" INTEGER;
