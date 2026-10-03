/**
 * 在线态的判定：谁在最近这段时间里发过请求。
 *
 * MCP 工具面**不接 SSE**（见 ADR-0010：无长连接、`wait_for_turn` 有界轮询），
 * 所以「有 SSE 订阅」不足以描述它 —— 这条规则补上另一半，界面上那颗点才不会对一个
 * 正在打牌的 agent 一直显示「离线」。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { ACTIVE_WINDOW_MS, isRecentlyActive, touch } from '../src/lib/server/hub.ts';

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
