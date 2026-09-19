FROM node:22.18.0-bookworm-slim

ENV CI=1 \
    NODE_ENV=production \
    PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH

RUN corepack enable \
    && groupadd --system --gid 10001 security-worker \
    && useradd --system --uid 10001 --gid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin security-worker

WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY scripts/ai-security-worker.ts ./scripts/ai-security-worker.ts
COPY src ./src
COPY tsconfig.json ./tsconfig.json

USER 10001:10001
ENTRYPOINT ["node", "--conditions=react-server", "--import", "tsx", "scripts/ai-security-worker.ts"]
