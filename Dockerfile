# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json tsconfig.build.json ./
COPY scripts ./scripts
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production \
    TAVO_MCP_TRANSPORT=http \
    TAVO_MCP_HOST=0.0.0.0 \
    TAVO_MCP_PORT=3000 \
    TAVO_MCP_ALLOWED_HOSTS=127.0.0.1,localhost
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY schemas ./schemas
COPY README.md LICENSE ./

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/healthz || exit 1

CMD ["node", "dist/index.js"]
