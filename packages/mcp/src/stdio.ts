/**
 * stdio 传输的入口（`sixty-mcp`）：一个 MCP 服务器 = 一个身份。
 *
 * 配置（MCP 宿主的环境变量）：
 *   SIXTY_BASE_URL    服务器地址，默认 http://127.0.0.1:3000
 *   SIXTY_CREDENTIAL  凭据串 = 浏览器里「复制凭据」得到的那串（base64url(名字:令牌)）
 *   SIXTY_MCP_POLL_MS 可选：等待轮询间隔（毫秒，下限 500）
 *
 * 注意：**stdout 是 MCP 协议通道**，所有日志一律走 stderr。
 */
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { httpApi } from './http-api.ts';
import { createMcpServer } from './server.ts';

const BASE_URL = process.env['SIXTY_BASE_URL'] ?? 'http://127.0.0.1:3000';
const CREDENTIAL = (process.env['SIXTY_CREDENTIAL'] ?? '').trim();
const POLL_MS = Number.parseInt(process.env['SIXTY_MCP_POLL_MS'] ?? '', 10);

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
  if (CREDENTIAL.length === 0) {
    fail(
      '缺少 SIXTY_CREDENTIAL：先在浏览器里创建/选中那个身份，点「复制凭据」，' +
        '再把凭据串填进 MCP 客户端配置的环境变量。'
    );
  }

  const api = httpApi({ baseUrl: BASE_URL, credential: CREDENTIAL });

  // 启动自检：地址写错、服务没起、凭据无效都在这里当场报错，
  // 而不是等到第一次工具调用才失败（那时宿主只会看到一次莫名其妙的工具错误）。
  try {
    await api.listTables();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    fail(`连不上 ${BASE_URL} 或凭据无效：${detail}`);
  }

  const server = createMcpServer({
    api,
    pollMs: Number.isFinite(POLL_MS) ? POLL_MS : undefined
  });
  await server.connect(new StdioServerTransport());
  console.error(
    `[sixty-mcp] 身份「${nameOf(CREDENTIAL)}」已连上 ${BASE_URL}；13 个工具就绪，等待 MCP 客户端调用。`
  );
}

await main();
