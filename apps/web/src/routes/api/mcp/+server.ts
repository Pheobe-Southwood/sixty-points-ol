import { error } from '@sveltejs/kit';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { createMcpServer } from '@sixty/mcp';
import { requireIdentity } from '$lib/server/auth';
import { serverApi } from '$lib/server/mcp-api';
import type { RequestHandler } from './$types';

/**
 * MCP over Streamable HTTP —— **JSON 响应模式 + 无状态**。
 *
 * 没有 SSE：POST 直接回一整段 JSON，不开 GET 流、不发会话 id。
 * 这样中间层（Caddy / traefik / Coolify）不需要为它加任何「不缓冲」白名单，
 * 服务端也不用在内存里养会话表 —— 每个请求自带 `Authorization: Bearer <凭据串>`，
 * 身份当场解析、用完即弃。设计与理由见 ADR-0010。
 */
export const POST: RequestHandler = async (event) => {
  const identity = requireIdentity(event);

  const server = createMcpServer({ api: serverApi(identity.id) });
  const transport = new WebStandardStreamableHTTPServerTransport({
    // JSON 模式：整段响应在 resolveJson 之后才拼出来，所以 handleRequest 返回的
    // Response 里的 body 已经是完整的（不依赖连接继续活着）
    enableJsonResponse: true
    // 不传 sessionIdGenerator = 无状态：请求之间没有任何要记住的东西
  });

  await server.connect(transport);
  try {
    return await transport.handleRequest(event.request);
  } finally {
    await server.close();
  }
};

function unsupported(method: string): never {
  throw error(
    405,
    `${method} 不支持：这个端点是无状态的 JSON 模式 MCP（只用 POST；没有 SSE 流，也没有会话可删）`
  );
}

export const GET: RequestHandler = () => unsupported('GET');
export const DELETE: RequestHandler = () => unsupported('DELETE');
