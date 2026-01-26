# FolioFunnel: Job Queue & Worker Debugging Summary

## Problem Overview

Jobs for document processing (e.g., HTML download for URLs) were stuck in the queue and not picked up by the worker. This blocked new document/URL processing and affected reliability.

## Root Causes

- **Prisma Client Not Regenerated:** After schema changes (new fields, enum updates), the Prisma client was not rebuilt in all containers, causing enum mismatches and job failures.
- **Queue Enqueue Logic:** Initial job enqueue used raw SQL or incomplete pg-boss setup, leading to jobs not being properly registered or processed.
- **Worker Startup Issues:** Worker container startup logic was incompatible with tsx, preventing job handler registration and processing.
- **Stale Jobs:** Old jobs in the queue (pgboss.job, processor_run tables) were stuck in failed or queued states, blocking new jobs.

## Solutions Applied

- Regenerated Prisma client in all containers after schema changes.
- Switched to pg-boss JS client for job enqueueing and queue creation.
- Fixed worker startup logic for tsx compatibility.
- Cleared old/broken jobs from job and processor_run tables.
- Re-enqueued valid processor runs using pg-boss client.
- Restarted all containers to ensure sync.

## Lessons & Recommendations

- **Always regenerate Prisma client after schema changes.**
- **Use pg-boss JS API for job enqueueing and queue management.**
- **Ensure worker startup logic is compatible with tsx.**
- **Clear stale jobs after major schema or logic changes.**
- **Monitor worker logs and job tables for stuck jobs.**

## For Future Tasks

- If jobs are stuck or not processed, check:
  - Prisma client sync in all containers
  - Job enqueue logic (use pg-boss JS client)
  - Worker startup and handler registration
  - State of job and processor_run tables
- After any schema change, always:
  - Regenerate Prisma client
  - Restart containers
  - Test with a new document/URL

---

_Last updated: 2026-01-26_
