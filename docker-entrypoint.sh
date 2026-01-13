#!/bin/sh
set -e

# Run database migrations
npx prisma migrate deploy

# Start the worker process in background using tsx
npx tsx src/lib/worker/index.ts &

# Start the Next.js server
exec node server.js
