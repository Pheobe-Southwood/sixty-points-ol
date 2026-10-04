/**
 * 传输层单测：真 SDK 客户端 ↔ 真 SDK 服务器，用内存链对（InMemoryTransport）。
 *
 * 刻意**不 spawn 子进程**：受限沙箱下 piped stdio 必然 EPERM（见 AGENTS 规则 5 与 ADR-0005），
 * 而真正的 `node src/stdio.ts` 由 scripts/mcp-check.ts 在 CI / 本机非受限环境里跑。
 * 这一层要钉住的是：注册到 SDK 的工具与 src/tools.ts 的表逐字一致（防注册漂移）。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';

import { ApiError } from '../src/api.ts';
import { createMcpServer, SERVER_NAME } from '../src/server.ts';
import { HELP_KEYS } from '@sixty/engine';
import { TOOLS } from '../src/tools.ts';
import { FakeApi } from './fake-api.ts';

async function connect(api: FakeApi): Promise<{ client: Client; close: () => Promise<void> }> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createMcpServer({ api });
  const client = new Client({ name: 'mcp-test', version: '0.0.0' });
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    }
  };
}

function textOf(result: unknown): string {
  const content = (result as { content?: unknown }).content as { type: string; text?: string }[] | undefined;
  const first = content?.[0];
  assert.ok(first !== undefined && typeof first.text === 'string', '工具没有返回文本内容');
  return first.text;
}

test('tools/list 与工具表逐字一致（防注册漂移）', async () => {
  const { client, close } = await connect(new FakeApi());
  try {
    assert.equal(client.getServerVersion()?.name, SERVER_NAME);
    const listed = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(listed, TOOLS.map((tool) => tool.name).sort());
    // 描述也必须一起挂上去，否则模型看到的是空工具
    const withEmptyDescription = (await client.listTools()).tools.filter(
      (tool) => (tool.description ?? '').length === 0
    );
    assert.deepEqual(withEmptyDescription, []);
  } finally {
    await close();
  }
});

test('共用的说明只写一遍：initialize 的 instructions 确实下发', async () => {
  const { client, close } = await connect(new FakeApi());
  try {
    const instructions = client.getInstructions();
    assert.ok(typeof instructions === 'string' && instructions.length > 0, 'instructions 没下发');
    assert.ok(instructions.includes('S14'), 'instructions 应当讲清牌码格式');
    assert.ok(instructions.includes('wait_for_turn'), 'instructions 应当讲清超时之后怎么办');
    // 工具面 schema 是每个请求都要重发的，所以共用的句子不该再散落在 13 个描述里
    const described = (await client.listTools()).tools;
    assert.equal(
      described.filter((tool) => (tool.description ?? '').includes('大王')).length,
      0,
      '牌码格式属于 instructions，不该在每个工具描述里重复'
    );
  } finally {
    await close();
  }
});

/**
 * 无身份会话（ADR-0014）：工具表**照旧全列** —— 模型要能看见配好凭据之后会拿到什么，
 * 而「需要身份」这道门在调用时把守（`callTool`），所以列出来的工具里只有两个调得动。
 */
test('无身份会话：tools/list 仍是全集，但只有 read_rules 与 claim 调得动', async () => {
  const { client, close } = await connect(new FakeApi({ authenticated: false }));
  try {
    const listed = (await client.listTools()).tools.map((tool) => tool.name).sort();
    assert.deepEqual(
      listed,
      TOOLS.map((tool) => tool.name).sort(),
      '无身份会话也必须 list 到全集（否则模型看不见配好凭据后能拿到什么）'
    );
    assert.match(client.getInstructions() ?? '', /没有身份/, '开场就要说清当前没有身份');

    const rules = await client.callTool({ name: 'read_rules', arguments: {} });
    assert.notEqual(rules.isError, true, 'read_rules 是纯本地读，没有身份也该能用');

    const denied = await client.callTool({ name: 'get_state', arguments: {} });
    assert.equal(denied.isError, true, '无身份会话不该读到局面');
    assert.match(textOf(denied), /还没有身份/);
    assert.match(textOf(denied), /claim/, '指路错误必须告诉模型怎么拿到身份');
  } finally {
    await close();
  }
});

test('走真实 MCP 协议：read_rules 覆盖全部阶段、get_state 有 17 张手牌', async () => {
  const { client, close } = await connect(new FakeApi());
  try {
    const rules = await client.callTool({ name: 'read_rules', arguments: {} });
    assert.notEqual(rules.isError, true);
    const entries = (JSON.parse(textOf(rules)) as { entries: unknown[] }).entries;
    assert.deepEqual((entries as { key: string }[]).map((e) => e.key), [...HELP_KEYS]);

    const state = await client.callTool({ name: 'get_state', arguments: {} });
    const payload = JSON.parse(textOf(state)) as {
      role: string;
      view: { deal: unknown };
      you: { hand: unknown[] };
      turn: { canAct: boolean };
    };
    assert.equal(payload.role, 'player');
    assert.equal(payload.you.hand.length, 17);
    assert.equal('you' in payload.view, false, '公共视图里不该嵌着 you');
    assert.equal(payload.turn.canAct, true);
  } finally {
    await close();
  }
});

test('服务端拒绝时返回 isError 文本，而不是把协议打崩', async () => {
  const { client, close } = await connect(new FakeApi({ failWith: new ApiError('还没轮到你叫牌', 400) }));
  try {
    const result = await client.callTool({ name: 'bid', arguments: { call: 'pass' } });
    assert.equal(result.isError, true);
    assert.match(textOf(result), /服务器拒绝：还没轮到你叫牌/);
  } finally {
    await close();
  }
});
