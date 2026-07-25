# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json* ./
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner

# Runtime-only system packages. tzdata resolves Asia/Seoul; the fonts allow
# sharp/librsvg to render poster SVG text.
RUN apk add --no-cache tzdata ttf-dejavu fontconfig
ENV TZ=Asia/Seoul \
    NODE_ENV=production \
    PORT=8787 \
    HOSTNAME=0.0.0.0

WORKDIR /app

# `output: standalone` traces only the server files and dependencies required
# in production. Build tools, source files and the .next cache stay behind.
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 8787

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["node", "server.js"]
