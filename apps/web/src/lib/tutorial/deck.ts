/**
 * 演示页的幻灯片模型：**基本概念**章由这里手写，**实战牌局**章由生成的故事数据现搭。
 *
 * 两条约束：
 * - 概念章的示例全部取自 `scenarios.ts`（那些示例已被 `tutorial.test.ts` 用引擎逐个核对过），
 *   演示页不新造第二份事实；
 * - 牌局章只读 `StoryDealData`（生成物里已经烘焙好牌面与事实），页面在渲染时不跑回放、不碰随机数。
 */
import type { StoryDealData } from '$lib/story/story-data';

/** 概念章的示例挂件：每种都只渲染既有示例数据，不接受 props 之外的输入 */
export type ConceptWidget =
  | { readonly kind: 'point-values' }
  | { readonly kind: 'point-places' }
  | { readonly kind: 'trump-groups' }
  | { readonly kind: 'trump-ladder' }
  | { readonly kind: 'side-suit' }
  | { readonly kind: 'trump-run-cross' }
  | { readonly kind: 'bid-demo' }
  | { readonly kind: 'bury-demo' }
  | { readonly kind: 'multiplier' }
  | { readonly kind: 'lead-cases' }
  | { readonly kind: 'follow-answer' }
  | { readonly kind: 'ruff-contrast' }
  | { readonly kind: 'settle-equation' }
  | { readonly kind: 'upgrade-table' };

export type SlideKind =
  | 'cover'
  | 'concept'
  | 'story-intro'
  | 'story-deal'
  | 'story-bid'
  | 'story-bury'
  | 'story-trick'
  | 'story-settle'
  | 'story-outro'
  | 'end';

export interface Slide {
  readonly id: string;
  readonly kind: SlideKind;
  readonly chapterId: string;
  readonly chapterTitle: string;
  readonly title: string;
  /** 正文要点（概念章与牌局章都用它排左侧文字） */
  readonly points: readonly string[];
  readonly widget?: ConceptWidget;
  readonly storySlug?: string;
  /** 牌局章：这一步/这一墩的定位 */
  readonly lineIndexes?: readonly number[];
  readonly trickOrdinal?: number;
}

export interface Chapter {
  readonly id: string;
  readonly title: string;
  readonly blurb: string;
  readonly first: number;
  readonly count: number;
}

export interface Deck {
  readonly slides: readonly Slide[];
  readonly chapters: readonly Chapter[];
}

/** 叫牌一手一屏太碎、一整段一屏又太长：按 4 手分屏 */
const BIDS_PER_SLIDE = 4;

const CONCEPT: readonly { id: string; title: string; points: readonly string[]; widget?: ConceptWidget }[] = [
  {
    id: 'goal',
    title: '一副牌就是一打二',
    points: [
      '叫到牌的那一家当**庄家**，另外两家临时搭伙当闲家，这副牌的胜负就按这条线分。',
      '赢法只有一句话：庄家抓到的分，够不够他自己叫出去的那个分数。',
      '一轮打完，那一轮里的 5、10、K 全归赢家——分是一轮一轮抢出来的。'
    ],
    widget: { kind: 'point-places' }
  },
  {
    id: 'points',
    title: '全场 100 分，只藏在三种牌里',
    points: [
      '分牌只有三张面孔：**5、10、K**。两个王看着威风，一分不值。',
      '四张 5、四张 10、四张 K 加起来，正好 100 分——全场就这么点分。',
      '这 100 分最后只落在三处：庄家赢下的轮、闲家赢下的轮，还有那 3 张底牌。'
    ],
    widget: { kind: 'point-values' }
  },
  {
    id: 'trump',
    title: '主牌由三部分组成',
    points: [
      '每个人身上都挂着一个级别，从 2 起步、赢牌往上走；这一副的级牌，就是庄家当前级别的那四张——**换个人坐庄，级牌就换一批**。',
      '大小王永远最大，这条不会变；会变的是另外两部分：级牌和主花色，全看这副谁坐庄、叫了什么。',
      '所以叫牌的价值不只在分数：你叫 ♥，♥ 整门就变成主牌——手上哪一门长，就盼着哪一门当主。'
    ],
    widget: { kind: 'trump-groups' }
  },
  {
    id: 'ladder',
    title: '主牌内部也分大小',
    points: [
      '主牌之间永远比得出大小，只有一种牌例外：**三张副级完全相等**，谁先出谁赢。',
      '所以「♠5 压 ♦5」不成立——它们一样大，碰上就是先出为大。',
      '主花色里剩下的牌照样按 2 到 A 排，只是那张级牌被抽出去放到了上面，别在门里找它。'
    ],
    widget: { kind: 'trump-ladder' }
  },
  {
    id: 'skip',
    title: '副牌每一门都「跳过级牌」',
    points: [
      '级牌归了主牌，副牌那一门里就真的少一张：♣ 门是 ♣2 ♣3 ♣4 ♣6…，中间没有 ♣5。',
      '于是 **♣4 的下一张就是 ♣6**，它们是挨着的——这条最容易看漏，也最容易吃亏。',
      '所以手上看着「缺一张」的连牌，往往正好是合法的顺子；这一门里唯一的空洞，只有级牌那一个点数。'
    ],
    widget: { kind: 'side-suit' }
  },
  {
    id: 'run-cross',
    title: '顺子能跨花色：♥A 的下一张是 ♠5',
    points: [
      '主牌是一条连续的队伍：♥A 的下一张是 ♠5，再下一张是 ♥5，然后才是小王。',
      '所以 ♥Q-♥K-♥A-♠5-♥5 是一条合法的五张顺子——**跨花色不碍事，顺序才是真的**。',
      '但别贪：一条主牌顺子里**最多只能带一张副级**，那三张副级完全相等，凑不出连续。'
    ],
    widget: { kind: 'trump-run-cross' }
  },
  {
    id: 'bid',
    title: '叫牌一次定下三件事',
    points: [
      '从 **40 分**起步，每次至少加 5 分；分数一样时比花色：♣ < ♦ < ♥ < ♠ < 无主。',
      '连续两家不叫就成交，坐庄的那位要抓够他叫出的分数才算打成。',
      '三家都不叫，这副作废重发——级别不变，换下一个人发牌。'
    ],
    widget: { kind: 'bid-demo' }
  },
  {
    id: 'bid-lesson',
    title: '叫高没有好处（这条最容易记反）',
    points: [
      '升级只看你实际抓到多少分，跟你叫了多少没关系：叫 45 打成抓 75，叫 75 打成抓 75，升的级数一模一样。',
      '所以**正常情况不跳叫**；牌差干脆不叫——三家全不叫只是重发，你一分不亏。',
      '一旦打输就反过来：叫得越高，两家闲家升得越多（差多少分，按 ⌈差 ÷ 10⌉ 算）。**叫高的唯一理由是竞叫**——把庄家位从对手手里抢过来。'
    ]
  },
  {
    id: 'bury',
    title: '埋底：庄家的那 3 张',
    points: [
      '庄家先把那 3 张底牌并进手里（17 → 20），再从 20 张里挑 3 张扣回去。',
      '**挑哪三张，是庄家第一个自己说了算的决定**：留什么、埋什么，全看他想打哪条路。',
      '扣回去的 3 张，闲家到结算才看得到——所以埋了分，对手当时并不知道。'
    ],
    widget: { kind: 'bury-demo' }
  },
  {
    id: 'multiplier',
    title: '倍数 = 最后一轮每家出了几张',
    points: [
      '最后一轮庄家赢叫**保底**（底牌分加给庄家），闲家赢叫抠底（从庄家账上扣）；加几倍，看最后一轮每家出了几张。',
      '一副牌常常打不满 17 轮：一次甩出一条顺子要好几张，一轮就吃掉两三个牌位。',
      '最狠的一下落在最后：底牌 10 分、末轮每家 2 张，一来一回就是 ±20 分——**埋了分，命门就押在末轮**。'
    ],
    widget: { kind: 'multiplier' }
  },
  {
    id: 'lead',
    title: '领出：单张，或者同门的连牌',
    points: [
      '领出只有两种形状：**一张，或者同门、点数挨着的若干张**。',
      '不同门凑在一起（甩牌）这一版不允许；同门里断开也不行——看着像顺子，其实就是两张单张。',
      '你出几张，别人就得跟几张：领一张，最小的主牌也能管上；领四张，对方就得凑出四张的结构。'
    ],
    widget: { kind: 'lead-cases' }
  },
  {
    id: 'follow',
    title: '跟牌：同门、同张数，而且要「结构优先」',
    points: [
      '先看这一门够不够张数：够，就必须全跟这一门；不够，就把这一门全部出光，剩下的随便垫。',
      '够张数还有第二关：**结构优先**——这一门里只要还有连牌，就必须先把最长的那段拿出来。',
      '为什么？不然你永远能拿「大牌配小牌」把长套拆散藏起来，跟牌就成了随便选。'
    ],
    widget: { kind: 'follow-answer' }
  },
  {
    id: 'ownership',
    title: '一轮归谁',
    points: [
      '一轮打完，谁的牌大，这一轮的 5、10、K 就归谁。',
      '能赢的只有两种：同门、同张数、整条顺子压过对方，或者缺门时甩出同张数的**连续主牌**（杀牌）。',
      '凑不成结构的赢不了：人家出「3 连 + 1 张」，你出「2 连 + 2 连」，只能算垫牌——**垫牌不管多大都不能赢**。'
    ],
    widget: { kind: 'ruff-contrast' }
  },
  {
    id: 'settle',
    title: '算账：最终得分够不够',
    points: [
      '庄家赢下来的轮里的分加起来，再按最后一轮加减底牌分，就是他的**最终得分**。',
      '最终得分 ≥ 他叫的那个分，就是**打成**——正好相等也算；差一点都不行。',
      '一副牌一共 100 分：庄家抓的 + 闲家抓的 + 底牌那 3 张，永远对得上——对不上就是哪里算错了。'
    ],
    widget: { kind: 'settle-equation' }
  },
  {
    id: 'upgrade',
    title: '升级、越级与结束',
    points: [
      '每个人从 2 起步，爬完 A 再套圈回到 2，记作 5(+0)、A(+1)、5(+2)——括号里是第几轮。',
      '打成时庄家升级、打输时两家闲家各升，档位都在表格里；**跨过 A 要进位**，越级就是这么来的。',
      '两位玩家到 2(+2)，或一位到 2(+3)，整场结束——**总进度最高的那位是冠军**。'
    ],
    widget: { kind: 'upgrade-table' }
  }
];

function storySlides(story: StoryDealData, chapterId: string, chapterTitle: string): Slide[] {
  const base = { chapterId, chapterTitle, storySlug: story.slug };
  const slides: Slide[] = [];

  slides.push({
    ...base,
    id: `${story.slug}-intro`,
    kind: 'story-intro',
    title: story.title,
    points: [story.intro]
  });

  const dealLine = story.lines[0];
  slides.push({
    ...base,
    id: `${story.slug}-deal`,
    kind: 'story-deal',
    title: '发牌与座次',
    points: [dealLine?.text ?? ''],
    lineIndexes: [0]
  });

  const bidLines = story.lines.filter((line) => line.kind === 'bid');
  for (let start = 0; start < bidLines.length; start += BIDS_PER_SLIDE) {
    const chunk = bidLines.slice(start, start + BIDS_PER_SLIDE);
    slides.push({
      ...base,
      id: `${story.slug}-bid-${start / BIDS_PER_SLIDE + 1}`,
      kind: 'story-bid',
      title: `叫牌 ${start + 1}–${start + chunk.length}`,
      points: [],
      lineIndexes: chunk.map((line) => line.index)
    });
  }

  const buryLine = story.lines.find((line) => line.kind === 'bury');
  if (buryLine !== undefined) {
    slides.push({
      ...base,
      id: `${story.slug}-bury`,
      kind: 'story-bury',
      title: '埋底',
      points: [buryLine.text ?? ''],
      lineIndexes: [buryLine.index]
    });
  }

  for (const trick of story.tricks) {
    slides.push({
      ...base,
      id: `${story.slug}-trick-${trick.ordinal + 1}`,
      kind: 'story-trick',
      title: `第 ${trick.ordinal + 1} 墩`,
      points: [],
      trickOrdinal: trick.ordinal,
      lineIndexes: trick.lines.map((line) => line.index)
    });
  }

  slides.push({
    ...base,
    id: `${story.slug}-settle`,
    kind: 'story-settle',
    title: '结算',
    points: []
  });

  slides.push({
    ...base,
    id: `${story.slug}-outro`,
    kind: 'story-outro',
    title: '这一副的收获',
    points: [story.outro]
  });

  return slides;
}

export function buildDeck(stories: readonly StoryDealData[]): Deck {
  const slides: Slide[] = [];
  const chapters: Chapter[] = [];

  const push = (chapterId: string, chapterTitle: string, items: readonly { id: string; title: string; points: readonly string[]; widget?: ConceptWidget }[]): void => {
    const first = slides.length;
    for (const item of items) {
      slides.push({
        id: item.id,
        kind: 'concept',
        chapterId,
        chapterTitle,
        title: item.title,
        points: item.points,
        ...(item.widget === undefined ? {} : { widget: item.widget })
      });
    }
    chapters.push({ id: chapterId, title: chapterTitle, blurb: '基本概念', first, count: slides.length - first });
  };

  // 封面
  slides.push({
    id: 'cover',
    kind: 'cover',
    chapterId: 'cover',
    chapterTitle: '规则演示',
    title: '六十分怎么打',
    points: []
  });
  chapters.push({ id: 'cover', title: '封面', blurb: '从这里开始', first: 0, count: 1 });

  push('basics', '基本概念', CONCEPT);

  storySlides_of(stories, slides, chapters);

  slides.push({
    id: 'end',
    kind: 'end',
    chapterId: 'end',
    chapterTitle: '看完之后',
    title: '接下来',
    points: []
  });
  chapters.push({ id: 'end', title: '看完之后', blurb: '回大厅或者看文字教程', first: slides.length - 1, count: 1 });

  return { slides, chapters };
}

/** 每副牌一个章：牌局章的顺序就是 `stories` 的顺序 */
function storySlides_of(stories: readonly StoryDealData[], slides: Slide[], chapters: Chapter[]): void {
  for (const story of stories) {
    const chapterId = `story-${story.slug}`;
    const chapterTitle = story.title;
    const first = slides.length;
    const items = storySlides(story, chapterId, chapterTitle);
    slides.push(...items);
    const summary = story.deal.summary;
    chapters.push({
      id: chapterId,
      title: chapterTitle,
      blurb:
        summary === null
          ? '牌局'
          : `${summary.contract.points}${summary.contract.strain} 定约 · ${summary.made ? '打成' : '打输'} · 最终 ${summary.finalScore} 分`,
      first,
      count: items.length
    });
  }
}

export function chapterOf(deck: Deck, slideId: string): Chapter | null {
  const slide = deck.slides.find((item) => item.id === slideId);
  if (slide === undefined) return null;
  return deck.chapters.find((chapter) => chapter.id === slide.chapterId) ?? null;
}

export function slideIndexOf(deck: Deck, slideId: string): number {
  return deck.slides.findIndex((slide) => slide.id === slideId);
}
