/**
 * 在线态的判定与**投递**：谁在最近这段时间里发过请求，以及「刚上线/刚断开」有没有推到别人的屏幕上。
 *
 * MCP 工具面**不接 SSE**（见 ADR-0010：无长连接、`wait_for_turn` 有界轮询），
 * 所以「有 SSE 订阅」不足以描述它 —— 第一条规则补上另一半，界面上那颗点才不会对一个
 * 正在打牌的 agent 一直显示「离线」。第二条（翻转要广播）见 ADR-0012：
 * 光把「在线」的**取值**改对不够，值变了得有人把它**送出去**。
 * 第三条（断开时作废窗口）见 ADR-0013：断线是比 60 秒窗口更硬的证据。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  ACTIVE_WINDOW_MS,
  broadcast,
  forget,
  hasAnyConnection,
  isRecentlyActive,
  register,
  touch
} from '../src/lib/server/hub.ts';

test('活跃度：没请求过就不算在线', () => {
  assert.equal(isRecentlyActive(9001), false);
});

test('活跃度：touch 之后在线，窗口一过立刻过期并被清掉', () => {
  touch(9002);
  assert.equal(isRecentlyActive(9002), true);
  assert.equal(isRecentlyActive(9002, 0), false, '窗口为 0 时应立即过期');
  assert.equal(isRecentlyActive(9002), false, '过期后应已被清掉，不再留着占内存');
});

test('活跃度：窗口是「最近一分钟」这个量级', () => {
  assert.equal(ACTIVE_WINDOW_MS, 60_000);
});

test('活跃度：两个身份互不影响', () => {
  touch(9003);
  assert.equal(isRecentlyActive(9004), false);
  assert.equal(isRecentlyActive(9003), true);
});

test('touch 只在「离线→在线」那一次返回 true（否则每次轮询都会推一帧）', () => {
  const user = 9101;
  assert.equal(touch(user), true, '第一次请求就是上线，该推一帧');
  assert.equal(touch(user), false, '紧接着的第二次请求没有翻转');
  assert.equal(touch(user), false, '轮询期间持续请求也不该翻转');
  // 把窗口等过去：过期后下一次请求又是一次翻转
  isRecentlyActive(user, 0);
  assert.equal(touch(user), true, '窗口过期之后再次请求，是新的翻转');
});

// ---------------------------------------------------------------- 推送的投递

/** 一个假的 SSE 连接：只数自己被推了几次，可以同时在 push 里再触发一次广播 */
function fakeConnection(userId: number, onPush?: () => void): { userId: number; pushes: number; push: () => void } {
  const connection = {
    userId,
    pushes: 0,
    push: (): void => {
      connection.pushes += 1;
      onPush?.();
    }
  };
  return connection;
}

// ---------------------------------------------------------------- 断开时的收尾（ADR-0013）

test('作废活跃：forget 之后不再算在线，并且如实报告「是否真的清掉了」', () => {
  const user = 9501;
  touch(user);
  assert.equal(isRecentlyActive(user), true);
  assert.equal(forget(user), true, '清掉了要返回 true（调用方据此决定要不要广播）');
  assert.equal(isRecentlyActive(user), false, '断线之后不该还挂着窗口里的在线');
  assert.equal(forget(user), false, '本来就没记录时说 false，别让调用方白广播一轮');
});

test('连接计数：注销函数告诉你「这是不是他的最后一条连接」', () => {
  const user = 9502;
  const off = register(9_500_001, { userId: user, push: () => {} });
  assert.equal(hasAnyConnection(user), true);

  // 同一身份在另一张桌也连着（多标签页/多设备）
  const other = register(9_500_002, { userId: user, push: () => {} });
  assert.equal(off(), false, '他还有别的连接：不该判成「人不在了」');
  assert.equal(hasAnyConnection(user), true);
  assert.equal(other(), true, '这才是最后一条');
  assert.equal(hasAnyConnection(user), false);
});

test('注销是幂等的：重复调用不会把计数减穿（否则会误判「人走了」）', () => {
  const user = 9503;
  const off = register(9_500_003, { userId: user, push: () => {} });
  const keep = register(9_500_003, { userId: user, push: () => {} });
  assert.equal(off(), false);
  assert.equal(off(), false, '第二次调用不该再减一次');
  assert.equal(hasAnyConnection(user), true, '还有一条连接在，计数不该被减穿');
  keep();
  assert.equal(hasAnyConnection(user), false);
});

test('不同身份互不干扰：一个人断开不影响另一个人的计数', () => {
  const mine = 9504;
  const other = 9505;
  const offOther = register(9_500_004, { userId: other, push: () => {} });
  const offMine = register(9_500_005, { userId: mine, push: () => {} });
  assert.equal(offMine(), true);
  assert.equal(hasAnyConnection(other), true, '别人的连接不该被牵连');
  offOther();
});

// ---------------------------------------------------------------- 广播

test('广播：没有连接的桌是空操作（入座早于观战者连上时就是这个情形）', () => {
  broadcast(9_000_001);
});

test('广播：一轮里把每张桌的每条连接都推到', () => {
  const a = fakeConnection(9201);
  const b = fakeConnection(9202);
  const off = register(9_000_002, a);
  register(9_000_002, b);
  broadcast(9_000_002);
  assert.equal(a.pushes, 1);
  assert.equal(b.pushes, 1);
  off();
  broadcast(9_000_002);
  assert.equal(a.pushes, 1, '注销之后不该再被推到');
  assert.equal(b.pushes, 2);
});

test('广播可重入：推送里再触发一次广播会排到本轮之后，不会爆栈也不会丢帧', () => {
  const table = 9_000_003;
  let reentered = 0;
  // 这条连接在被推的时候又触发一次同一张桌的广播（`payloadFor` 里 touch 翻转就是这个形状）
  const nested = fakeConnection(9301, () => {
    if (reentered < 3) {
      reentered += 1;
      broadcast(table);
    }
  });
  register(table, nested);

  broadcast(table);
  // 没有爆栈、也没有死循环：每一轮的触发都排进队列，队列排空即返回
  assert.equal(reentered, 3);
  assert.equal(nested.pushes, 4, '每一轮都真的推了一帧（丢帧才是错的）');

  // 再推一次：这一次没有人再触发，应当刚好推一帧
  const before = nested.pushes;
  broadcast(table);
  assert.equal(nested.pushes, before + 1, '触发器停了之后，一次广播就是一帧');
});

test('广播：一条连接的 push 抛异常时把它摘掉，其余连接照旧', () => {
  const table = 9_000_004;
  const bad = fakeConnection(9401);
  const good = fakeConnection(9402);
  register(table, {
    userId: bad.userId,
    push: () => {
      throw new Error('这条连接已经死了');
    }
  });
  register(table, good);
  broadcast(table);
  assert.equal(good.pushes, 1);
  broadcast(table);
  assert.equal(good.pushes, 2, '坏连接只该影响自己');
});

