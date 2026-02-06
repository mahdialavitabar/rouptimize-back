FROM oven/bun:latest AS base

WORKDIR /app

ENV CI=true

COPY . .

RUN bun install
RUN cd apps/api && bun install

FROM base AS development
CMD ["/bin/sh", "-c", "bun run --filter api drizzle:migrate && bun run --filter api dev"]

FROM base AS production
# Install curl for health checks and netcat for connection testing
RUN apt-get update && apt-get install -y curl netcat-openbsd && rm -rf /var/lib/apt/lists/*
RUN bun run --filter api build
WORKDIR /app/apps/api

# Create a startup script that waits for postgres and then runs migrations
RUN echo '#!/bin/sh\n\
set -e\n\
MAX_RETRIES=60\n\
RETRY_COUNT=0\n\
echo "Waiting for postgres at ${DB_HOST}:${DB_PORT:-5432}..."\n\
while ! nc -z ${DB_HOST} ${DB_PORT:-5432}; do\n\
  RETRY_COUNT=$((RETRY_COUNT + 1))\n\
  if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then\n\
    echo "ERROR: Postgres did not become available after $MAX_RETRIES attempts"\n\
    exit 1\n\
  fi\n\
  echo "Postgres is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)"\n\
  sleep 2\n\
done\n\
echo "Postgres is up - running migrations"\n\
cd /app && bun run --filter api drizzle:migrate\n\
if [ $? -ne 0 ]; then\n\
  echo "ERROR: Migration failed"\n\
  exit 1\n\
fi\n\
echo "Starting API server"\n\
cd /app/apps/api && exec bun dist/main.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Environment variables are provided by docker-compose env_file
CMD ["/bin/sh", "/app/start.sh"]
