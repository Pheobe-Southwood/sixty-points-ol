/**
 * 机器人作弊面守卫：驱动器（`apps/web/src/lib/server/bots.ts`）与加/移座位的路由
 * 只能经过**个人视图**取信息、经过 `applyTableAction` 发动作。
 *
 * 为什么需要它：这个文件和 `/api/mcp` 的进程内适配层一样，离完整权威状态只有一步之遥
 * （`db` 就在隔壁）。ADR-0015 的承诺是「机器人看不到别人的手牌与底牌」——那条承诺
 * 由这里静态钉死，而不是靠自律。
 *
 * 守卫本身也要被守卫：`violationsOf` 是纯函数，先喂故意违规的源码证明它真会红
 * （AGENTS 规则 9：空转的断言比没有断言更糟）。扫描逻辑在 `import-scan.ts` 里，
 * 与 `mcp-guard.test.ts` 共用 —— 原来两边各抄一份，连同一个「只认单引号」的盲区也抄了两遍。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { importedModules, violationsOf, type GuardRule } from './import-scan.ts';

const GUARDED: readonly { readonly file: string; readonly rule: GuardRule }[] = [
  {
    file: '../src/lib/server/bots.ts',
    rule: {
      allow: ['node:crypto', '@sixty/engine', '@sixty/bot', './db', './hub', './tables', '../shared'],
      forbidden: [
        'getGameState', // 完整 GameState（含三家手牌与底牌）
        'saveGame',
        'appendEvents',
        'dispatch', // 引擎入口：拿到 state 才能调
        'createGame',
        'structuredClone',
        'personalView' // 必须经 viewFor（按身份过滤）而不是自己转
      ]
    }
  },
  {
    file: '../src/routes/api/tables/[code]/bot/+server.ts',
    rule: {
      allow: ['@sveltejs/kit', '$lib/server/auth', '$lib/server/bots', './$types'],
      forbidden: ['getGameState', 'dispatch', 'createGame', 'personalView', 'db']
    }
  }
];

const BOTS_RULE = GUARDED[0]!.rule;
const ROUTE_RULE = GUARDED[1]!.rule;

test('机器人驱动器与路由不得触碰完整牌局状态', () => {
  for (const { file, rule } of GUARDED) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual(
      violationsOf(source, rule),
      [],
      `${file} 越权了：机器人只允许经 viewFor/applyTableAction 拿个人视图`
    );
  }
});

test('守卫非空转：违规源码必须被抓住', () => {
  assert.deepEqual(violationsOf("import { getGameState } from './tables';", BOTS_RULE), ['getGameState']);
  assert.deepEqual(violationsOf('const v = personalView(state, seat);', BOTS_RULE), ['personalView']);
  assert.deepEqual(violationsOf("import { dispatch } from '@sixty/engine';", BOTS_RULE), ['dispatch']);
  // 换一个没有白名单的模块：机器人不许自己去够别人的存储
  assert.deepEqual(violationsOf("import { db } from './store';", BOTS_RULE), ['import ./store']);
  assert.deepEqual(violationsOf("import { db } from '$lib/server/db';", ROUTE_RULE), [
    'db',
    'import $lib/server/db'
  ]);
  // 注释里提到这些名字不算违规（否则文档就不能解释这条守卫）
  assert.deepEqual(violationsOf('// 不碰 getGameState 与 dispatch\nconst ok = 1;', BOTS_RULE), []);
  // 字符串里的 `//` 不能被当成注释，否则后半段就成了盲区
  assert.deepEqual(violationsOf("const u = 'http://x';\nconst s = getGameState();", BOTS_RULE), [
    'getGameState'
  ]);
});

test('守卫认得出 import 的所有写法（双引号 / 副作用 / 动态）', () => {
  // 双引号：与单引号是同一个意思，必须一样抓（这是原来的盲区）
  assert.deepEqual(violationsOf('import { db } from "./store";', BOTS_RULE), ['import ./store']);
  assert.deepEqual(violationsOf('import { readFileSync } from "node:fs";', BOTS_RULE), [
    'import node:fs'
  ]);
  // 副作用引入：没有 `from`，原来的正则整条漏掉
  assert.deepEqual(violationsOf("import 'node:fs';", BOTS_RULE), ['import node:fs']);
  // 动态 import：也没有 `from`
  assert.deepEqual(violationsOf("const fs = await import('node:fs');", BOTS_RULE), ['import node:fs']);
  assert.deepEqual(violationsOf('const cp = await import("node:child_process");', BOTS_RULE), [
    'import node:child_process'
  ]);
  // 白名单内的两种写法都不算违规（别把允许的东西误伤）
  assert.deepEqual(violationsOf('import { moveFor } from "@sixty/bot";', BOTS_RULE), []);
  assert.deepEqual(violationsOf("import { broadcast } from './hub';", BOTS_RULE), []);
  // 扫描器本身：`export ... from` 也算引入
  assert.deepEqual(importedModules("export { x } from 'node:net';"), ['node:net']);
});
