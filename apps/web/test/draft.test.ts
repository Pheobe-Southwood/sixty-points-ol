/**
 * 草稿仓库的测试：坏数据不许炸页面，写不进去必须说出来。
 *
 * 用内存桩代替 localStorage（测试不碰真实浏览器存储），把「读不出来」「写不进去」两种
 * 现实中真会发生的情况都走一遍。
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DRAFT_KEY,
  EMPTY_STORE,
  MAX_DRAFTS,
  createDraft,
  defaultSlug,
  newDraftId,
  nowIso,
  readStore,
  removeDraft,
  writeDraft,
  type StorageLike
} from '../src/lib/story/draft.ts';
import { DEFAULT_NAMES, type DraftSetup } from '../src/lib/story/types.ts';

interface MemoryStorage extends StorageLike {
  readonly data: Record<string, string>;
}

function memoryStorage(initial: Record<string, string> = {}): MemoryStorage {
  const data: Record<string, string> = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
    removeItem: (key) => {
      delete data[key];
    }
  };
}

const SETUP: DraftSetup = {
  seed: '3271',
  dealerSeat: 0,
  levels: [
    { rank: 5, cycle: 0 },
    { rank: 5, cycle: 0 },
    { rank: 5, cycle: 0 }
  ],
  names: DEFAULT_NAMES,
  title: '编排测试',
  slug: 'studio-test'
};

function draftWith(id: string, updatedAt: string, title = '编排测试') {
  return { ...createDraft({ ...SETUP, title }, id, updatedAt) };
}

test('空仓库：没有草稿、没有问题', () => {
  const storage = memoryStorage();
  const { store, problem } = readStore(storage);
  assert.deepEqual(store, EMPTY_STORE);
  assert.equal(problem, null);
  assert.equal(readStore(null).problem, null, '没有本机存储不是「数据有问题」');
});

test('写入 → 读回：动作、说明、设置都还原', () => {
  const storage = memoryStorage();
  const draft = draftWith('draft-a', nowIso());
  const written = writeDraft(storage, draft);
  assert.equal(written.problem, null);
  assert.equal(written.store.drafts.length, 1);

  const again = readStore(storage);
  assert.equal(again.problem, null);
  assert.equal(again.store.drafts.length, 1);
  const back = again.store.drafts[0]!;
  assert.equal(back.id, 'draft-a');
  assert.equal(back.slug, 'studio-test');
  assert.equal(back.title, '编排测试');
  assert.deepEqual(back.spec, draft.spec);
  assert.deepEqual(back.actions, [{ type: 'deal', note: null }]);
  assert.deepEqual([...back.names], [...DEFAULT_NAMES]);
  // 存的是纯 JSON：代理/函数都不该混进来
  assert.equal(typeof storage.data[DRAFT_KEY], 'string');
  assert.doesNotThrow(() => JSON.parse(storage.data[DRAFT_KEY]!));
});

test('同 id 覆盖并置顶，最多留 20 份', () => {
  const storage = memoryStorage();
  for (let i = 0; i < 25; i += 1) {
    const stamp = new Date(Date.UTC(2026, 0, 1, 0, 0, i)).toISOString();
    writeDraft(storage, draftWith(`draft-${i}`, stamp, `第 ${i} 份`));
  }
  const { store } = readStore(storage);
  assert.equal(store.drafts.length, MAX_DRAFTS);
  assert.equal(store.drafts[0]!.title, '第 24 份', '最新写入的排在最前');
  assert.equal(
    store.drafts.some((draft) => draft.id === 'draft-0'),
    false,
    '超出的旧草稿应被挤掉'
  );

  const updated = { ...store.drafts[0]!, title: '改过标题', updatedAt: '2030-01-01T00:00:00.000Z' };
  const after = writeDraft(storage, updated);
  assert.equal(after.store.drafts.length, MAX_DRAFTS, '覆盖不该新增一份');
  assert.equal(after.store.drafts.filter((draft) => draft.id === updated.id).length, 1);
  assert.equal(after.store.drafts[0]!.title, '改过标题');
});

test('删除草稿', () => {
  const storage = memoryStorage();
  writeDraft(storage, draftWith('draft-x', nowIso()));
  writeDraft(storage, draftWith('draft-y', nowIso()));
  const after = removeDraft(storage, 'draft-x');
  assert.deepEqual(
    after.store.drafts.map((draft) => draft.id),
    ['draft-y']
  );
  assert.equal(removeDraft(storage, '不存在').store.drafts.length, 1);
});

test('坏数据：不是 JSON / 结构不对 / 个别草稿坏掉，都不许抛错', () => {
  const broken = memoryStorage({ [DRAFT_KEY]: '{ 这不是 JSON' });
  const brokenResult = readStore(broken);
  assert.deepEqual(brokenResult.store.drafts, []);
  assert.match(brokenResult.problem ?? '', /JSON/);

  const wrongShape = memoryStorage({ [DRAFT_KEY]: JSON.stringify({ version: 1, drafts: 'x' }) });
  const wrongResult = readStore(wrongShape);
  assert.deepEqual(wrongResult.store.drafts, []);
  assert.match(wrongResult.problem ?? '', /结构/);

  const mixed = memoryStorage({
    [DRAFT_KEY]: JSON.stringify({
      version: 1,
      drafts: [
        draftWith('good-1', nowIso()),
        { id: 'bad-1', slug: '中文 slug' },
        null,
        draftWith('good-2', nowIso())
      ]
    })
  });
  const mixedResult = readStore(mixed);
  assert.deepEqual(
    mixedResult.store.drafts.map((draft) => draft.id).sort(),
    ['good-1', 'good-2']
  );
  assert.match(mixedResult.problem ?? '', /2 份.*读不出来/);
});

test('写不进去（配额满 / 没有存储）要说清楚，而不是假装存上了', () => {
  const noStorage = readStore(null);
  assert.deepEqual(noStorage.store.drafts, []);
  const failed = writeDraft(null, draftWith('draft-null', nowIso()));
  assert.match(failed.problem ?? '', /无法保存|随时导出/);

  const full: StorageLike = {
    getItem: () => null,
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
    removeItem: () => undefined
  };
  const quota = writeDraft(full, draftWith('draft-full', nowIso()));
  assert.match(quota.problem ?? '', /写不进去/);
});

test('新建草稿与默认 slug', () => {
  const draft = createDraft(SETUP, 'draft-new', '2026-01-01T00:00:00.000Z');
  assert.equal(draft.actions.length, 1);
  assert.equal(draft.updatedAt, '2026-01-01T00:00:00.000Z');
  assert.deepEqual(draft.trickNotes, []);
  assert.equal(defaultSlug('3271', ''), 'deal-3271');
  assert.equal(defaultSlug('3271', 'My First Deal'), 'my-first-deal');
  const a = newDraftId();
  const b = newDraftId();
  assert.notEqual(a, b);
  assert.ok(a.length > 0);
});
