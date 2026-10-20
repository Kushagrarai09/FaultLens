FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
RUN pnpm --filter api build

FROM node:22-alpine
RUN corepack enable
WORKDIR /workspace
COPY --from=build /workspace/package.json /workspace/pnpm-lock.yaml /workspace/pnpm-workspace.yaml ./
COPY --from=build /workspace/apps/api/package.json apps/api/package.json
COPY --from=build /workspace/apps/api/dist apps/api/dist
COPY --from=build /workspace/apps/api/migrations apps/api/migrations
COPY --from=build /workspace/apps/api/scripts apps/api/scripts
RUN pnpm install --prod --frozen-lockfile
EXPOSE 3001
