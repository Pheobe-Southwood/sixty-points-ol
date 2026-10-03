# CI 用 GitHub Actions 构建镜像并推 GHCR

镜像不再只靠本地 `docker compose build`：`.github/workflows/ci.yml` 在 `ubuntu-latest` 上用 buildx 构建（`linux/amd64` 单架构，`provenance: false`）并推到 `ghcr.io/cup113/sixty-points-ol`；push `main` 出 `latest`/`main`/`sha-<7位>`，推 `v*` 标签额外出 semver 标签，PR 只试构建不推送，也可 `workflow_dispatch` 手动触发。同一工作流的 `verify` job（`pnpm test` / `pnpm test:web` / `pnpm check`）是 `image` job 的前置（`needs`），测试不过就不发布。

理由：仓库公开，用内置 `GITHUB_TOKEN` 即可（无需另配 Secret）；GHCR 与仓库同账号，包可见性随仓库；单一构建源避免本地产物与线上部署不一致；镜像名等于仓库路径，`metadata-action` 自动注入 `org.opencontainers.image.source` 等标签，包自动关联仓库。

后果：镜像只覆盖 amd64，ARM 主机要么本地 build，要么后续加 `docker/setup-qemu-action` 并把 `platforms` 改成 `linux/amd64,linux/arm64`（QEMU 模拟下构建时间通常翻 2–4 倍）；发布依赖 GitHub Actions 可用性；放弃 attestation（`provenance: false`）是为了避免 `unknown/unknown` 平台条目在部分 UI 上显示怪异，需要时可一行打开；`docker-compose.yml` 仍是本地 build（`build:` 优先于 `image:`），用预构建镜像走 `docker run` 或 Coolify 的 Docker Image 资源。
