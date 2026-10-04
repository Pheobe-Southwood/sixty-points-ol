import { error } from '@sveltejs/kit';
import { requireIdentity } from '$lib/server/auth';
import { connectionClosed, getTableByCode, payloadFor } from '$lib/server/tables';
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
      // `closed` = 别再往这条流里写；`cleaned` = 收尾动作已经做过（幂等，见下）
      let closed = false;
      let cleaned = false;
      let ping: ReturnType<typeof setInterval> | undefined;

      /** 往流里写；写不动了就收尾 —— 那就是「socket 已经死了」的信号 */
      const write = (chunk: string): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };

      const pushFrame = (): void => {
        const current = getTableByCode(table.code) ?? table;
        write(`data: ${JSON.stringify(payloadFor(current, userId))}\n\n`);
      };

      /**
       * 收尾：**唯一的**注销路径 —— 客户端断开（abort）与写不出去都走它。
       *
       * 两条路都必须在，理由各一：abort 覆盖「关标签页」这类正常断开；写不出去覆盖 socket 已经死掉
       * 而 abort 没来的情形。以前写失败只把自己标成 closed、**不注销**，于是那条死连接永远留在连接表里 ——
       * 既是假在线，还会被后续每一次广播反复刷新（见 ADR-0013）。
       */
      const cleanup = (): void => {
        if (cleaned) return;
        cleaned = true;
        closed = true;
        if (ping !== undefined) clearInterval(ping);
        unregister();
        // 他不在了 ⇒ 「最近活跃」也该作废，否则那颗点还要绿最多 60 秒（他若还有别的连接则不动）
        connectionClosed(userId);
        broadcast(tableId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };

      const unregister = register(tableId, { userId, push: pushFrame });
      pushFrame();
      // 座位在线状态变化也要让其他人看到
      broadcast(tableId);

      ping = setInterval(() => write(': ping\n\n'), 25_000);
      event.request.signal.addEventListener('abort', cleanup);
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
