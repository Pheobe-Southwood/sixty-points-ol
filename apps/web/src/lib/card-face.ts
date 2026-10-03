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
  /**
   * 牌面正中。普通牌是花色字形；王是一枚**图案**（☀ / ☾），不是文字名 ——
   * 名字只在角落索引里（`rank` + `glyph` 拼起来正好是 `aria`）。
   */
  readonly pip: string;
  readonly red: boolean;
  /** 屏幕阅读器文本，也是这张牌的名字 */
  readonly aria: string;
  readonly joker: boolean;
}

/** 王牌正中的图案：大王红日、小王素月 */
export const JOKER_PIP: Readonly<Record<'big' | 'small', string>> = { big: '☀', small: '☾' };

export function cardFace(card: Card): CardFace {
  if (isJoker(card)) {
    // 角落两排（大 + 王）就是牌名，正中只放图案：
    // 早先版本让角落与正中都写名字，结果一张牌上「小王」重复了三遍。
    const big = card.joker === 'big';
    return {
      rank: big ? '大' : '小',
      glyph: '王',
      pip: JOKER_PIP[card.joker],
      red: big,
      aria: big ? '大王' : '小王',
      joker: true
    };
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
