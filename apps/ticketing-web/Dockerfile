FROM node:22-alpine AS base
RUN corepack enable

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/ticketing-web/package.json ./apps/ticketing-web/
RUN pnpm install --frozen-lockfile --filter ticketing-web...

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/ticketing-web/node_modules ./apps/ticketing-web/node_modules
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/ticketing-web/ ./apps/ticketing-web/
WORKDIR /app/apps/ticketing-web
ENV NEXT_TELEMETRY_DISABLED=1
# Next.js inlines NEXT_PUBLIC_* vars into the client bundle at build time, so this has to be
# a build arg (baked into the image), not a runtime environment variable.
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}
RUN pnpm build

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3001
COPY --from=builder /app/apps/ticketing-web/.next/standalone ./
COPY --from=builder /app/apps/ticketing-web/.next/static ./apps/ticketing-web/.next/static
COPY --from=builder /app/apps/ticketing-web/public ./apps/ticketing-web/public
EXPOSE 3001
CMD ["node", "apps/ticketing-web/server.js"]
