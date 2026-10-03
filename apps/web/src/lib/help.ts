/**
 * 各阶段的玩法说明（纯数据 + 纯函数）。
 *
 * 界面上不再有任何常驻提示文案：说明只存在于左下的「?」弹层与 `/rules` 教程，
 * 两处共用这份文本，避免同一句话在三个地方各写一遍再各自过期。
 * `anchor` 指向 `/rules` 的小节 id，由 test/help.test.ts 对着真实页面校验。
 */

export type HelpKey =
  | 'lobby'
  | 'auction'
  | 'bury-declarer'
  | 'bury-defender'
  | 'play-lead'
  | 'play-follow'
  | 'play-wait'
  | 'scored';

export interface HelpEntry {
  /** `/rules` 里的小节 id（不含 #） */
  readonly anchor: string;
  readonly title: string;
  /** 每条一句，逐条渲染成列表；此处不出现方位称谓，玩家一律用「你/队友/庄家」等角色表述 */
  readonly body: readonly string[];
}

const ENTRIES: Record<HelpKey, HelpEntry> = {
  lobby: {
    anchor: 'start',
    title: '准备阶段',
    body: [
      '三人入座后，任意一人都可以点「开始第一副」；首副的发牌人由服务器随机决定，之后按座位轮转。',
      '把邀请码或邀请链接发给朋友：点顶部的邀请码即可复制链接，对方在大厅粘贴链接也能直接入座。',
      '每人 17 张手牌，另有 3 张暗底；庄家拿底后再扣 3 张埋回去。',
      '对局从 2(+0) 开始，四步一副：叫牌 → 埋底 → 打牌 → 结算升级。'
    ]
  },
  auction: {
    anchor: 'auction',
    title: '叫牌：定庄、定主',
    body: [
      '40 分起步，每次至少加 5 分；分数是主序，同分时花色必须更高：♣ < ♦ < ♥ < ♠ < 无主。',
      '叫牌无上限、无加倍。你叫出的分数，就是自己坐庄后必须抓够的目标分。',
      '连续两家不叫即成交，最后叫牌的人成为庄家；本副级牌点数取自庄家的级别，将牌就是叫到的花色（无主时只有四张级牌与双王是主牌）。',
      '三家开叫全部 pass 时本副作废重发：级别不变，改由下一位发牌人发牌。',
      '叫牌是「认领责任」：叫多少分就要抓多少分。弱牌可以一直不叫 —— 全 pass 只是重发、不损失；有人接手你就当闲家。'
    ]
  },
  'bury-declarer': {
    anchor: 'bury',
    title: '埋底（你是庄家）',
    body: [
      '你从 20 张手牌里扣 3 张进暗底，另外两家在结算前看不到这 3 张。',
      '可以埋分牌：底分不会凭空消失，最终按「底牌分 × 末轮张数」结算。',
      '末轮由你赢下 = 保底，这部分分数加进你的得分；被闲家赢走 = 抠底，从你的得分里扣掉（可为负）。',
      '例：埋了 ♥5 ♦5（10 分），末轮每家出 2 张且你赢下 → +20；被闲家赢走 → −20。',
      '埋多少分、留多少张大牌护底，是庄家的核心取舍。'
    ]
  },
  'bury-defender': {
    anchor: 'bury',
    title: '等待庄家埋底',
    body: [
      '庄家正从 20 张手牌里扣 3 张进暗底，你和另一名闲家在结算前都看不到这 3 张。',
      '埋底只影响底分：末轮被闲家赢走时，底分按「底牌分 × 末轮张数」从庄家得分里扣。',
      '所以末轮要尽量抢：赢下末轮既拿到本轮的分数，还可能抠底。'
    ]
  },
  'play-lead': {
    anchor: 'play',
    title: '领出（本轮你出第一手）',
    body: [
      '可以出单张，也可以出同门顺子：同门内按大小严格相邻的 2 张及以上。',
      '副牌顺子跳过级牌（例：级牌 5 时 ♣3-4-6-7 是合法顺子）；主牌顺子按主牌全序相邻，至多含一张副级。',
      '你领出几张，三家就都要跟几张；跟不出同门的玩家可以出主牌杀牌，或垫牌。'
    ]
  },
  'play-follow': {
    anchor: 'play',
    title: '跟牌（轮到你）',
    body: [
      '必须同门、同张数。',
      '结构优先：所选牌的「最长连续段」分解必须字典序最大——领 4 顺而你有 3 顺 + 2 顺时，必须出 3 顺 + 任 1 张；持 2 + 2 才能两顺跟完。',
      '缺门时：用同张数的连续主牌杀牌可以赢下这一轮；垫牌（含结构性跟牌）不能赢。',
      '分牌（5 / 10 / K）尽量等手里有大牌时再出，或者垫给队友。'
    ]
  },
  'play-wait': {
    anchor: 'play',
    title: '等待出牌',
    body: [
      '现在轮到别人出牌，你只能看到自己的手牌（17 张，越打越少）。',
      '每一轮的赢家：同门更高、或主牌杀牌；长度相同、同门、层号相等时先出为大。',
      '副级牌（非主花色的级牌）三张完全相等，彼此不构成顺子相邻。'
    ]
  },
  scored: {
    anchor: 'scoring',
    title: '结算与升级',
    body: [
      '庄家得分 = 墩分 + 底牌分 × 末轮张数（保底为正、抠底为负）；≥ 定约分即打成。',
      '升级只看实际最终得分、与叫分无关。得分「从当前级别往前推进 N 级」：例如 5(+0) 打成 75 分 → 8(+0)；跨轮时 A(+0) 升 2 级 → 3(+1)。',
      '打成的档位（得分只会是 5 的倍数）：40-55 → 1 级，60-65 → 2 级，70-75 → 3 级，80-85 → 4 级，90 及以上 5 级起、每多 5 分再 1 级。',
      '打输则两名闲家各升 ceil(差 / 10) 级（差 = 定约分 − 最终得分，向上取整）：差 5-10 → 1 级，15-20 → 2 级，35 → 4 级；庄家级别不变。',
      '2(+0) 起步，A 之后进 2(+1)；两家达 2(+2) 或一家达 2(+3) 即结束，总进度最高者为冠军。'
    ]
  }
};

export function phaseHelp(key: HelpKey): HelpEntry {
  return ENTRIES[key];
}

export interface HelpContext {
  readonly phase: 'lobby' | 'auction' | 'bury' | 'play' | 'scored';
  /** 仅 bury/play 阶段有意义 */
  readonly isDeclarer?: boolean;
  /** 仅 play 阶段有意义 */
  readonly myTurn?: boolean;
  /** 仅 play 阶段有意义：本轮还没有人出牌，由你领出 */
  readonly leading?: boolean;
}

/** 当前该显示哪一段说明：状态 → HelpKey */
export function helpKeyOf(ctx: HelpContext): HelpKey {
  switch (ctx.phase) {
    case 'lobby':
      return 'lobby';
    case 'auction':
      return 'auction';
    case 'bury':
      return ctx.isDeclarer === true ? 'bury-declarer' : 'bury-defender';
    case 'play':
      if (ctx.myTurn !== true) return 'play-wait';
      return ctx.leading === true ? 'play-lead' : 'play-follow';
    case 'scored':
      return 'scored';
  }
}
