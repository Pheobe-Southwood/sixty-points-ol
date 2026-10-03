/**
 * 我的覆盖层：`docs/deals/notes/<slug>.json`。
 *
 * 为什么单独一份文件，而不是直接改作者的 JSON：
 * - **原话永不改写**。作者导出的 `docs/deals/<slug>.json` 是原始记录，逐字保留；
 * - 我的润色与补写放在这里，重跑脚本不会丢，也不会碰原文；
 * - 每条润色都写明 `original`（原文）与 `why`（为什么改），交给作者逐条复核。
 *
 * `steps` 的键是**动作下标（0 起）**，与 `actions` 数组一致（界面上的步号是它 +1）。
 */
import type { StorySource } from './story-data.ts';

export interface NoteEntry {
  /** `polish` 只改字不动意思；`clarify` 是原句读不通、按引擎事实重写；`fill` 是原本没写 */
  readonly kind: Extract<StorySource, 'polish' | 'fill'> | 'clarify';
  readonly text: string;
  /** 润色/改写前的原话（`polish` 与 `clarify` 必填，用来防漂移） */
  readonly original?: string;
  readonly why?: string;
}

export interface NotesOverlay {
  readonly version: number;
  readonly slug: string;
  readonly intro: string;
  readonly outro: string;
  /** 与「已完成的墩」一一对应（0 起） */
  readonly trickNotes: Readonly<Record<string, string>>;
  readonly steps: Readonly<Record<string, NoteEntry>>;
}

export const NOTES_VERSION = 1;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** 结构校验：形状不对就整份拒绝（宁可报错，也不半懂不懂地合并出错误文案） */
export function parseNotesOverlay(raw: unknown, slug: string): NotesOverlay | string {
  if (!isRecord(raw)) return 'notes 覆盖层必须是对象';
  if (raw['version'] !== NOTES_VERSION) return `notes 覆盖层 version 必须是 ${NOTES_VERSION}`;
  if (raw['slug'] !== slug) return `notes 覆盖层的 slug（${String(raw['slug'])}）与牌局（${slug}）不一致`;

  const intro = raw['intro'];
  const outro = raw['outro'];
  if (typeof intro !== 'string' || intro.trim().length === 0) return 'notes 覆盖层缺 intro';
  if (typeof outro !== 'string' || outro.trim().length === 0) return 'notes 覆盖层缺 outro';

  const trickNotes: Record<string, string> = {};
  const rawTrickNotes = raw['trickNotes'];
  if (rawTrickNotes !== undefined) {
    if (!isRecord(rawTrickNotes)) return 'notes 覆盖层的 trickNotes 必须是对象';
    for (const [key, value] of Object.entries(rawTrickNotes)) {
      if (!/^\d+$/.test(key)) return `trickNotes 的键必须是墩号（0 起）：${key}`;
      if (typeof value !== 'string' || value.trim().length === 0) return `trickNotes[${key}] 必须是非空字符串`;
      trickNotes[key] = value;
    }
  }

  const steps: Record<string, NoteEntry> = {};
  const rawSteps = raw['steps'];
  if (rawSteps !== undefined) {
    if (!isRecord(rawSteps)) return 'notes 覆盖层的 steps 必须是对象';
    for (const [key, value] of Object.entries(rawSteps)) {
      if (!/^\d+$/.test(key)) return `steps 的键必须是动作下标（0 起）：${key}`;
      if (!isRecord(value)) return `steps[${key}] 必须是对象`;
      const kind = value['kind'];
      if (kind !== 'polish' && kind !== 'clarify' && kind !== 'fill') {
        return `steps[${key}].kind 必须是 polish / clarify / fill`;
      }
      const text = value['text'];
      if (typeof text !== 'string' || text.trim().length === 0) return `steps[${key}].text 必须是非空字符串`;
      const original = value['original'];
      const why = value['why'];
      if (kind !== 'fill' && (typeof original !== 'string' || original.trim().length === 0)) {
        return `steps[${key}]（${kind}）必须带 original（原文），否则无法核对有没有漂移`;
      }
      if (original !== undefined && typeof original !== 'string') return `steps[${key}].original 必须是字符串`;
      if (why !== undefined && typeof why !== 'string') return `steps[${key}].why 必须是字符串`;
      steps[key] = {
        kind,
        text,
        ...(typeof original === 'string' ? { original } : {}),
        ...(typeof why === 'string' ? { why } : {})
      };
    }
  }

  return { version: NOTES_VERSION, slug, intro, outro, trickNotes, steps };
}
