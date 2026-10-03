/**
 * `@sixty/mcp`：六十分的 MCP 工具面。
 *
 * - `tools.ts` 是与传输无关的**唯一**工具定义（不 import SDK）
 * - `http-api.ts` 是 stdio 侧的取数实现（只走公开 HTTP 接口）
 * - `server.ts` 把工具表挂到 MCP 服务器上（SDK 的边界就在这里）
 * - `wire.ts` 是本包消费的平台层 wire 形状（由 mcp-check 对着真实响应核对）
 *
 * web 的 `/api/mcp` 路由复用同一套工具与 server，只是把取数换成进程内实现。
 */
export * from './api.ts';
export * from './http-api.ts';
export * from './wire.ts';
export * from './tools.ts';
export * from './server.ts';
