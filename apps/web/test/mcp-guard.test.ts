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
 * 扫描逻辑与 `bot-guard.test.ts` 共用 `import-scan.ts`：两边原来各抄一份，
 * 于是「只认单引号 import、漏掉副作用与动态 import」这个盲区也被抄了两遍 —— 现在一处修好。
 *
 * 沙箱内按包运行：node --import ./test/loader.mjs --test --test-isolation=none "test/*.test.ts"
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { violationsOf, type GuardRule } from './import-scan.ts';

const GUARDED: readonly { readonly file: string; readonly rule: GuardRule }[] = [
  {
    file: '../src/lib/server/mcp-api.ts',
    rule: {
      allow: ['./tables', '@sixty/engine', '@sixty/mcp'],
      forbidden: [
        'getGameState', // 完整 GameState（含三家手牌与底牌）
        'saveGame',
        'appendEvents',
        'dispatch', // 引擎入口：拿到 state 才能调
        'createGame',
        'structuredClone',
        'personalView', // 必须经 viewFor（按身份过滤）而不是自己转
        'db'
      ]
    }
  },
  {
    file: '../src/routes/api/mcp/+server.ts',
    rule: {
      allow: [
        '@sveltejs/kit',
        '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js',
        '@sixty/mcp',
        '$lib/server/auth',
        '$lib/server/mcp-api',
        './$types'
      ],
      forbidden: [
        'getGameState',
        'saveGame',
        'appendEvents',
        'dispatch',
        'createGame',
        'structuredClone',
        'personalView',
        'db'
      ]
    }
  }
];

const API_RULE = GUARDED[0]!.rule;
const ROUTE_RULE = GUARDED[1]!.rule;

test('MCP 进程内路径不得触碰完整牌局状态', () => {
  for (const { file, rule } of GUARDED) {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8');
    assert.deepEqual(
      violationsOf(source, rule),
      [],
      `${file} 越权了：MCP 工具面只允许经 viewFor/applyTableAction 拿个人视图`
    );
  }
});

test('守卫非空转：违规源码必须被抓住', () => {
  // 直接够完整状态
  assert.deepEqual(violationsOf("import { getGameState } from './tables';", API_RULE), ['getGameState']);
  // 自己转个人视图而不走 viewFor
  assert.deepEqual(violationsOf('const v = personalView(state, seat);', API_RULE), ['personalView']);
  // 换一个没有白名单的模块（进程内那条路）
  assert.deepEqual(violationsOf("import { db } from './db';", API_RULE), ['db', 'import ./db']);
  // 路由那条路同样不许直接够 db
  assert.deepEqual(violationsOf("import { db } from '$lib/server/db';", ROUTE_RULE), [
    'db',
    'import $lib/server/db'
  ]);
  // 注释里提到这些名字不算违规（否则文档就不能解释这条守卫）
  assert.deepEqual(violationsOf('// 不碰 getGameState 与 db\nconst ok = 1;', API_RULE), []);
  // 字符串里的 `//` 不能被当成注释，否则后半段就成了盲区
  assert.deepEqual(violationsOf("const u = 'http://x';\nconst s = getGameState();", API_RULE), ['getGameState']);
});

test('守卫认得出 import 的所有写法（双引号 / 副作用 / 动态）', () => {
  assert.deepEqual(violationsOf('import { db } from "./db";', API_RULE), ['db', 'import ./db']);
  assert.deepEqual(violationsOf("import 'node:fs';", API_RULE), ['import node:fs']);
  assert.deepEqual(violationsOf("const fs = await import('node:fs');", API_RULE), ['import node:fs']);
  // 白名单内的模块两种引号都不算违规
  assert.deepEqual(violationsOf('import { z } from "@sixty/mcp";', API_RULE), []);
});
