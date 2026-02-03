#!/bin/sh
set -e

# Run database migrations
npx prisma migrate deploy

# Start the Next.js server
exec node server.js
