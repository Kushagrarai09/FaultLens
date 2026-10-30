FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
RUN pnpm --filter web build

FROM node:22-alpine
RUN corepack enable
WORKDIR /workspace
ENV NODE_ENV=production
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY --from=build /workspace/apps/web/.next apps/web/.next
COPY --from=build /workspace/apps/web/public apps/web/public
RUN pnpm install --prod --frozen-lockfile --filter web
EXPOSE 3000
CMD ["node", "apps/web/node_modules/next/dist/bin/next", "start", "apps/web", "-p", "3000"]
