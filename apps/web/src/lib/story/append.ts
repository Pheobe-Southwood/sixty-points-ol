/**
 * 出手前后的两条纯函数：**先试回放，再落地**。
 *
 * 编排台的「只要合法动作能进来」不是靠界面把按钮变灰实现的 —— 界面只是第一道提示，
 * 真正的判定在这里：把新动作接到末尾回放一遍，引擎说不行就一个字节都不写。
 * 抽成纯函数是为了能直接测（`.svelte.ts` 里的 rune 代码跑不了 node:test）。
 */
import { replayStory } from './replay.ts';
import type { StoryAction, StorySpec } from './types.ts';

export interface AppendCheck {
  readonly ok: boolean;
  /** 不合法时给作者看的一句话；合法时为 null */
  readonly message: string | null;
  /** 合法时是接上之后的序列；不合法时原样返回，调用方不必自己回滚 */
  readonly steps: readonly StoryAction[];
}

export function tryAppend(
  spec: StorySpec,
  actions: readonly StoryAction[],
  action: StoryAction
): AppendCheck {
  const steps = [...actions, action];
  const trial = replayStory(spec, steps);
  if (trial.error !== null) {
    return {
      ok: false,
      message: `第 ${trial.error.index + 1} 步不合法：${trial.error.message}`,
      steps: actions
    };
  }
  return { ok: true, message: null, steps };
}

export interface TruncateResult {
  readonly steps: readonly StoryAction[];
  /** 保留的前缀里已经打完几墩（墩级说明要跟着截断到这个数） */
  readonly trickCount: number;
}

/** 「从这一步重打」：丢掉 `index` 及其之后 */
export function truncateActions(
  spec: StorySpec,
  actions: readonly StoryAction[],
  index: number
): TruncateResult {
  const steps = actions.slice(0, Math.max(0, Math.min(index, actions.length)));
  return { steps, trickCount: replayStory(spec, steps).tricks.length };
}
