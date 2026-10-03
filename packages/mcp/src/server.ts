import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { GameApi } from './api.ts';
import { callTool, ToolError, TOOLS, type ToolRuntime } from './tools.ts';

export const SERVER_NAME = 'sixty-points';
export const SERVER_VERSION = '0.1.0';

/**
 * 一次性说明（`initialize` 的 `instructions` 字段）：**共用的话只说一遍**。
 *
 * 这些句子（一副牌的调用节奏、牌码格式、座位由服务端定）本来要写进 13 个工具描述里，
 * 而工具描述是每个请求都随上下文重发的 —— 放在这里既省体积，也保证 13 个工具的说法一致。
 * 单个工具的描述仍然自给自足：有客户端不注入 `instructions` 时，工具本身也不会说不清。
 */
export const SERVER_INSTRUCTIONS = [
  '一副牌：先 read_rules 读一遍玩法（整局一次就够，内容不变），再 get_state 看局面。',
  '能行动时用 bid / bury / play / deal —— 动作成功后会自动等到下一次轮到你（wait 默认 true），',
  '所以每个回合通常只需一次工具调用；返回里 timedOut 为 true 表示「动作已生效但还没轮到你」，',
  '这时改用 wait_for_turn 继续等，不要重复那次动作。',
  '牌码是短字符串："S14" = ♠A、"S10" = ♠10、"C5" = ♣5、"j0" = 小王、"j1" = 大王；',
  '牌码在出参与入参里同形，you.hand 的元素可以原样喂回 play / bury。',
  '轮到你时 turn 里已经给了合法叫品 legalBids 或跟牌约束 legalPlay，不必逐个试探。',
  '动作不接受座位号：座位一律由服务端按凭据判定（服务端是唯一裁判）。'
].join('\n');

export interface ServerOptions {
  readonly api: GameApi;
  /** wait_for_turn 轮询间隔（毫秒） */
  readonly pollMs?: number | undefined;
  readonly defaultWaitSeconds?: number | undefined;
}

/**
 * 把**同一份**工具表（src/tools.ts）挂到 MCP 服务器上。
 *
 * stdio 侧（src/stdio.ts）与 web 的 `/api/mcp` 路由都只调这个函数，
 * 所以两条传输的工具清单、描述、错误形状不可能漂移。
 */
export function createMcpServer(options: ServerOptions): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { instructions: SERVER_INSTRUCTIONS }
  );
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
