/**
 * 邀请码解析单测：既要能接受「直接粘贴的邀请链接」，也要挡住各种手滑输入。
 * 关键回归是：旧实现给输入框加了 maxlength="6"，粘贴链接会被截断成 6 个字符再去查库。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  invitePath,
  inviteUrl,
  normalizeInvite,
  parseInvite
} from '../src/lib/invite.ts';

test('裸码：大小写与两侧空白都归一化为大写', () => {
  assert.equal(parseInvite('ABC234'), 'ABC234');
  assert.equal(parseInvite('abc234'), 'ABC234');
  assert.equal(parseInvite('  abc234  '), 'ABC234');
  assert.equal(parseInvite('\tabc234\n'), 'ABC234');
});

test('完整邀请链接：各种形态都能取出码', () => {
  const code = 'Z5Z82Y';
  const cases = [
    `https://game.example.com/table/${code}`,
    `http://192.168.1.7:5178/table/${code}`,
    `http://127.0.0.1:5178/table/${code}/`,
    `https://game.example.com/table/${code}?from=wechat#top`,
    `game.example.com/table/${code}`,
    `  https://game.example.com/table/${code}  `,
    `https://game.example.com/table/${code.toLowerCase()}`
  ];
  for (const input of cases) {
    assert.equal(parseInvite(input), code, `未能从「${input}」解析出邀请码`);
  }
});

test('字母表外的字符与长度不符一律拒绝', () => {
  // I O 0 1 不在生成字母表内，属于典型手抄错误
  for (const bad of ['I23456', 'O23456', '023456', '123456', 'ABC23', 'ABC2345', 'ABC-34', '中文ABCD', '']) {
    assert.equal(parseInvite(bad), null, `不该接受「${bad}」`);
  }
  assert.equal(parseInvite('   '), null);
});

test('链接里码不合法时也拒绝，不会退化成「随便取一段」', () => {
  assert.equal(parseInvite('https://game.example.com/table/I23456'), null);
  assert.equal(parseInvite('https://game.example.com/table/'), null);
  assert.equal(parseInvite('https://game.example.com/lobby/ABC234'), null);
});

test('normalizeInvite 与字母表/长度常量自洽', () => {
  assert.equal(INVITE_CODE_LENGTH, 6);
  assert.equal(normalizeInvite(INVITE_CODE_ALPHABET.slice(0, INVITE_CODE_LENGTH)), INVITE_CODE_ALPHABET.slice(0, 6));
  // 字母表里不得出现易混字符
  for (const ch of 'IO01') {
    assert.equal(INVITE_CODE_ALPHABET.includes(ch), false, `字母表不该含「${ch}」`);
  }
  // 每个字母表字符都能被自己解析（含数字开头）
  for (const ch of INVITE_CODE_ALPHABET) {
    const code = (ch + INVITE_CODE_ALPHABET.slice(0, 5)).toUpperCase();
    assert.equal(normalizeInvite(code), code);
  }
});

test('invitePath / inviteUrl 拼接与去尾斜杠', () => {
  assert.equal(invitePath('abc234'), '/table/ABC234');
  assert.equal(inviteUrl('https://game.example.com', 'abc234'), 'https://game.example.com/table/ABC234');
  assert.equal(inviteUrl('https://game.example.com/', 'abc234'), 'https://game.example.com/table/ABC234');
  assert.equal(inviteUrl('http://192.168.1.7:5178', 'Z5Z82Y'), 'http://192.168.1.7:5178/table/Z5Z82Y');
});

test('回归：inviteUrl 生成的链接一定能被 parseInvite 还原（往返自洽）', () => {
  for (const code of ['ABC234', 'Z5Z82Y', '222222', 'ABCDEF']) {
    assert.equal(parseInvite(inviteUrl('https://game.example.com', code)), code);
    assert.equal(parseInvite(inviteUrl('http://192.168.1.7:5178/', code.toLowerCase())), code);
  }
});
