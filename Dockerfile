FROM oven/bun:latest AS base

WORKDIR /app

ENV CI=true

COPY package.json bun.lock ./
RUN bun install

COPY . .

FROM base AS development
CMD ["/bin/sh", "-c", "bun run drizzle:migrate && bun run dev"]

FROM base AS production
# Install curl for health checks and netcat for connection testing
RUN apt-get update && apt-get install -y curl netcat-openbsd && rm -rf /var/lib/apt/lists/*
RUN bun run build

# Create a startup script that waits for postgres and then runs migrations
RUN echo '#!/bin/sh\n\
set -e\n\
# Resolve host/port from DB_HOST or PGHOST (Railway uses PG* vars)\n\
PG_WAIT_HOST=${DB_HOST:-${PGHOST}}\n\
PG_WAIT_PORT=${DB_PORT:-${PGPORT:-5432}}\n\
MAX_RETRIES=60\n\
RETRY_COUNT=0\n\
if [ -n "$PG_WAIT_HOST" ]; then\n\
  echo "Waiting for postgres at ${PG_WAIT_HOST}:${PG_WAIT_PORT}..."\n\
  while ! nc -z ${PG_WAIT_HOST} ${PG_WAIT_PORT}; do\n\
    RETRY_COUNT=$((RETRY_COUNT + 1))\n\
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then\n\
      echo "ERROR: Postgres did not become available after $MAX_RETRIES attempts"\n\
      exit 1\n\
    fi\n\
    echo "Postgres is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)"\n\
    sleep 2\n\
  done\n\
  echo "Postgres is up"\n\
else\n\
  echo "No PG host configured for wait check, proceeding..."\n\
fi\n\
echo "Running migrations"\n\
bun run drizzle:migrate\n\
if [ $? -ne 0 ]; then\n\
  echo "ERROR: Migration failed"\n\
  exit 1\n\
fi\n\
echo "Starting API server"\n\
exec bun dist/main.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Environment variables are provided by docker-compose env_file
CMD ["/bin/sh", "/app/start.sh"]
