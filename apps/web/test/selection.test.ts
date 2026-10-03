/**
 * 选牌清空规则单测（见 `src/lib/selection.ts`）。
 *
 * 背景：服务端在**任何人**连上或断开这条 SSE 时都会广播一帧（`stream/+server.ts`），
 * 客户端若无条件清空 `selected`，观战者反复连断就能把在座玩家正在选的牌刷掉 ——
 * 观战开放后这条路径人人为之，且一个脚本就能做成「群体骚扰」。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import type { PublicView } from '@sixty/engine';
import { shouldResetSelection, type SelectionContext } from '../src/lib/selection.ts';

function view(version: number): PublicView {
  return {
    version,
    status: 'playing',
    dealerSeat: 0,
    dealNo: 1,
    levels: [],
    progress: [],
    result: null,
    history: [],
    deal: null
  };
}

function player(seat: number, version: number): SelectionContext {
  return { role: 'player', view: view(version), you: { seat: seat as 0 | 1 | 2, hand: [], isDeclarer: false } };
}

const spectator: SelectionContext = { role: 'spectator', view: view(7), you: null };

test('首帧（还没有上一帧）必须清空：初始化时不该留着任何选中态', () => {
  assert.equal(shouldResetSelection(null, player(0, 7)), true);
});

test('无关帧不清空：版本、角色、座位都没变（名单/在线点变化引起的广播）', () => {
  assert.equal(
    shouldResetSelection(player(0, 7), player(0, 7)),
    false,
    '同一版本的广播（观战者连上/断开）会清掉在座玩家正在选的牌'
  );
  assert.equal(shouldResetSelection(spectator, { ...spectator }), false, '观战者之间的无关帧也不该触发清空');
});

test('牌局推进要清空：版本变了说明上一墩/上一个叫品已落地', () => {
  assert.equal(shouldResetSelection(player(0, 7), player(0, 8)), true);
});

test('角色与座位变化要清空：选择属于上一个座位', () => {
  assert.equal(shouldResetSelection(spectator, player(0, 7)), true, '入座后旧选择必须丢掉');
  assert.equal(shouldResetSelection(player(0, 7), spectator), true, '离座后旧选择必须丢掉');
  assert.equal(shouldResetSelection(player(0, 7), player(1, 7)), true, '换到别的座位必须丢掉');
});

test('未开局（双方 view 都是 null）时，名单变化同样不清空', () => {
  const lobbyPlayer: SelectionContext = {
    role: 'player',
    view: null,
    you: { seat: 0, hand: [], isDeclarer: false }
  };
  assert.equal(shouldResetSelection(lobbyPlayer, { ...lobbyPlayer }), false);
});
