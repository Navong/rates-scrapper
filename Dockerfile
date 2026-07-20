FROM node:22-alpine

# tzdata so TZ=Asia/Seoul resolves (alpine has no zoneinfo by default).
# ttf-dejavu + fontconfig so sharp/librsvg can render poster SVG text (Alpine
# ships with no fonts, so <text> would rasterize blank without this).
RUN apk add --no-cache tzdata ttf-dejavu fontconfig
ENV TZ=Asia/Seoul

WORKDIR /app

# Install deps first (better layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# App source
COPY . .
RUN npm run build

ENV PORT=8787
EXPOSE 8787

HEALTHCHECK --interval=60s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/health" || exit 1

CMD ["npm", "run", "start"]
