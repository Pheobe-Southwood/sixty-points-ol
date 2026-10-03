/**
 * 草稿的持久化：localStorage 里一个小仓库，最多 20 份草稿。
 *
 * 为什么不用服务端：作者只需要「关掉页面再打开还能接着写」，而 localStorage 零后端改动、
 * 跨机器复现也不是需求。真要挪窝就导出 JSON —— 那才是唯一的交付契约。
 *
 * 三条自我约束：
 * - **模块顶层不碰 `localStorage`**（SSR 时不存在），一律走 `defaultStorage()` 的 try/catch；
 * - **坏数据不许炸页面**：解析失败就丢掉那几条，并把原因作为 `problem` 交回界面显示；
 * - **写失败（配额满 / 隐私模式）也要说出来**，否则作者会以为存下来了。
 */
import { STORY_VERSION, type DraftSetup, type StoryDraft } from './types.ts';
import { isLevel, parseDraft, SLUG_PATTERN } from './export.ts';

export const DRAFT_KEY = 'sixty.deal-studio.v1';
export const MAX_DRAFTS = 20;

/** 只用到这三个方法，测试可以塞一个内存桩进来 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DraftStore {
  readonly version: number;
  readonly drafts: readonly StoryDraft[];
}

export interface StoreResult {
  readonly store: DraftStore;
  /** 读/写过程中遇到的问题（可显示给作者）；没有问题时为 null */
  readonly problem: string | null;
}

export const EMPTY_STORE: DraftStore = { version: STORY_VERSION, drafts: [] };

export function defaultStorage(): StorageLike | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // 隐私模式或被策略禁用时，访问 localStorage 会直接抛错
    return null;
  }
}

export function newDraftId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null;
  return uuid ?? `d-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** 新建草稿：**一开始就带一条 `deal` 动作**，所以重开页面时牌面立刻就在 */
export function createDraft(setup: DraftSetup, id: string, now: string): StoryDraft {
  return {
    id,
    slug: setup.slug,
    title: setup.title,
    names: [...setup.names] as [string, string, string],
    spec: {
      seed: setup.seed,
      dealerSeat: setup.dealerSeat,
      levels: setup.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    actions: [{ type: 'deal', note: null }],
    trickNotes: [],
    intro: '',
    outro: '',
    updatedAt: now
  };
}

/** 默认 slug：`deal-<种子>`，作者可以改；改过之后就不再跟着种子走（见界面） */
export function defaultSlug(seed: string, title: string): string {
  const fromTitle = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const candidate = fromTitle.length > 0 ? fromTitle : `deal-${seed.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  const trimmed = candidate.replace(/^-+|-+$/g, '').slice(0, 64);
  return SLUG_PATTERN.test(trimmed) ? trimmed : `deal-${Date.now().toString(36)}`;
}

export function readStore(storage: StorageLike | null): StoreResult {
  if (storage === null) return { store: EMPTY_STORE, problem: null };

  let text: string | null;
  try {
    text = storage.getItem(DRAFT_KEY);
  } catch {
    return { store: EMPTY_STORE, problem: '读不到本机存储（可能被浏览器禁用），草稿只在这次会话里有效' };
  }
  if (text === null || text.trim().length === 0) return { store: EMPTY_STORE, problem: null };

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { store: EMPTY_STORE, problem: '本机存储里的草稿不是合法 JSON，已忽略（导出过的 JSON 不受影响）' };
  }
  const list =
    typeof raw === 'object' && raw !== null && Array.isArray((raw as { drafts?: unknown }).drafts)
      ? ((raw as { drafts: unknown[] }).drafts)
      : null;
  if (list === null) return { store: EMPTY_STORE, problem: '本机存储里的草稿结构不对，已忽略' };

  const drafts: StoryDraft[] = [];
  let dropped = 0;
  for (const item of list) {
    const draft = parseDraft(item);
    if (draft === null) dropped += 1;
    else drafts.push(draft);
  }
  drafts.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  return {
    store: { version: STORY_VERSION, drafts: drafts.slice(0, MAX_DRAFTS) },
    problem: dropped > 0 ? `有 ${dropped} 份草稿读不出来，已跳过` : null
  };
}

function writeStore(storage: StorageLike | null, store: DraftStore): StoreResult {
  if (storage === null) return { store, problem: '本机无法保存（浏览器禁用了本地存储），请随时导出 JSON' };
  try {
    storage.setItem(DRAFT_KEY, JSON.stringify(store));
    return { store, problem: null };
  } catch {
    return { store, problem: '本机存储写不进去（可能已满），请导出 JSON 备份' };
  }
}

export function writeDraft(storage: StorageLike | null, draft: StoryDraft): StoreResult {
  const { store } = readStore(storage);
  const rest = store.drafts.filter((item) => item.id !== draft.id);
  const next = [draft, ...rest]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0))
    .slice(0, MAX_DRAFTS);
  return writeStore(storage, { version: STORY_VERSION, drafts: next });
}

export function removeDraft(storage: StorageLike | null, id: string): StoreResult {
  const { store } = readStore(storage);
  return writeStore(storage, {
    version: STORY_VERSION,
    drafts: store.drafts.filter((item) => item.id !== id)
  });
}

/** 表单入参的基本校验：界面在「开始编排」之前用，避免建出一份存不回来的草稿 */
export function validateSetup(setup: DraftSetup): readonly string[] {
  const errors: string[] = [];
  if (setup.seed.trim().length === 0) errors.push('种子不能为空');
  if (!SLUG_PATTERN.test(setup.slug)) errors.push('slug 只允许小写字母 / 数字 / 连字符，且以字母或数字开头');
  if (setup.levels.length !== 3 || !setup.levels.every(isLevel)) {
    errors.push('三家级别都要是 2–A、轮数 ≥ 0');
  }
  if (setup.names.some((name) => name.trim().length === 0)) errors.push('三个名字都不能为空');
  return errors;
}
