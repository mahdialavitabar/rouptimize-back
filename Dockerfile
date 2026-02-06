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

# Create a startup script that runs migrations then starts the server
RUN echo '#!/bin/sh\n\
set -e\n\
\n\
# When DATABASE_URL is set (Railway), skip nc check - pg driver handles retries.\n\
# Only use nc wait for local/docker-compose where DB_HOST is set.\n\
if [ -z "$DATABASE_URL" ]; then\n\
  PG_WAIT_HOST=${DB_HOST:-${PGHOST}}\n\
  PG_WAIT_PORT=${DB_PORT:-${PGPORT:-5432}}\n\
  MAX_RETRIES=30\n\
  RETRY_COUNT=0\n\
  if [ -n "$PG_WAIT_HOST" ]; then\n\
    echo "Waiting for postgres at ${PG_WAIT_HOST}:${PG_WAIT_PORT}..."\n\
    while ! nc -z -w 2 ${PG_WAIT_HOST} ${PG_WAIT_PORT} 2>/dev/null; do\n\
      RETRY_COUNT=$((RETRY_COUNT + 1))\n\
      if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then\n\
        echo "WARNING: Postgres wait timed out, trying migration anyway..."\n\
        break\n\
      fi\n\
      echo "Postgres is unavailable - sleeping (attempt $RETRY_COUNT/$MAX_RETRIES)"\n\
      sleep 2\n\
    done\n\
  fi\n\
else\n\
  echo "DATABASE_URL detected (Railway), skipping nc wait check"\n\
  sleep 5\n\
fi\n\
\n\
echo "Running migrations"\n\
MIGRATION_RETRIES=3\n\
MIGRATION_ATTEMPT=0\n\
until bun run drizzle:migrate; do\n\
  MIGRATION_ATTEMPT=$((MIGRATION_ATTEMPT + 1))\n\
  if [ $MIGRATION_ATTEMPT -ge $MIGRATION_RETRIES ]; then\n\
    echo "ERROR: Migration failed after $MIGRATION_RETRIES attempts"\n\
    exit 1\n\
  fi\n\
  echo "Migration failed, retrying in 5s (attempt $MIGRATION_ATTEMPT/$MIGRATION_RETRIES)"\n\
  sleep 5\n\
done\n\
\n\
echo "Starting API server"\n\
exec bun dist/main.js\n\
' > /app/start.sh && chmod +x /app/start.sh

# Environment variables are provided by docker-compose env_file
CMD ["/bin/sh", "/app/start.sh"]
