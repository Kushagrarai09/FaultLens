FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/worker/package.json apps/worker/package.json
RUN pnpm install --frozen-lockfile
COPY apps/worker apps/worker
RUN pnpm --filter @faultlens/worker build

FROM node:22-alpine
WORKDIR /workspace
COPY --from=build /workspace/apps/worker/dist apps/worker/dist
CMD ["node", "apps/worker/dist/index.js"]
