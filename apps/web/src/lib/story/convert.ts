/**
 * 合并：作者的 JSON + 我的 notes 覆盖层 → 演示页要用的数据（并逐条自检）。
 *
 * 这一步是整条链路的**质检口**，它把三类错误挡在页面之外：
 * 1. 牌局本身不合法（回放某一步失败）；
 * 2. 存证与回放对不上（有人手改了 JSON 里的牌面，或引擎口径变了）；
 * 3. 文案漂移（润色条目记的 original 已经不是作者当前的原话）与讲解缺失
 *    （该有说明的步——出牌、埋底、非「不叫」的叫品——一句话都没有）。
 *
 * 纯函数、不碰文件系统：脚本与测试共用同一份实现，不可能各算一套。
 */
import { cardKey, type Card } from '@sixty/engine';

import { annotateStep, annotateTrick } from './annotate.ts';
import type { NoteEntry, NotesOverlay } from './notes.ts';
import { replayStory } from './replay.ts';
import {
  countSources,
  type StoryDealData,
  type StoryDealSnapshot,
  type StoryLine,
  type StorySource,
  type StoryTrick
} from './story-data.ts';
import type { DealStory } from './types.ts';

export interface ConvertResult {
  readonly data: StoryDealData | null;
  /** 必须为零才能出页；每条都要能直接照着修 */
  readonly problems: readonly string[];
  /** 不阻塞、但要对作者说一声的事（例如某一步没写说明） */
  readonly warnings: readonly string[];
}

/** 这一步「该不该有说明」：出牌、埋底、发牌、以及所有非「不叫」的叫品都该有；「不叫」可以没有 */
function requiresText(kind: string, call: unknown): boolean {
  if (kind === 'play' || kind === 'bury' || kind === 'deal') return true;
  if (kind === 'bid') return call !== 'pass';
  return false;
}

function keysOf(cards: readonly Card[]): string[] {
  return cards.map(cardKey);
}

function sameKeys(a: readonly (readonly string[])[], b: readonly (readonly string[])[]): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 逐字段比结算摘要，报错时能指出是哪一项对不上 */
function summaryDiff(
  stored: DealStory['deal']['summary'],
  fresh: StoryDealSnapshot['summary']
): string[] {
  if (stored === null || fresh === null) {
    return stored === fresh ? [] : ['结算摘要一边有、一边没有'];
  }
  const out: string[] = [];
  const fields = [
    'declarerTrickPoints',
    'defenderTrickPoints',
    'kittyPoints',
    'multiplier',
    'protectedBottom',
    'finalScore',
    'made',
    'shortfall',
    'lastTrickSize'
  ] as const;
  for (const field of fields) {
    if (stored[field] !== fresh[field]) out.push(`${field}：文件里是 ${String(stored[field])}，引擎重算是 ${String(fresh[field])}`);
  }
  if (JSON.stringify(stored.levelChanges) !== JSON.stringify(fresh.levelChanges)) {
    out.push('级别变化与引擎重算不一致');
  }
  return out;
}

export function convertStory(story: DealStory, overlay: NotesOverlay): ConvertResult {
  const problems: string[] = [];
  const warnings: string[] = [];
  const names = [...story.names] as readonly string[];

  // ---- 1. 回放 ----
  const replay = replayStory(story.spec, story.actions);
  if (replay.error !== null) {
    problems.push(`第 ${replay.error.index + 1} 步回放失败：${replay.error.message}`);
    return { data: null, problems, warnings };
  }
  const finalDeal = replay.state.deal;
  if (finalDeal === null) {
    problems.push('这副牌没有发牌记录');
    return { data: null, problems, warnings };
  }

  // ---- 2. 存证 vs 回放 ----
  const dealt = replay.dealtState?.deal ?? finalDeal;
  const freshHands = dealt.hands.map(keysOf);
  if (!sameKeys(freshHands, story.deal.hands)) {
    problems.push('文件里的手牌与引擎重算不一致（有人手改了牌面，或引擎/RNG 口径变了）');
  }
  if (!sameKeys([keysOf(dealt.originalKitty)], [story.deal.originalKitty])) {
    problems.push('文件里的暗底与引擎重算不一致');
  }
  if (!sameKeys([keysOf(finalDeal.kitty)], [story.deal.kitty])) {
    problems.push('文件里埋回去的 3 张与引擎重算不一致');
  }
  if (JSON.stringify(story.deal.trump) !== JSON.stringify(finalDeal.trump)) {
    problems.push(`文件里的将牌（${JSON.stringify(story.deal.trump)}）与引擎重算（${JSON.stringify(finalDeal.trump)}）不一致`);
  }
  if (JSON.stringify(story.deal.contract) !== JSON.stringify(finalDeal.contract)) {
    problems.push('文件里的定约与引擎重算不一致');
  }
  for (const diff of summaryDiff(story.deal.summary, finalDeal.summary)) {
    problems.push(`结算摘要对不上：${diff}`);
  }

  // ---- 3. 覆盖层的键必须都存在 ----
  const lastIndex = story.actions.length - 1;
  for (const key of Object.keys(overlay.steps)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index > lastIndex) {
      problems.push(`notes 覆盖层里的步号越界：${index}（这副牌只有 ${story.actions.length} 步）`);
    }
  }
  for (const key of Object.keys(overlay.trickNotes)) {
    const ordinal = Number(key);
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= replay.tricks.length) {
      problems.push(`notes 覆盖层里的墩号越界：${ordinal}（这副牌只有 ${replay.tricks.length} 墩）`);
    }
  }

  // ---- 4. 逐句合并（作者原话 / 润色 / 补写）----
  const trump = finalDeal.trump;
  const lines: StoryLine[] = replay.steps.map((step) => {
    const entry: NoteEntry | undefined = overlay.steps[String(step.index)];
    const authorNote = story.actions[step.index]?.note ?? null;
    const annotation = annotateStep(step, replay, names, trump);

    let text: string | null = null;
    let source: StorySource | null = null;
    let original: string | null = null;
    let why: string | null = null;

    if (entry !== undefined) {
      text = entry.text;
      source = entry.kind === 'fill' ? 'fill' : 'polish';
      why = entry.why ?? null;
      if (entry.kind === 'fill') {
        if (authorNote !== null && authorNote.trim().length > 0) {
          warnings.push(`第 ${step.index + 1} 步本来就有作者原话，却又被当成「补写」覆盖了`);
        }
      } else {
        original = entry.original ?? null;
        if (entry.original !== undefined && entry.original !== authorNote) {
          problems.push(
            `第 ${step.index + 1} 步的润色条目对不上原文：notes 记的是「${entry.original}」，` +
              `而牌局里现在是「${authorNote ?? '（空）'}」——说明原文改过了，需要同步更新 notes`
          );
        }
      }
    } else if (authorNote !== null && authorNote.trim().length > 0) {
      text = authorNote;
      source = 'author';
    }

    if (text === null && requiresText(step.kind, step.step.type === 'bid' ? step.step.call : null)) {
      problems.push(`第 ${step.index + 1} 步（${step.kind}）没有说明：${annotation.headline}`);
    }
    if (text === null) {
      warnings.push(`第 ${step.index + 1} 步没有说明（${annotation.headline}）`);
    }

    return {
      index: step.index,
      kind: step.kind,
      seat: step.seat,
      headline: annotation.headline,
      tags: annotation.tags,
      cards: keysOf(step.cards),
      points: annotation.points,
      text,
      source,
      original,
      why
    };
  });

  // ---- 5. 墩 ----
  const linesByIndex = new Map(lines.map((line) => [line.index, line]));
  const tricks: StoryTrick[] = replay.tricks.map((trick) => {
    const annotation = annotateTrick(trick, names, trump);
    const note = overlay.trickNotes[String(trick.ordinal)] ?? story.trickNotes[trick.ordinal] ?? null;
    if (note === null || note.trim().length === 0) {
      problems.push(`第 ${trick.ordinal + 1} 墩没有墩级小结`);
    }
    const playLines = trick.plays
      .map((play) => linesByIndex.get(play.stepIndex))
      .filter((line): line is StoryLine => line !== undefined);
    return {
      ordinal: trick.ordinal,
      leaderSeat: trick.leaderSeat,
      winnerSeat: trick.winnerSeat,
      points: trick.points,
      size: trick.plays[0]?.cards.length ?? 0,
      plays: trick.plays.map((play) => ({ seat: play.seat, cards: keysOf(play.cards) })),
      headline: annotation.headline,
      tags: annotation.tags,
      note,
      lines: playLines
    };
  });

  // ---- 6. 文案禁忌：界面不出现方位称谓 ----
  // 开篇/收尾：作者写过就用他的；没写才用我的补写（原话永远优先）
  const intro = story.intro.trim().length > 0 ? story.intro : overlay.intro;
  const outro = story.outro.trim().length > 0 ? story.outro : overlay.outro;
  const allText = [
    intro,
    outro,
    ...lines.map((line) => line.text ?? ''),
    ...tricks.map((trick) => trick.note ?? '')
  ];
  allText.forEach((text, position) => {
    if (/[东南西]/.test(text)) problems.push(`第 ${position + 1} 段文案里出现了方位称谓（东/南/西）：${text.slice(0, 40)}`);
  });

  if (problems.length > 0) return { data: null, problems, warnings };

  const data: StoryDealData = {
    slug: story.slug,
    title: story.title,
    names: [...story.names],
    spec: {
      seed: story.spec.seed,
      dealerSeat: story.spec.dealerSeat,
      levels: story.spec.levels.map((level) => ({ rank: level.rank, cycle: level.cycle }))
    },
    intro,
    outro,
    deal: {
      hands: freshHands,
      originalKitty: keysOf(dealt.originalKitty),
      kitty: keysOf(finalDeal.kitty),
      trump: finalDeal.trump,
      contract: finalDeal.contract,
      summary: finalDeal.summary
    },
    lines,
    tricks,
    counts: countSources(lines)
  };
  return { data, problems, warnings };
}
