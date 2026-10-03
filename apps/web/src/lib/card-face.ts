/**
 * 牌面渲染数据（纯函数）。
 *
 * 抽出来的原因：这段逻辑原先埋在 Card.svelte 里，没有任何断言，才会出现
 * 「角落写大、中间写王」这种同一张牌两处读起来不像同一张的问题。
 * 现在角落与中间由这里统一给出，缺什么一眼可测。
 */

import { SUIT_LABEL, isJoker, rankLabel, type Card } from '@sixty/engine';

export interface CardFace {
  /** 角落索引上排：`A` / `10` / `大` / `小` */
  readonly rank: string;
  /** 角落索引下排：花色字形，或王的「王」 */
  readonly glyph: string;
  /** 牌面正中：花色字形，或「大王」/「小王」 */
  readonly pip: string;
  readonly red: boolean;
  /** 屏幕阅读器文本 */
  readonly aria: string;
  readonly joker: boolean;
}

export function cardFace(card: Card): CardFace {
  if (isJoker(card)) {
    // 角落（大 + 王）与正中（大王）必须指向同一张牌：正中不再只写一个「王」字。
    const big = card.joker === 'big';
    const name = big ? '大王' : '小王';
    return { rank: big ? '大' : '小', glyph: '王', pip: name, red: big, aria: name, joker: true };
  }
  const glyph = SUIT_LABEL[card.suit];
  const rank = rankLabel(card.rank);
  return {
    rank,
    glyph,
    pip: glyph,
    red: card.suit === 'H' || card.suit === 'D',
    aria: `${glyph}${rank}`,
    joker: false
  };
}
