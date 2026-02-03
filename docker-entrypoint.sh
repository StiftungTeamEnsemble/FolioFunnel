#!/bin/sh
set -e

echo "Starting FolioFunnel..."
echo "Current directory: $(pwd)"
echo "Checking for server.js..."

if [ ! -f "server.js" ]; then
    echo "ERROR: server.js not found!"
    ls -la
    exit 1
fi

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."

# Start the Next.js server
exec node server.js
