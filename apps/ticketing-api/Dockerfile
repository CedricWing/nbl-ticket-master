FROM node:22-alpine AS base
RUN corepack enable

FROM base AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY apps/ticketing-api/package.json ./apps/ticketing-api/
COPY apps/ticketing-api/ ./apps/ticketing-api/
RUN pnpm install --frozen-lockfile --filter ticketing-api... && \
    cd apps/ticketing-api && pnpm build && pnpm build:migrate

# esbuild bundles all deps — runner only needs node itself
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/apps/ticketing-api/dist ./dist
COPY --from=builder /app/apps/ticketing-api/drizzle ./drizzle
EXPOSE 3000
CMD ["sh", "-c", "node dist/migrate.js && node dist/index.js"]
