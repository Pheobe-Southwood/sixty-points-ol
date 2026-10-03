import { error } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { getTableByCode, payloadFor } from '$lib/server/tables';
import { broadcast, register } from '$lib/server/hub';
import type { RequestHandler } from './$types';

/** 每人一条 SSE：在座推个人视图，观战推公共视图（角色每帧现算，隐藏信息只在服务端过滤） */
export const GET: RequestHandler = async (event) => {
  const identity = requireIdentity(event);
  const table = getTableByCode(event.params.code);
  if (table === null) error(404, '同桌不存在');

  const encoder = new TextEncoder();
  const tableId = table.id;
  const userId = identity.id;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (): void => {
        if (closed) return;
        try {
          const current = getTableByCode(table.code) ?? table;
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payloadFor(current, userId))}\n\n`));
        } catch {
          closed = true;
        }
      };

      const unregister = register(tableId, { userId, push: send });
      send();
      // 座位在线状态变化也要让其他人看到
      broadcast(tableId);

      const ping = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(': ping\n\n'));
        } catch {
          closed = true;
        }
      }, 25_000);

      const stop = (): void => {
        if (closed) return;
        closed = true;
        clearInterval(ping);
        unregister();
        try {
          controller.close();
        } catch {
          /* already closed */
        }
        broadcast(tableId);
      };

      event.request.signal.addEventListener('abort', stop);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no'
    }
  });
};
