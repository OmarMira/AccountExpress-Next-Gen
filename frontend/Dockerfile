FROM oven/bun:latest

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
