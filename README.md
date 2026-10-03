# 六十分（Sixty Points）线上版

三人 1v2 的顺子类牌戏：一副 54 张，桥牌式叫牌定庄定将，双升式打牌与升级赛程。线上实现为
SvelteKit + SSE 单实例应用，规则引擎是零依赖纯 TypeScript 包并有完整单测/属性测试。

## 目录

```
packages/engine     纯 TS 规则引擎（零依赖，可被服务端与客户端共用）
  src/              cards / order / validate / trick / auction / state / view
  test/             node:test 表驱动 + 属性测试（默认 60 个随机整局，GAME_SEEDS 可放大）
apps/web            SvelteKit 2 + Svelte 5 + Tailwind 4 + adapter-node
  src/lib/server/   SQLite（node:sqlite）、身份凭据、同桌服务、SSE hub
  src/routes/       大厅、同桌页、新手教程（/rules）、REST 动作接口、SSE 流
  scripts/          smoke.ts（三人 HTTP 端到端）、resume-check.ts（重启续局校验）
                    lobby-check.ts（开局入口回归）、ui-check.ts（版面与文案守卫）
CONTEXT.md          领域词汇表（术语与已敲定的规则歧义）
docs/adr/           架构决策记录
```

## 规则实现要点

- 一副牌无对子，多张出牌即「单张顺子」；副牌顺子跳过级牌，主牌顺子按全序
  `…A < 副级 < 主级 < 小王 < 大王` 相邻，且至多含一张副级牌。
- 打牌中三张副级牌完全相等（花色序只用于叫牌），平张先出为大。
- 跟牌「结构优先」：所选 n 张的连续段分解必须字典序最大（领 4 顺持 3+2 必出 3 顺 + 任 1 张）。
  实现见 `packages/engine/src/order.ts` 的 `segments`/`bestProfile`（按最长连续链贪心抽取）。
- 结算：庄家抓分 ± 底牌分 × 末轮张数；打成按 40/60/70/80/90+ 升级表，打输则两名闲家各升
  `ceil(差/10)` 级；两家达 2(+2) 或一家达 2(+3) 结束，总进度最高者为冠军。

细节与全部已敲定决策见 `CONTEXT.md`；架构理由见 `docs/adr/`。

## 本地运行

```bash
pnpm install          # 工作区依赖（esbuild 的构建脚本已显式关闭，见 ADR-0004）
pnpm test             # 规则引擎测试（node:test，零额外依赖）
pnpm test:web         # 前端纯函数测试：扇形布局 / 邀请码解析 / 阶段说明 / 牌面映射 / 结算门槛 / 教程示例
pnpm check            # 引擎 tsc + 应用 svelte-check
pnpm dev              # SvelteKit 开发服务器（默认 http://localhost:5173）
pnpm build            # 产出 apps/web/build（adapter-node）
pnpm start            # 跑构建产物（默认端口 3000，见下）
```

环境变量：`PORT`（默认 3000）、`HOST`、`SIXTY_DB`（默认 `<cwd>/data/sixty.db`）。

> ⚠️ **不要设置空的 `ORIGIN`。** 留空（例如 Compose 里的 `ORIGIN=${ORIGIN:-}`、`ORIGIN=` 或 `ORIGIN=""`）会让
> adapter-node 直接拒绝启动：
> `Error: Invalid ORIGIN: ''. ORIGIN must be a valid URL with http:// or https:// protocol.`
> 不定义该变量时服务端会按请求头推导来源，反代部署正是想要这种行为；确实需要固定来源时，写成完整 URL
> （如 `ORIGIN=https://game.example.com`）。留空 ≠ 不设置，这是两回事。

端到端冒烟（需先启动服务端）：

```bash
BASE=http://127.0.0.1:5178 pnpm --filter web smoke     # 3 个身份打完 N 副（DEALS=n），含 SSE 推送校验
BASE=http://127.0.0.1:5178 pnpm --filter web lobby     # 开局回归：未开局必须渲染「开始第一副」按钮 + 三个座位都列出玩家名
BASE=http://127.0.0.1:5178 pnpm --filter web ui        # 版面/文案守卫：position 类不得混用、座位卡必须 absolute、
                                                       # 邀请码可点复制、常驻提示已清空、? 按阶段给说明、无方位称谓、
                                                       # /rules 九个小节齐备且渲染真实牌面、
                                                       # 王牌面（名字只在角落索引、正中是 ☀/☾ 图案）、
                                                       # 出货样式表里不得再有牌角装饰点（.card.pt / .card.trump::after）
BASE=http://127.0.0.1:5178 pnpm --filter web resume    # 重启服务端后再跑，校验 SQLite 续局
```

冒烟脚本用 `data/smoke-run.json` 保存凭据供续局校验使用。

## 界面约定

- **说明只在一处**：牌桌上的阶段玩法说明全部收在左下角的「?」弹层（内容与 `/rules` 教程同源，
  见 `apps/web/src/lib/help.ts`）；界面上不再有常驻提示文案，玩家不需要在三个角落各读一遍。
- **玩家名而不是方位**：文案里一律用玩家名或「你」（`whoLabel`），不出现「东/南/西家」——
  四角座位卡显示的就是名字，方位在屏幕上没有锚点。
- **点邀请码即复制链接**：`<origin>/table/<邀请码>`；大厅的入座框既接受 6 位邀请码，也接受直接粘贴的完整链接
  （`parseInvite`）。局域网 http 下浏览器没有 Clipboard API，会自动退化成可手动复制的链接输入框。
- **无重复信息**：同一件事只说一遍（如「庄已抓 X / 需 Y」里的分母就是旁边的定约分，只保留一个）。
- **牌面**：主牌只靠**金边**区分，四个角没有任何装饰点（点看着像另一张牌）；分牌就是 5 / 10 / K，认点数即可。
  大小王按真牌的布局：**牌名只在两处角落索引里**（「大/小 + 王」），两处镜像一致；**正中是一枚图案**（大王 ☀ / 小王 ☾）。
  牌名在牌上只出现一次，不会角落与正中各写一遍（`cardFace`）。
- **新手教程**：`/rules` 复用牌桌同一套牌渲染组件（`Card` / `HandFan` / `LevelBadge` / `TrickCluster`），
  含三道练手题（用与服务端同源的 `checkPlay` 即时判定）。依赖级牌的每个示例都标出将牌环境（`trumpText`），
  升级表只列**真实可达**的分数（得分恒为 5 的倍数），叫牌一节讲清阻击叫的心理博弈。
  教程里每个示例都由引擎函数在 `test:web` 中核对，规则改动导致示例失效会直接测试失败。

## 身份与凭据

无密码：输入名字即注册并签发令牌，浏览器 localStorage 保存 `base64url(名字:令牌)` 的凭据串，
一键复制到其它浏览器粘贴即可继续同一身份（服务端同时下发 httpOnly cookie 供 SSE 鉴权）。

## 一键部署

### Docker Compose（单机 / VPS）

```bash
docker compose up -d --build                     # → http://<主机>:3000
DOMAIN=game.example.com docker compose --profile https up -d --build   # → https://game.example.com（Caddy 自动证书）
```

- 镜像：`node:24-bookworm-slim` 两阶段构建（装依赖+构建 → 只带产物与运行期依赖），非 root 运行。
- 数据：命名卷 `sixty-data` 挂到容器 `/data`（`SIXTY_DB=/data/sixty.db`）。牌局状态、身份、事件日志都在这里，容器重建/升级不丢；重启续局已实测。
- 环境变量全部带默认值，可用 `${X:-默认}` 直接改：`PORT`（容器内端口，默认 3000）、`PUBLIC_PORT`（宿主映射，默认同 PORT）、`SIXTY_DB`、`DOMAIN`（仅 https profile）。
  **`ORIGIN` 例外：不要用 `${ORIGIN:-}` 这种写法**（宿主未设置时会注入空串导致容器起不来），需要时就写完整 URL 或整行留空不定义，见上文「本地运行」的警示。
- 健康检查：容器内 `GET /` 返回 200；`docker compose ps` 里看到 `healthy` 即就绪。
- 升级：`git pull && docker compose up -d --build`。
- 备份 / 恢复：
  ```bash
  docker run --rm -v sixty-points-ol_sixty-data:/data -v "$PWD":/backup alpine \
    tar czf /backup/sixty-backup.tgz -C /data .
  # 恢复：把 tar 解回同一个卷后再 up
  ```

### Coolify

1. 新建资源 → **Docker Compose** → 指向本仓库（compose 文件在根目录，无需改路径）。
2. **Domain 填 `<你的域名>:3000`** —— Coolify 里的端口是**容器端口**，不是公网端口；写错会 502。容器监听 3000（`PORT=3000`）。
3. 保持 `sixty-data:/data` 数据卷，否则每次部署都会清空牌局。
4. 需要 Coolify 自动注入域名变量时，在 `app.environment` 加一行 `- SERVICE_FQDN_APP_3000=<你的域名>`。

### SSE（实时推送）踩坑说明

回合制对战靠服务器推送（`/api/tables/<code>/stream`，`text/event-stream`）。中间层一旦缓冲或 gzip，症状是**页面正常但状态永远不刷新**：

- 应用侧已发 `Content-Type: text/event-stream` + `Cache-Control: no-cache` + `X-Accel-Buffering: no`。
- `docker-compose.yml` 已带 `traefik.http.middlewares.gzip.compress=false`（Coolify 默认会注入 gzip 中间件，必须关掉）。
- 用自带的 Caddy（`--profile https`）时，`deploy/Caddyfile` 对 SSE 路径单独设 `flush_interval -1`，其余路径正常压缩。

### 本机沙箱下的注意事项

`pnpm dev` / `pnpm build` / `docker` 需要 spawn 子进程与访问 Docker 命名管道，在受限沙箱里会 `EPERM`；在自己机器或 CI 上不受影响。若镜像构建在 esbuild 步骤报错，把 `pnpm-workspace.yaml` 里的 `allowBuilds: esbuild` 改成 `true` 再构建（本仓库默认关掉它，是因为它只是可选的原生二进制补装，关掉后构建同样可跑）。

## 暂未实现（v1 范围外）

观战、聊天/表情、计时器、机器人补位、多实例水平扩展。

## 许可

[Apache License 2.0](LICENSE) © 2026 Jason Li
