-- Add hidden column to columns table
ALTER TABLE "columns" ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false;
