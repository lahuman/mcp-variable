FROM node:20-bookworm-slim AS deps

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production \
    MCP_VARIABLE_HOST=0.0.0.0 \
    MCP_VARIABLE_PORT=3000 \
    MCP_VARIABLE_CSV=/app/data/terms.csv \
    MCP_VARIABLE_SSE_PATH=/sse \
    MCP_VARIABLE_MESSAGES_PATH=/messages

WORKDIR /app

COPY --from=build --chown=node:node /app/package.json /app/package-lock.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node data ./data

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "const port = process.env.MCP_VARIABLE_PORT || '3000'; fetch('http://127.0.0.1:' + port + '/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1));"

CMD ["node", "dist/server_sse.js"]
