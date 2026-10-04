# 六十分（Sixty Points）线上版

三人 1v2 的顺子类牌戏：一副 54 张，桥牌式叫牌定庄定将，双升式打牌与升级赛程。线上实现为
SvelteKit + SSE 单实例应用，规则引擎是零依赖纯 TypeScript 包并有完整单测/属性测试。

[![CI](https://github.com/cup113/sixty-points-ol/actions/workflows/ci.yml/badge.svg)](https://github.com/cup113/sixty-points-ol/actions/workflows/ci.yml)

## 目录

```
packages/engine     纯 TS 规则引擎（零依赖，可被服务端与客户端共用）
  src/              cards / order / validate / trick / auction / state / view / help
  test/             node:test 表驱动 + 属性测试（默认 60 个随机整局，GAME_SEEDS 可放大）
packages/mcp        MCP 工具面（stdio 入口 + 与传输无关的工具定义，两条传输共用）
  src/              tools（工具表）/ server（挂到 SDK）/ http-api（stdio 取数）/ wire / stdio
  test/             node:test：工具层单测 + 内存链对上的协议单测 + stdio 启动契约
  scripts/          mcp-check.ts（两条传输各打一整副 + 形状/在线/权威守卫）
apps/web            SvelteKit 2 + Svelte 5 + Tailwind 4 + adapter-node
  src/lib/server/   SQLite（node:sqlite）、身份凭据、同桌服务、SSE hub、MCP 进程内适配层
  src/routes/       大厅、同桌页、新手教程（/rules）、REST 动作接口（含入座/离座）、SSE 流、MCP（/api/mcp）
  scripts/          smoke.ts（三人 HTTP 端到端）、resume-check.ts（重启续局校验）
                    lobby-check.ts（开局入口回归）、ui-check.ts（版面与文案守卫）
                    spectate-check.ts（观战/离座/改名换身份的端到端回归）
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
pnpm test:web         # 前端纯函数测试：扇形布局 / 邀请码解析 / 阶段说明 / 牌面映射 / 结算门槛 / 教程示例 / 角色与观战投影
                      #                    + 在线态判定 + MCP 作弊面守卫
pnpm test:mcp         # MCP 工具层单测：工具语义、参数校验、等待超时、协议注册一致性、stdio 启动契约
pnpm check            # 引擎 tsc + MCP 包 tsc + 应用 svelte-check
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
                                                       # 另含「未注册点邀请链接」：邀请码带进大厅、注册后回到原桌
BASE=http://127.0.0.1:5178 pnpm --filter web ui        # 版面/文案守卫：position 类不得混用、座位卡必须 absolute、
                                                       # 邀请码可点复制、常驻提示已清空、? 按阶段给说明、无方位称谓、
                                                       # /rules 九个小节齐备且渲染真实牌面、
                                                       # 王牌面（名字只在角落索引、正中是 ☀/☾ 图案）、
                                                       # 出货样式表里不得再有牌角装饰点（.card.pt / .card.trump::after）
BASE=http://127.0.0.1:5178 pnpm --filter web resume    # 重启服务端后再跑，校验 SQLite 续局
BASE=http://127.0.0.1:5178 pnpm --filter web spectate  # 观战/离座/改名换身份：满座第 4 人只看公共信息、
                                                       # 观战负载不含在座手牌、补位继承该座位的手牌与级别、
                                                       # 在座不能改名或换身份、改名后旧凭据失效
BASE=http://127.0.0.1:5178 pnpm mcp-check              # MCP 端到端：两条传输各打一整副（stdio 真 spawn + /api/mcp）
                                                       # 顺带核对 wire 形状、MCP 座位的在线态、以及非法出牌必被服务端拒绝
```

冒烟脚本用 `data/smoke-run.json` 保存凭据供续局校验使用。

> 受限沙箱（piped stdio 一律 EPERM，见 AGENTS 规则 5）里 `mcp-check` 要加 `SPAWN=0`：
> 它改用 SDK 的内存链对驱动同一套工具表，只是不起 stdio 子进程；
> stdio 那条进程级契约由 `pnpm test:mcp` 里的启动契约测试覆盖（同样需要能 spawn 子进程）。

## 界面约定

- **说明只在一处**：牌桌上的阶段玩法说明全部收在左下角的「?」弹层（内容与 `/rules` 教程同源，
  见 `packages/engine/src/help.ts`）；界面上不再有常驻提示文案，玩家不需要在三个角落各读一遍。
- **玩家名而不是方位**：文案里一律用玩家名或「你」（`whoLabel`），不出现「东/南/西家」——
  四角座位卡显示的就是名字，方位在屏幕上没有锚点。
- **点邀请码即复制链接**：`<origin>/table/<邀请码>`；大厅的入座框既接受 6 位邀请码，也接受直接粘贴的完整链接
  （`parseInvite`）。局域网 http 下浏览器没有 Clipboard API，会自动退化成可手动复制的链接输入框。
  还没注册的人点开链接会被带到大厅，但**邀请码随 URL 一起带过去**（`/?join=<邀请码>`）：注册或导入身份后
  自动回到那张桌，不需要重新点一次链接。
- **无重复信息**：同一件事只说一遍（如「庄已抓 X / 需 Y」里的分母就是旁边的定约分，只保留一个）。
- **牌面**：主牌只靠**金边**区分，四个角没有任何装饰点（点看着像另一张牌）；分牌就是 5 / 10 / K，认点数即可。
  大小王按真牌的布局：**牌名只在两处角落索引里**（「大/小 + 王」），两处镜像一致；**正中是一枚图案**（大王 ☀ / 小王 ☾）。
  牌名在牌上只出现一次，不会角落与正中各写一遍（`cardFace`）。
- **新手教程**：`/rules` 复用牌桌同一套牌渲染组件（`Card` / `HandFan` / `LevelBadge` / `TrickCluster`），
  含三道练手题（用与服务端同源的 `checkPlay` 即时判定）。依赖级牌的每个示例都标出将牌环境（`trumpText`），
  升级表只列**真实可达**的分数（得分恒为 5 的倍数），叫牌一节讲清阻击叫的心理博弈。
  教程里每个示例都由引擎函数在 `test:web` 中核对，规则改动导致示例失效会直接测试失败。
- **观战与离座**：满座（3 人）时用邀请链接进来即成为观战者，只看**公共视图**（手牌张数与已打出的牌，
  不含任何手牌与结算前的底牌）；在座者随时可点「离座」，座位空出、本副停在空座上等人补位，
  补位者继承该座位的级别与手牌（若本副尚未结算，界面会明说「你补进了空座、接下这手 N 张牌」，免得拿着
  陌生手牌发愣）。牌桌右上角只在有人看时显示「N 人观战」（实时连接数）。
  不在座位上时才能改名字或换身份 —— 改名会让凭据串重签，大厅与观战页都会把新串写回本机。
  观战记录不会自动清除（只有入座才清），所以大厅「我的同桌」会一直列出你在观战的那张桌（上限 20 条）。

## 身份与凭据

无密码：输入名字即注册并签发令牌，浏览器 localStorage 保存 `base64url(名字:令牌)` 的凭据串，
一键复制到其它浏览器粘贴即可继续同一身份（服务端同时下发 httpOnly cookie 供 SSE 鉴权）。

## 让 LLM 也来玩（MCP）

LLM 在这套系统里**就是一个普通身份**：服务器不区分人类与 LLM，座位上也没有「机器人席位」这种东西。
仓库提供的是 **MCP 工具面**（工具定义只有一份，理由与取舍见 ADR-0010；投喂量怎么省见 ADR-0011）；
"会不会打牌"由接上来的宿主决定，仓库不自带任何打牌策略。

### 1. 先给 agent 一个身份

浏览器里「创建身份」（例如 `小六`）→ 点**复制凭据**。凭据串是 `base64url(名字:令牌)`，
和"复制到别的浏览器继续用"是同一个东西：MCP 客户端只是**另一台设备**。

**一个座位一个凭据**：同一个凭据同时被人和 agent 用，两边会互相抢着出牌（会看到「还没轮到你」）。

### 2. 接 stdio（本地进程；Claude Code / Claude Desktop 等）

```json
{
  "mcpServers": {
    "sixty-points": {
      "command": "node",
      "args": ["/path/to/sixty-points-ol/packages/mcp/src/stdio.ts"],
      "env": {
        "SIXTY_BASE_URL": "https://game.example.com",
        "SIXTY_CREDENTIAL": "<第 1 步复制的凭据串>"
      }
    }
  }
}
```

启动时会先自检一次：地址写错、服务没起、凭据无效都**当场以非 0 退出并说明原因**，而不是等到第一次
工具调用才失败。日志一律走 stderr（stdout 是 MCP 协议通道），缺凭据时会直接告诉你该配哪个环境变量。

### 3. 或者连服务端自带的 `/api/mcp`

不需要本地 Node：`POST https://game.example.com/api/mcp`，用 `Authorization: Bearer <凭据串>` 鉴权。
它是 Streamable HTTP 的 **JSON 响应模式 + 无状态**：不开 SSE 流、不发会话 id，所以反代
（Caddy / traefik / Coolify）不需要为它加任何白名单；没有会话，也就没有「谁的会话」这回事。
一个 POST 最长会挂 30 秒（动作自带等待：等你下一次能行动就返回），`wait_for_turn` 最长 60 秒；
反代只要没有更短的响应超时即可（Caddy / traefik 默认没有）—— 若部署侧的响应超时更短，
给动作传 `wait: false`、并把 `wait_for_turn` 的 `timeout_seconds` 调小即可避开。

### 工具（13 个）

| 工具 | 作用 |
| --- | --- |
| `get_state` | 读当前局面：**只有你的手牌** + 公开信息，并附 `turn`（轮到谁、能不能动、该做什么） |
| `wait_for_turn` | 等到能行动再返回（默认 30s、上限 60s；超时返回 `timedOut`，直接再调一次即可） |
| `read_rules` | 读玩法说明；不传 `key` 返回全部九个阶段（与「?」弹层、`/rules` 同源）；**整局读一次就够** |
| `legal_bids` | 当前所有合法叫品（与牌桌叫牌面板同一份实现）；**叫牌阶段之外返回空表** |
| `check_play` | 出牌前的本地预判，一次可验多组候选（服务端始终是唯一裁判） |
| `bid`／`bury`／`play`／`deal`／`new_game` | 动作，**成功后自动等到下一次轮到你**（`wait`，默认 true），返回那一刻的局面 |
| `list_my_tables`／`join_table`／`create_table` | 找到该坐哪张桌／用邀请码入座／自己开一张桌 |

工具**不接受座位号**：座位一律由服务端按身份推导（ADR-0002）。所有读写都只经过**个人视图**，
所以 agent 看不到别人的手牌与底牌；进程内那条路另有静态守卫钉着（随 `pnpm test:web` 跑）。

牌面写成短码：`"S14"` = ♠A、`"S10"` = ♠10、`"C5"` = ♣5、`"j0"` = 小王。出参与入参同形 ——
`get_state` 里 `you.hand` 的元素可以原样喂回 `play`／`bury`。轮到你时 `turn.legalBids` /
`turn.legalPlay` 已经把「能怎么做」给出来了，**不需要逐张试探**。

### 一副牌要说多少话

工具面是**每个回合都要重发一遍**的（宿主每个请求都带着整段会话与工具面 schema），
所以这里花的不是一次性的钱。按座位 0 打完整一副实测（RNG 固定，见 ADR-0011）：

| | 逐字负载 + 每回合两次调用 | 紧凑投影 + 动作自带等待 |
| --- | --- | --- |
| 一副牌的实收负载 | 116,278 字符 | **35,636** |
| 模型累计读入 | 1,845,222 | **401,156** |
| 每副的调用数 | 38 | **21** |

想逐字看引擎类型时给 `get_state`／`wait_for_turn` 传 `verbose: true`；
真正的预算是会红的断言（`packages/mcp/test/payload-budget.test.ts` 卡单副与整局，
`pnpm mcp-check` 再对真服务器卡一次调用数与字节数）。

界面上的那颗点对 agent 也有效：它没有 SSE，但每次请求都会刷新「最近活跃」，
因此它在打牌时显示**在线**，停手一分钟才转灰。状态变了要**推出去**才算数 ——
`join_table` 入座、以及它从离线变在线的那一刻，都会广播给同桌的连接，所以同桌页上的座位卡、
`ready` 与「开始第一副」不用等谁先出一次牌（见 ADR-0012）。

写路径（`bid`／`bury`／`play`／`deal`／`new_game`／`create_table`／`join_table`）**不会自动重试**：
服务端没有幂等键，重发一次就可能把已经生效的动作变成两次、或者凭空多开一张桌。所以连接在提交后
断掉时，工具会如实说「无法确认这次请求是否已经生效」，并让你先用 `get_state`／`list_my_tables`
核对现状再决定 —— 读（`get_state`／`list_my_tables`）是幂等的，会自己重试一次。

## 一键部署

### Docker Compose（单机 / VPS）

```bash
docker compose up -d --build                     # → http://<主机>:3000
DOMAIN=game.example.com docker compose --profile https up -d --build   # → https://game.example.com（Caddy 自动证书）
```

- 镜像：`node:24-bookworm-slim` 两阶段构建（装依赖+构建 → 只带产物与运行期依赖），非 root 运行。
- 数据：命名卷 `sixty-data` 挂到容器 `/data`（`SIXTY_DB=/data/sixty.db`）。牌局状态、身份、座位与观战记录、事件日志都在这里，容器重建/升级不丢；重启续局已实测。
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

### 预构建镜像（GHCR，GitHub Actions 自动构建）

`.github/workflows/ci.yml` 在 CI 上构建镜像并推到 `ghcr.io/cup113/sixty-points-ol`：先过 `pnpm test` / `pnpm test:web` / `pnpm test:mcp` / `pnpm check`，
再用**构建产物**起服务跑一遍 MCP 端到端（两条传输各打一整副），全绿才出镜像。

| 触发 | 产出的标签 |
| --- | --- |
| push `main` | `latest`、`main`、`sha-<7位>`（如 `sha-af7ae45`） |
| push `v*` 标签（如 `v0.2.0`） | `0.2.0`、`0.2`，外加分支规则命中时的标签 |
| PR | 只试构建，**不推送** |
| Actions 页面手动 `Run workflow` | 按所在分支 / 标签出标签 |

镜像只覆盖 `linux/amd64`（ARM 主机需本地 build，或按 ADR-0006 加 QEMU 多架构）；不需要任何 Secret，用仓库内置 `GITHUB_TOKEN` 授权。

不依赖仓库、直接拉预构建镜像运行（数据卷必须保留，否则每次重建都清空牌局）：

```bash
docker pull ghcr.io/cup113/sixty-points-ol:latest
docker run -d --name sixty -p 3000:3000 -v sixty-data:/data \
  -e PORT=3000 ghcr.io/cup113/sixty-points-ol:latest
```

要可回滚就固定版本：`:sha-af7ae45` 或 `:0.2.0`。

Coolify 用预构建镜像：新建资源 → **Docker Image**（不是 Docker Compose），镜像填 `ghcr.io/cup113/sixty-points-ol:latest`，Domain 端口仍填**容器端口** `3000`，挂 `sixty-data:/data`。注意 `docker-compose.yml` 本身仍是本地 build（compose 里 `build:` 优先于 `image:`），别指望现有 compose 资源自动改用 CI 镜像。

排查：

- `docker pull` 报 `denied` / 404：到 GHCR 里把该包可见性设为 Public（公开仓库的包通常默认就是）。
- CI 推镜像报 `write_package` / `permission_denied`：仓库 Settings → Actions → General → Workflow permissions 设为 **Read and write**。

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

`pnpm dev` / `pnpm build` / `docker` 需要 spawn 子进程与访问 Docker 命名管道，在受限沙箱里会 `EPERM`；在自己机器或 CI 上不受影响（镜像构建已在 `.github/workflows/ci.yml` 里跑，本地沙箱受限只影响本地 build/dev）。若镜像构建在 esbuild 步骤报错，把 `pnpm-workspace.yaml` 里的 `allowBuilds: esbuild` 改成 `true` 再构建（本仓库默认关掉它，是因为它只是可选的原生二进制补装，关掉后构建同样可跑）。

## 暂未实现（v1 范围外）

聊天/表情、计时器、机器人补位、观战者的全知/延迟视图、多实例水平扩展。

其中「机器人补位」的边界：仓库提供 **MCP 工具面**（见 ADR-0010），让 LLM 能以普通身份坐上空座，
但仓库里**没有**会自己思考的 agent —— 是否会打牌取决于接上来的宿主。

## 许可

[Apache License 2.0](LICENSE) © 2026 Jason Li
