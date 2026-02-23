#!/bin/sh
set -e

echo "Starting FolioFunnel..."
echo "Current directory: $(pwd)"

echo "Running database migrations..."
npx prisma migrate deploy

echo "Ensuring /data directory permissions..."
mkdir -p /data/projects
chown -R nextjs:nodejs /data

echo "Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."

# Start the Next.js server as nextjs user
exec su-exec nextjs npm start
