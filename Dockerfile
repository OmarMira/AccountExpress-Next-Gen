FROM oven/bun:latest

WORKDIR /app

# Copy dependency files
COPY package.json bun.lock ./

# Install build tools for native dependencies (better-sqlite3)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN bun install --frozen-lockfile

# Copy the rest of the application code
COPY . .

# Ensure data directory exists for volumes
RUN mkdir -p /app/data

# Exposure of backend port
EXPOSE 3000

# Run migrations and then start the server
CMD ["sh", "-c", "bun run migrate && bun run start"]
