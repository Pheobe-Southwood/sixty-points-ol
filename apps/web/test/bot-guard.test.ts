/**
 * 机器人作弊面守卫：驱动器（`apps/web/src/lib/server/bots.ts`）与加/移座位的路由
 * 只能经过**个人视图**取信息、经过 `applyTableAction` 发动作。
 *
 * 为什么需要它：这个文件和 `/api/mcp` 的进程内适配层一样，离完整权威状态只有一步之遥
 * （`db` 就在隔壁）。ADR-0014 的承诺是「机器人看不到别人的手牌与底牌」——那条承诺
 * 由这里静态钉死，而不是靠自律。
 *
 * 守卫本身也要被守卫：`violationsOf` 是纯函数，先喂故意违规的源码证明它真会红
 * （AGENTS 规则 9：空转的断言比没有断言更糟）。
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Guarded {
  readonly file: string;
  /** 允许 import 的模块：写出来是为了让下一个人知道边界在哪，改了就要一起改这里 */
  readonly allow: readonly string[];
}

const GUARDED: readonly Guarded[] = [
  {
    file: '../src/lib/server/bots.ts',
    allow: ['node:crypto', '@sixty/engine', '@sixty/bot', './db', './hub', './tables', '../shared']
  },
  {
    file: '../src/routes/api/tables/[code]/bot/+server.ts',
    allow: ['@sveltejs/kit', '$lib/server/auth', '$lib/server/bots', './$types']
  }
];

/** 完整牌局状态与它的入口：机器人一律经 viewFor / applyTableAction，不许自己够 */
const FORBIDDEN: readonly string[] = [
  'getGameState', // 完整 GameState（含三家手牌与底牌）
  'saveGame',
  'appendEvents',
  'dispatch', // 引擎入口：拿到 state 才能调
  'createGame',
  'structuredClone',
  'personalView' // 必须经 viewFor（按身份过滤）而不是自己转
];

/** 去掉注释（注释里会正当地提到这些名字），但保留字符串字面量，免得把 `//` 当注释截断 */
function stripComments(source: string): string {
  let out = '';
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    const next = source[index + 1];
    if (char === '/' && next === '/') {
      while (index < source.length && source[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      index += 2;
      while (index < source.length && !(source[index] === '*' && source[index + 1] === '/')) index += 1;
      index += 2;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      out += char;
      index += 1;
      while (index < source.length && source[index] !== char) {
        if (source[index] === '\\') {
          out += source[index];
          index += 1;
        }
        out += source[index];
        index += 1;
      }
      out += char;
      index += 1;
      continue;
    }
    out += char;
    index += 1;
  }
  return out;
}

function importedModules(source: string): string[] {
  return [...source.matchAll(/from\s+'([^']+)'/g)].map((match) => match[1]!);
}

/** 返回违规清单（空数组 = 干净）。纯函数：真实文件与违规样例走同一段判断 */
export function violationsOf(source: string, allow: readonly string[]): string[] {
  const code = stripComments(source);
  const found: string[] = [];
  for (const name of FORBIDDEN) {
    if (new RegExp(`\\b${name}\\b`).test(code)) found.push(name);
  }
  const allowed = new Set(allow);
  for (const module of importedModules(code)) {
    if (!allowed.has(module)) found.push(`import ${module}`);
  }
  return found;
}

const BOTS_ALLOW = GUARDED[0]!.allow;
const ROUTE_ALLOW = GUARDED[1]!.allow;

test('机器人驱动器与路由不得触碰完整牌局状态', () => {
  for (const { file, allow } of GUARDED) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual(
      violationsOf(source, allow),
      [],
      `${file} 越权了：机器人只允许经 viewFor/applyTableAction 拿个人视图`
    );
  }
});

test('守卫非空转：违规源码必须被抓住', () => {
  assert.deepEqual(violationsOf("import { getGameState } from './tables';", BOTS_ALLOW), ['getGameState']);
  assert.deepEqual(violationsOf('const v = personalView(state, seat);', BOTS_ALLOW), ['personalView']);
  assert.deepEqual(violationsOf("import { dispatch } from '@sixty/engine';", BOTS_ALLOW), ['dispatch']);
  // 换一个没有白名单的模块：机器人不许自己去够引擎入口或别人的存储
  assert.deepEqual(violationsOf("import { db } from './store';", BOTS_ALLOW), ['import ./store']);
  assert.deepEqual(violationsOf("import { db } from '$lib/server/db';", ROUTE_ALLOW), [
    'import $lib/server/db'
  ]);
  // 注释里提到这些名字不算违规（否则文档就不能解释这条守卫）
  assert.deepEqual(violationsOf('// 不碰 getGameState 与 dispatch\nconst ok = 1;', BOTS_ALLOW), []);
  // 字符串里的 `//` 不能被当成注释，否则后半段就成了盲区
  assert.deepEqual(violationsOf("const u = 'http://x';\nconst s = getGameState();", BOTS_ALLOW), [
    'getGameState'
  ]);
});
