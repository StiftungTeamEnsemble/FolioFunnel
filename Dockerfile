FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat openssl openssl-dev

# Symlink OpenSSL 3 libs into /lib for Prisma binary detection on Alpine 3.21
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || true
RUN [ ! -e /lib/libcrypto.so.3 ] && ln -s /usr/lib/libcrypto.so.3 /lib/libcrypto.so.3 || true

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --only=production
RUN cp -R node_modules prod_modules
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
# Ensure OpenSSL 3 libs are in /lib for prisma generate
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || true
RUN [ ! -e /lib/libcrypto.so.3 ] && ln -s /usr/lib/libcrypto.so.3 /lib/libcrypto.so.3 || true
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Ensure public directory exists
RUN mkdir -p ./public

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PRISMA_CLI_BINARY_TARGETS=linux-musl-openssl-3.0.x

# Install OpenSSL for Prisma
RUN apk add --no-cache openssl openssl-dev

# Symlink OpenSSL 3 libs into /lib for Prisma binary detection on Alpine 3.21
RUN [ ! -e /lib/libssl.so.3 ] && ln -s /usr/lib/libssl.so.3 /lib/libssl.so.3 || true
RUN [ ! -e /lib/libcrypto.so.3 ] && ln -s /usr/lib/libcrypto.so.3 /lib/libcrypto.so.3 || true

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
