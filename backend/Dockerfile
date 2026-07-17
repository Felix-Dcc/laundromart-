# Laundromat API — production image
FROM node:20-alpine

WORKDIR /app

# openssl: required by Prisma engines on Alpine. curl: container healthcheck.
RUN apk add --no-cache openssl curl

# Install dependencies first (better layer caching). Full install so the Prisma
# CLI is available for `prisma generate` and the migrate step at startup.
COPY package*.json ./
RUN npm ci

# Generate the Prisma client against the schema.
COPY prisma ./prisma
RUN npx prisma generate

# App source.
COPY . .

ENV NODE_ENV=production
ENV PORT=3000

# Run as a non-root user.
RUN addgroup -S app && adduser -S app -G app && chown -R app:app /app
USER app

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS http://localhost:3000/api/health || exit 1

ENTRYPOINT ["sh", "./docker-entrypoint.sh"]
