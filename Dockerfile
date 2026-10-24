# syntax=docker/dockerfile:1

# ---- Builder stage ----
FROM oven/bun:1 AS builder

WORKDIR /app

# Install dependencies first for better layer caching
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile

# Copy source and build
COPY . .
RUN bun run build

# ---- Runtime stage ----
FROM oven/bun:1-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production

# Install production dependencies only
COPY package.json bun.lock* ./
RUN bun install --production --frozen-lockfile

# Copy built output from builder
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["bun", "run", "dist/index.js"]