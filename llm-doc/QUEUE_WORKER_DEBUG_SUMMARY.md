# FolioFunnel: Job Queue & Worker Debugging Summary

## Problem Overview

Jobs for document processing (e.g., HTML download for URLs) were stuck in the queue and not picked up by the worker. This blocked new document/URL processing and affected reliability.

## Root Causes

- **Prisma Client Not Regenerated:** After schema changes (new fields, enum updates), the Prisma client was not rebuilt in all containers, causing enum mismatches and job failures.
- **Queue Enqueue Logic:** Initial job enqueue used raw SQL or incomplete pg-boss setup, leading to jobs not being properly registered or processed.
- **Worker Startup Issues:** Worker container startup logic was incompatible with tsx, preventing job handler registration and processing.
- **Stale Jobs:** Old jobs in the queue (pgboss.job, processor_run tables) were stuck in failed or queued states, blocking new jobs.
- **Code Not Synced After Changes:** After refactoring or significant code changes, containers continue running old code until restarted, causing queue name mismatches or enqueue logic failures.

## Solutions Applied

- Regenerated Prisma client in all containers after schema changes.
- Switched to pg-boss JS client for job enqueueing and queue creation.
- Fixed worker startup logic for tsx compatibility.
- Cleared old/broken jobs from job and processor_run tables.
- Re-enqueued valid processor runs using pg-boss client.
- Restarted all containers to ensure sync.

## Unified Queue System (2026-01-27)

The queue system was refactored to use a single unified queue:

### Old Architecture (before 2026-01-27)

- `process-document` queue - for column processors
- `prompt-run` queue - for prompt runs
- `bulk-process` queue - for bulk operations

### New Architecture (after 2026-01-27)

- **`process-job`** queue - unified queue for all processing (column processors AND prompt runs)
  - Uses discriminated union with `type` field:
    - `type: "column_processor"` - for document/column processing
    - `type: "prompt_run"` - for prompt runs
- `bulk-process` queue - remains for orchestration

### Key Changes

- Single worker handler `handleProcessJob()` routes to appropriate sub-handler based on job type
- Shared OpenAI client (`src/lib/openai-client.ts`) for both column processors and prompt runs
- Consistent token counting, cost calculation, and error handling across all AI processing

## Lessons & Recommendations

- **Always regenerate Prisma client after schema changes.**
- **Use pg-boss JS API for job enqueueing and queue management.**
- **Ensure worker startup logic is compatible with tsx.**
- **Clear stale jobs after major schema or logic changes.**
- **Monitor worker logs and job tables for stuck jobs.**
- **Restart containers after significant code refactoring** - containers don't automatically pick up code changes, leading to mismatched queue names or enqueue logic.

## For Future Tasks

### If jobs are stuck or not processed, check:

1. **Worker logs** - Look for the correct handler names:
   - NEW: `[Worker] handleProcessJob called`
   - OLD: `[Worker] handleProcessDocument called` or `[Worker] handlePromptRun called`
2. **Container restart time** - If code was changed recently but containers show old timestamps, restart them:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.dev.yml restart worker next-app
   ```
3. **Queue state** - Check for jobs in pg-boss queue vs processor_runs table:

   ```sql
   -- Check pg-boss queue
   SELECT name, state, COUNT(*) FROM pgboss.job
   WHERE state != 'completed' GROUP BY name, state;

   -- Check processor_runs for queued jobs
   SELECT pr.status, COUNT(*) FROM processor_runs pr
   GROUP BY pr.status;
   ```

4. **Prisma client sync** in all containers
5. **Job enqueue logic** (use pg-boss JS client with correct queue name: `process-job`)

### After any schema change, always:

- Regenerate Prisma client
- Restart containers
- Test with a new document/URL

### After code refactoring, always:

- Restart affected containers (usually `worker` and `next-app`)
- Verify worker logs show new code is running
- Re-enqueue any stuck jobs that were created with old code

### Re-enqueueing Stuck Jobs

If jobs exist in `processor_runs` but not in `pgboss.job`, they need to be re-enqueued:

```javascript
// Quick script to re-enqueue (run in next-app container)
import PgBoss from "pg-boss";
const boss = new PgBoss({ connectionString: process.env.DATABASE_URL });
await boss.start();

// Query stuck jobs from processor_runs where status='queued'
// Then for each:
await boss.send("process-job", {
  type: "column_processor",
  projectId: row.project_id,
  documentId: row.document_id,
  columnId: row.column_id,
  runId: row.run_id,
});
```

---

_Last updated: 2026-01-27_
