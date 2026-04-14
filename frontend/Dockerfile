# ⚠️ FIX: Pinned to a specific stable version instead of 'latest'
# to prevent supply-chain attacks via non-deterministic base images.
# Update this tag intentionally after reviewing release notes.
FROM oven/bun:1.2.10

WORKDIR /app

# Copy dependency files from the frontend subdirectory
COPY package.json bun.lock ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the frontend code
COPY . .

# Exposure of frontend dev port
EXPOSE 5173

# Run vite dev server
CMD ["bun", "run", "dev", "--host"]
