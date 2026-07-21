# Stage 1: Build & Production Dependencies
FROM node:24-alpine AS builder

WORKDIR /app

# Copy package manifests
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Stage 2: Lightweight Production Runner
FROM node:24-alpine AS runner

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Copy built node_modules and app code
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
COPY src/ ./src/

# Expose backend port
EXPOSE 3000

# Run as non-root user for security
USER node

CMD ["node", "src/app.js"]