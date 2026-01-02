# Build stage
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@9.15.0

WORKDIR /app

# Copy package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/control-plane/package.json ./apps/control-plane/
COPY packages/db/package.json ./packages/db/
COPY packages/api-contract/package.json ./packages/api-contract/
COPY packages/config/package.json ./packages/config/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/ ./packages/
COPY apps/control-plane/ ./apps/control-plane/
COPY turbo.json ./

# Build
RUN pnpm turbo run build --filter=@ccc/control-plane

# Production stage
FROM node:20-slim AS runner

WORKDIR /app

# Install Tailscale for connecting to VMs over private network
RUN apt-get update && apt-get install -y curl ca-certificates iptables && \
    curl -fsSL https://tailscale.com/install.sh | sh && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

# Create directory for Tailscale state
RUN mkdir -p /var/lib/tailscale

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/control-plane/node_modules ./apps/control-plane/node_modules
COPY --from=builder /app/apps/control-plane/dist ./apps/control-plane/dist
COPY --from=builder /app/apps/control-plane/package.json ./apps/control-plane/
COPY --from=builder /app/packages ./packages

# Copy startup script
COPY apps/control-plane/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV NODE_ENV=production
ENV PORT=3001

EXPOSE 3001

# Use startup script that initializes Tailscale before starting the app
CMD ["./start.sh"]
