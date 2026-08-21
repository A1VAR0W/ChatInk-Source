FROM node:22-bookworm-slim AS dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY apps/client/package.json apps/client/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm ci

FROM dependencies AS development
ENV NODE_ENV=development \
    HOST=0.0.0.0 \
    PORT=3001 \
    SERVE_CLIENT=false \
    TEMP_ROOT=/tmp/pictochat-development
COPY . .
EXPOSE 3001 5173
CMD ["npm", "run", "dev"]

FROM dependencies AS builder
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
LABEL org.opencontainers.image.source="https://github.com/A1VAR0W/Chat-Ink" \
      org.opencontainers.image.title="Chat-Ink" \
      org.opencontainers.image.description="Chat efimero de texto, dibujos y archivos"
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    SERVE_CLIENT=true \
    CLIENT_DIST=apps/client/dist \
    TEMP_ROOT=/tmp/pictochat

RUN useradd --create-home --uid 10001 appuser
COPY --from=builder --chown=appuser:appuser /app/package.json /app/package-lock.json ./
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder --chown=appuser:appuser /app/apps/server/dist ./apps/server/dist
COPY --from=builder --chown=appuser:appuser /app/apps/client/dist ./apps/client/dist
COPY --from=builder --chown=appuser:appuser /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder --chown=appuser:appuser /app/packages/shared/dist ./packages/shared/dist

USER appuser
EXPOSE 3001
CMD ["node", "apps/server/dist/server.js"]
