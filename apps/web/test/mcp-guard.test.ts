/**
 * 作弊面守卫：MCP 工具面（`/api/mcp` 那条进程内路径）只能经过**个人视图**。
 *
 * stdio 那条路结构上不可能作弊（它只会发 HTTP 请求）；进程内这条路能直接 import
 * `$lib/server`，所以「看不到别人的手牌与底牌」这件事必须由静态约束兜住：
 * 两个受保护文件各自只许从写死的那几个模块拿东西，且不许出现取完整牌局状态的名字。
 *
 * 守卫本身也要被守卫：`violationsOf` 是纯函数，先喂一段故意违规的源码证明它真的会红
 * （AGENTS 规则 9：空转的断言比没有断言更糟）。真实注入 + 字节还原另外做过一次。
 *
 * 沙箱内按包运行：node --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

interface Guarded {
  readonly file: string;
  /** 这份文件允许 import 的模块：写出来是为了让下一个人知道边界在哪，改了就要一起改这里 */
  readonly allow: readonly string[];
}

const GUARDED: readonly Guarded[] = [
  {
    file: '../src/lib/server/mcp-api.ts',
    allow: ['./tables', '@sixty/engine', '@sixty/mcp']
  },
  {
    file: '../src/routes/api/mcp/+server.ts',
    allow: [
      '@sveltejs/kit',
      '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js',
      '@sixty/mcp',
      '$lib/server/auth',
      '$lib/server/mcp-api',
      './$types'
    ]
  }
];

const FORBIDDEN: readonly string[] = [
  'getGameState', // 完整 GameState（含三家手牌与底牌）
  'saveGame',
  'appendEvents',
  'dispatch', // 引擎入口：拿到 state 才能调
  'createGame',
  'structuredClone',
  'personalView', // 必须经 viewFor（按身份过滤）而不是自己转
  'db'
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

const API_ALLOW = GUARDED[0]!.allow;
const ROUTE_ALLOW = GUARDED[1]!.allow;

test('MCP 进程内路径不得触碰完整牌局状态', () => {
  for (const { file, allow } of GUARDED) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual(
      violationsOf(source, allow),
      [],
      `${file} 越权了：MCP 工具面只允许经 viewFor/applyTableAction 拿个人视图`
    );
  }
});

test('守卫非空转：违规源码必须被抓住', () => {
  // 直接够完整状态
  assert.deepEqual(violationsOf("import { getGameState } from './tables';", API_ALLOW), ['getGameState']);
  // 自己转个人视图而不走 viewFor
  assert.deepEqual(violationsOf('const v = personalView(state, seat);', API_ALLOW), ['personalView']);
  // 换一个没有白名单的模块（进程内那条路）
  assert.deepEqual(violationsOf("import { db } from './db';", API_ALLOW), ['db', 'import ./db']);
  // 路由那条路同样不许直接够 db
  assert.deepEqual(violationsOf("import { db } from '$lib/server/db';", ROUTE_ALLOW), [
    'db',
    'import $lib/server/db'
  ]);
  // 注释里提到这些名字不算违规（否则文档就不能解释这条守卫）
  assert.deepEqual(violationsOf('// 不碰 getGameState 与 db\nconst ok = 1;', API_ALLOW), []);
  // 字符串里的 `//` 不能被当成注释，否则后半段就成了盲区
  assert.deepEqual(violationsOf("const u = 'http://x';\nconst s = getGameState();", API_ALLOW), ['getGameState']);
});
