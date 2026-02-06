# Multi-stage Dockerfile for UKE Flashcards
# Uses Alpine Linux for minimal image size (~350-450MB)
# Handles native module compilation (better-sqlite3) and production build

# ============================================================================
# Stage 1: Dependencies
# Install production dependencies with native build tools for better-sqlite3
# ============================================================================
FROM node:20-alpine AS deps

# Install build tools required for better-sqlite3 compilation
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install production dependencies only
RUN npm ci --only=production

# ============================================================================
# Stage 2: Builder
# Build Next.js standalone output
# ============================================================================
FROM node:20-alpine AS builder

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code
COPY . .

# Build Next.js application (generates .next and standalone output)
RUN npm run build

# ============================================================================
# Stage 3: Runner
# Minimal production image with only necessary files
# ============================================================================
FROM node:20-alpine AS runner

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001

# Copy production dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy public assets
COPY --from=builder /app/public ./public

# Copy standalone build output from builder stage
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./

# Copy static data files (questions.json, alphabet.json, q_codes.json)
COPY --chown=nextjs:nodejs data/questions.json ./data/
COPY --chown=nextjs:nodejs data/alphabet.json ./data/
COPY --chown=nextjs:nodejs data/q_codes.json ./data/

# Create data directory for database persistence
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data

# Switch to non-root user
USER nextjs

# Expose port
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Health check using the API
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/api/questions', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application
CMD ["node", "server.js"]
