import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GameApi } from './api.ts';
import { callTool, ToolError, TOOLS, type ToolRuntime } from './tools.ts';

export const SERVER_NAME = 'sixty-points';
export const SERVER_VERSION = '0.1.0';

export interface ServerOptions {
  readonly api: GameApi;
  /** wait_for_turn 轮询间隔（毫秒） */
  readonly pollMs?: number | undefined;
  /** wait_for_turn 默认超时（秒） */
  readonly defaultWaitSeconds?: number | undefined;
}

/**
 * 把**同一份**工具表（src/tools.ts）挂到 MCP 服务器上。
 *
 * stdio 侧（src/stdio.ts）与 web 的 `/api/mcp` 路由都只调这个函数，
 * 所以两条传输的工具清单、描述、错误形状不可能漂移。
 */
export function createMcpServer(options: ServerOptions): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  const runtime: ToolRuntime = {
    api: options.api,
    pollMs: options.pollMs,
    defaultWaitSeconds: options.defaultWaitSeconds
  };

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input },
      async (args) => {
        try {
          const value = await callTool(tool, runtime, args);
          return { content: [{ type: 'text' as const, text: JSON.stringify(value) }] };
        } catch (error) {
          // 工具级失败（服务端拒绝、参数错、超时）：回一句人话 + isError，
          // 让调用方自己决定是重读局面还是改参数，而不是把整个会话打崩。
          const message =
            error instanceof ToolError || error instanceof Error ? error.message : String(error);
          return { content: [{ type: 'text' as const, text: message }], isError: true };
        }
      }
    );
  }

  return server;
}
