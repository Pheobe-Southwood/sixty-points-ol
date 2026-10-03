# SvelteKit 单应用 + SSE 推送 + POST 动作

线上《六十分》是回合制、3 人同桌、服务器必须隐藏手牌与底牌的游戏。决定用一个 SvelteKit 应用（adapter-node）承载全部前后端：游戏动作走 `fetch` POST 到 `+server.ts` 端点，状态推送走每玩家一条 SSE 流（`+server.ts` 流式响应），不引入独立 WebSocket 网关或自定义服务器。数据库为单文件 SQLite + WAL（驱动见 ADR-0004），部署为单实例（Docker/Coolify）。

理由：回合制对延迟不敏感，SSE 单向推送 + POST 动作已覆盖需求且全部落在 SvelteKit 原生能力内；断线重连只需重拉全量个人视图，无需会话粘滞。WebSocket 方案需要自定义服务器包装 SvelteKit handler 与双套连接管理，收益小、复杂度高，故弃。

后果：不支持多实例水平扩展（内存订阅表 + SQLite 单写者）；若未来需要观战聊天等高频双向通道，再评估升级。
