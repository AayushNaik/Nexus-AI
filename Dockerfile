# Stage 1: Build
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
COPY package*.json ./
RUN npm install

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:22-slim

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built assets from builder
COPY --from=builder /app/dist ./dist
# Copy the server entry point
COPY --from=builder /app/server.ts ./server.ts

# Expose port 3000
EXPOSE 3000

# Set production environment
ENV NODE_ENV=production

# Start the application using Node's native TypeScript support
CMD ["node", "--experimental-strip-types", "server.ts"]
