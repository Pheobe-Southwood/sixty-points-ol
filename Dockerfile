# syntax=docker/dockerfile:1

# ---------- 构建阶段：装依赖 + 构建 SvelteKit 产物 ----------
FROM node:24-bookworm-slim AS build
ENV CI=true
WORKDIR /repo

# pnpm 版本与根 package.json 的 packageManager 对齐
RUN npm i -g pnpm@11.22.0

# 先只拷依赖清单，命中缓存后无需每次重装
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/engine/package.json packages/engine/
COPY apps/web/package.json apps/web/
RUN pnpm install --frozen-lockfile

# 再拷源码并构建（引擎以 TS 源码被 Vite 打包进产物）
COPY tsconfig.base.json ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm --filter web build

# ---------- 运行阶段：只带产物与运行期依赖 ----------
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3000 \
    HOST=0.0.0.0 \
    SIXTY_DB=/data/sixty.db
WORKDIR /app

# /data 挂卷存 SQLite，容器重建不丢牌局
RUN mkdir -p /data && chown -R node:node /data
VOLUME ["/data"]

# pnpm 用相对符号链接组织 node_modules，跨阶段整目录拷贝即可保持可解析
COPY --from=build --chown=node:node /repo/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/web/node_modules ./apps/web/node_modules
COPY --from=build --chown=node:node /repo/packages/engine ./packages/engine
COPY --from=build --chown=node:node /repo/apps/web/build ./apps/web/build
COPY --from=build --chown=node:node /repo/apps/web/package.json ./apps/web/package.json
COPY --from=build --chown=node:node /repo/package.json ./package.json

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "apps/web/build/index.js"]
