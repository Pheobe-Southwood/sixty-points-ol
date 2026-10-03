/**
 * 结算门槛单测：闲家到底要抓多少分才能把庄家打输。
 *
 * 被修掉的错误说法是「100 − 定约分 就是闲家的门槛」——它忽略了底牌分。
 * 这里除了自洽性，还用引擎测试里已经验证过的两笔真实账做交叉核对
 * （packages/engine/test/scoring.test.ts）：
 *   庄家 15 分 + 保底 1×25 → final 40，定约 40 ⇒ 打成；此时闲家 60 分，恰好卡在门槛上。
 *   闲家杀牌抠底 2×25 → final −50，定约 40 ⇒ 打输。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { defenderPointsOf, finalScoreOf, settlePreview } from '../src/lib/settle.ts';

test('finalScoreOf：保底加分、抠底扣分（可为负）', () => {
  assert.equal(finalScoreOf({ declarerPoints: 15, kittyPoints: 25, multiplier: 1, protectedBottom: true }), 40);
  assert.equal(finalScoreOf({ declarerPoints: 0, kittyPoints: 25, multiplier: 2, protectedBottom: false }), -50);
  assert.equal(finalScoreOf({ declarerPoints: 55, kittyPoints: 10, multiplier: 2, protectedBottom: true }), 75);
  assert.equal(finalScoreOf({ declarerPoints: 55, kittyPoints: 10, multiplier: 2, protectedBottom: false }), 35);
});

test('底牌分为 0 时，门槛才退化成 100 − 定约分', () => {
  for (const multiplier of [1, 2, 3]) {
    const preview = settlePreview({ contract: 45, kittyPoints: 0, multiplier });
    assert.equal(preview.protectBar, 55);
    assert.equal(preview.digBar, 55);
    assert.equal(preview.naiveBar, 55);
    assert.equal(preview.shift.protect, 0);
    assert.equal(preview.shift.dig, 0);
  }
});

test('末轮每人 1 张时保底不产生位移（m−1 = 0），抠底仍扣 2k', () => {
  const preview = settlePreview({ contract: 40, kittyPoints: 25, multiplier: 1 });
  assert.equal(preview.protectBar, 60, '保底 m=1：k(m−1)=0，门槛就是 100−40');
  assert.equal(preview.digBar, 10, '抠底 m=1：100−40−25×2 = 10');
});

test('交叉核对：引擎里的两笔真实结算', () => {
  // 庄家 15 分、底牌 25 分、m=1、保底 → final 40，定约 40 ⇒ 打成
  const protect = settlePreview({ contract: 40, kittyPoints: 25, multiplier: 1 });
  const defenderPoints = defenderPointsOf(15, 25);
  assert.equal(defenderPoints, 60);
  assert.equal(defenderPoints > protect.protectBar, false, '恰好等于门槛不能打输庄家');
  assert.equal(
    finalScoreOf({ declarerPoints: 15, kittyPoints: 25, multiplier: 1, protectedBottom: true }) >= 40,
    true
  );

  // 闲家杀牌抠底：底牌 25 分、m=2、庄家 0 分 ⇒ final −50 ⇒ 打输
  const dig = settlePreview({ contract: 40, kittyPoints: 25, multiplier: 2 });
  assert.equal(defenderPointsOf(0, 25), 75);
  assert.equal(75 > dig.digBar, true, '75 分应超过抠底门槛');
  assert.equal(
    finalScoreOf({ declarerPoints: 0, kittyPoints: 25, multiplier: 2, protectedBottom: false }) >= 40,
    false
  );
});

test('恒等式：庄家墩分 + 闲家墩分 + 底牌分 = 100', () => {
  for (let declarer = 0; declarer <= 100; declarer += 5) {
    for (let kitty = 0; kitty <= 25; kitty += 5) {
      const defender = defenderPointsOf(declarer, kitty);
      assert.equal(declarer + defender + kitty, 100);
    }
  }
});

test('保底门槛恒不低于抠底门槛，且差值正好是 k(2m)', () => {
  for (const contract of [40, 45, 50, 60, 70, 90, 120]) {
    for (const kittyPoints of [0, 5, 10, 15, 20, 25]) {
      for (const multiplier of [1, 2, 3, 4]) {
        const { protectBar, digBar, naiveBar } = settlePreview({ contract, kittyPoints, multiplier });
        assert.ok(protectBar >= digBar, '保底门槛应不低于抠底门槛');
        assert.equal(protectBar - digBar, kittyPoints * 2 * multiplier);
        assert.equal(protectBar - naiveBar, kittyPoints * (multiplier - 1));
        assert.equal(naiveBar, 100 - contract);
      }
    }
  }
});

test('教程用到的示例数值：定约 45♥、底牌 10 分', () => {
  const preview = settlePreview({ contract: 45, kittyPoints: 10, multiplier: 2 });
  assert.equal(preview.naiveBar, 55, '直觉值：100 − 45');
  assert.equal(preview.protectBar, 65, '保底：闲家要超过 65 分');
  assert.equal(preview.digBar, 25, '抠底：闲家只需要超过 25 分');
  assert.deepEqual(preview.shift, { protect: 10, dig: 30 });
});
