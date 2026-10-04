/**
 * stdio 传输的入口（`sixty-mcp`）：一个 MCP 服务器 = 一个身份（或者**没有**身份）。
 *
 * 配置（MCP 宿主的环境变量）：
 *   SIXTY_BASE_URL    服务器地址，默认 http://127.0.0.1:3000
 *   SIXTY_CREDENTIAL  **可选**：凭据串 = 浏览器里「复制凭据」得到的那串（base64url(名字:令牌)）。
 *                     不填就是**无身份会话**：只有 read_rules 与 claim 可用，其余工具回一句指路错误
 *                     （见 ADR-0014）—— 这样 AI 也能在「人类还没建身份」时把配置讲清楚、甚至代建一个。
 *   SIXTY_MCP_POLL_MS 可选：等待轮询间隔（毫秒，下限 500）
 *
 * 注意：**stdout 是 MCP 协议通道**，所有日志一律走 stderr。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { startupOf } from './bootstrap.ts';
import { httpApi, probeServer } from './http-api.ts';
import { createMcpServer } from './server.ts';
import { TOOLS } from './tools.ts';

const STARTUP = startupOf(process.env);
const POLL_MS = Number.parseInt(process.env['SIXTY_MCP_POLL_MS'] ?? '', 10);
const CREDENTIAL = STARTUP.mode === 'authenticated' ? STARTUP.credential : '';

function fail(message: string): never {
  console.error(`[sixty-mcp] ${message}`);
  process.exit(1);
}

/** 只在日志里露名字，绝不打印令牌 */
function nameOf(credential: string): string {
  try {
    const raw = Buffer.from(credential, 'base64url').toString('utf8');
    const sep = raw.indexOf(':');
    return sep > 0 ? raw.slice(0, sep) : '(凭据解析失败)';
  } catch {
    return '(凭据解析失败)';
  }
}

async function main(): Promise<void> {
  const api = httpApi({ baseUrl: STARTUP.baseUrl, credential: CREDENTIAL });

  // 启动自检：地址写错、服务没起、凭据无效都在这里当场报错，
  // 而不是等到第一次工具调用才失败（那时宿主只会看到一次莫名其妙的工具错误）。
  // **没有凭据是合法状态**，所以那条路只探活，不验凭据（见 ADR-0014 / bootstrap.ts）。
  try {
    if (CREDENTIAL.length === 0) await probeServer(STARTUP.baseUrl);
    else await api.listTables();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(
      CREDENTIAL.length === 0
        ? `连不上 ${STARTUP.baseUrl}：${detail}`
        : `连不上 ${STARTUP.baseUrl} 或凭据无效：${detail}`
    );
  }

  const server = createMcpServer({
    api,
    pollMs: Number.isFinite(POLL_MS) ? POLL_MS : undefined
  });
  await server.connect(new StdioServerTransport());
  console.error(
    CREDENTIAL.length === 0
      ? `[sixty-mcp] 未带凭据（无身份会话：只有 read_rules 与 claim 能用）已连上 ${STARTUP.baseUrl}；` +
          `${TOOLS.length} 个工具已列出，等待 MCP 客户端调用。配上 SIXTY_CREDENTIAL 后重连即可使用全部工具。`
      : `[sixty-mcp] 身份「${nameOf(CREDENTIAL)}」已连上 ${STARTUP.baseUrl}；${TOOLS.length} 个工具就绪，等待 MCP 客户端调用。`
  );
}

await main();
