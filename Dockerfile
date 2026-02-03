FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Install OpenSSL and other dependencies
RUN apk add --no-cache libc6-compat openssl openssl-dev
# Create symlinks for OpenSSL 1.1 compatibility
RUN ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 || true
RUN ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1 || true
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production
RUN cp -R node_modules prod_modules
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists
RUN mkdir -p ./public

# Generate Prisma client
RUN npx prisma generate

# Set environment variables for OpenSSL
ENV OPENSSL_ROOT_DIR=/usr
ENV OPENSSL_LIBRARIES=/usr/lib
ENV PRISMA_QUERY_ENGINE_BINARY=/app/node_modules/.prisma/client/libquery_engine-linux-musl-openssl-3.0.x.so.node

# Build application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Install OpenSSL for Prisma (including 1.1.x compatibility)
RUN apk add --no-cache openssl openssl-dev
# Create symlinks for OpenSSL 1.1 compatibility
RUN ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 || true
RUN ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1 || true

# Set OpenSSL environment variables
ENV OPENSSL_ROOT_DIR=/usr
ENV OPENSSL_LIBRARIES=/usr/lib

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Create public directory and copy files if they exist
RUN mkdir -p ./public
# Copy public directory from builder (now guaranteed to exist)
COPY --from=builder /app/public ./public
# Copy standalone app
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/prisma ./prisma

# Copy full node_modules for worker (standalone only has partial)
COPY --from=deps /app/prod_modules ./node_modules
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma

# Copy worker source files
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json

# Install tsx for running TypeScript worker
RUN npm install -g tsx

# Script to run migrations and start the app
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/docker-entrypoint.sh"]
