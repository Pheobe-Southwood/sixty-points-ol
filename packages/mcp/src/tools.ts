import { z } from 'zod';
import {
  bidCandidates,
  checkPlay,
  HELP_KEYS,
  phaseHelp,
  type BidCall,
  type Card,
  type HelpKey,
  type PlayerSeat,
  type PublicView
} from '@sixty/engine';
import { ApiError, type GameApi, type SeatlessAction } from './api.ts';
import type { Role, TableSummary, TableView } from './wire.ts';

/** 参数格式不对、或调用方式错了（不是服务端的判定） */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

export interface ToolRuntime {
  readonly api: GameApi;
  /** wait_for_turn 的轮询间隔；低于 500ms 会被夹到 500ms */
  readonly pollMs?: number | undefined;
  /** wait_for_turn 不传 timeout_seconds 时的默认秒数 */
  readonly defaultWaitSeconds?: number | undefined;
  /** 注入点：测试里可以立即返回，不真的等 */
  readonly sleep?: ((ms: number) => Promise<void>) | undefined;
}

export interface ToolSpec {
  readonly name: string;
  readonly description: string;
  /** zod raw shape：SDK 直接拿它生成 JSON Schema，本层用它做同一份校验 */
  readonly input: z.ZodRawShape;
  readonly run: (rt: ToolRuntime, args: Record<string, unknown>) => Promise<unknown>;
}

export const DEFAULT_WAIT_SECONDS = 30;
export const MAX_WAIT_SECONDS = 60;
export const DEFAULT_POLL_MS = 1500;
export const MIN_POLL_MS = 500;

const CardSchema = z.union([
  z.object({ suit: z.enum(['C', 'D', 'H', 'S']), rank: z.number().int().min(2).max(14) }),
  z.object({ joker: z.enum(['small', 'big']) })
]);

const CallSchema = z.union([
  z.literal('pass'),
  z.object({ points: z.number().int(), strain: z.enum(['C', 'D', 'H', 'S', 'NT']) })
]);

const CODE_FIELD = z
  .string()
  .min(1)
  .optional()
  .describe('同桌邀请码；省略时自动用该凭据唯一所在的那张桌');

/** 只在需要 6 位码的动作里带上 code 字段 */
const codeField = { code: CODE_FIELD };

type ToolPhase = 'lobby' | 'auction' | 'bury' | 'play' | 'scored' | 'finished';

export interface TurnSummary {
  readonly phase: ToolPhase;
  readonly isYourTurn: boolean;
  /** 现在你能做点事吗（发牌/叫牌/埋底/出牌/开下一副都算） */
  readonly canAct: boolean;
  readonly hint: string;
}

export interface TableState {
  readonly code: string;
  /** 座位上的玩家 = player；观战者 = spectator（由服务端按数据库现算，工具面无法自称玩家） */
  readonly role: Role;
  readonly table: TableView;
  /** 公共视图：没有手牌与底牌，观战者拿到的就是这一份 */
  readonly view: PublicView | null;
  /** 玩家私有那一份（手牌、是否庄家、拿上来的底牌）；观战者为 null */
  readonly you: PlayerSeat | null;
  readonly turn: TurnSummary;
}

function phaseOf(view: PublicView | null): ToolPhase {
  if (view === null) return 'lobby';
  if (view.status === 'finished') return 'finished';
  const deal = view.deal;
  if (deal === null) return 'lobby';
  return deal.phase;
}

/**
 * 「现在轮到谁、我能做什么」——工具面自己的摘要，不新增任何视图类型：
 * 事实全部来自服务器的负载（公共视图 + `you`），这里只是翻译成 agent 一眼能读懂的判断。
 */
export function turnOf(role: Role, view: PublicView | null, you: PlayerSeat | null): TurnSummary {
  const phase = phaseOf(view);

  // 角色只认 `role`：`you` 为 null 有第二种含义（在座、但这副还没发牌），不能拿来判断观战
  if (role !== 'player') {
    return {
      phase,
      isYourTurn: false,
      canAct: false,
      hint: '你在**观战**（没有座位）：可以读局面与说明，但发牌/叫牌/埋底/出牌都要求先入座 —— 用 join_table 进桌，有空座就会坐上。'
    };
  }

  if (view === null || view.deal === null) {
    return {
      phase,
      isYourTurn: true,
      canAct: true,
      hint: '这张桌还没发过牌：三人到齐后任意一人都可以用 deal 开始第一副。'
    };
  }
  if (view.status === 'finished') {
    return {
      phase: 'finished',
      isYourTurn: true,
      canAct: true,
      hint: '对局已结束（见 view.result）：可以用 new_game 开新对局，级别重置。'
    };
  }
  if (you === null) {
    // 有牌局却拿不到自己那一份：服务端的角色判定异常，如实说出来而不是瞎猜
    return {
      phase,
      isYourTurn: false,
      canAct: false,
      hint: '服务端把你判为在座，却没有给出你的手牌（you 为 null）：重新 get_state 看看，或检查这个凭据的身份。'
    };
  }

  const deal = view.deal;
  switch (deal.phase) {
    case 'auction': {
      const mine = deal.auctionTurn === you.seat;
      return {
        phase: 'auction',
        isYourTurn: mine,
        canAct: mine,
        hint: mine
          ? '轮到你叫牌：用 legal_bids 看合法叫品，或者直接 bid 一个（也可以 pass）。'
          : `等座位 ${deal.auctionTurn} 叫牌（要等就调 wait_for_turn）。`
      };
    }
    case 'bury': {
      const mine = you.isDeclarer;
      return {
        phase: 'bury',
        isYourTurn: mine,
        canAct: mine,
        hint: mine ? '你是庄家：用 bury 恰好扣 3 张进底。' : '等庄家埋底。'
      };
    }
    case 'play': {
      const mine = deal.playTurn === you.seat;
      const leading = deal.trick === null || deal.trick.plays.length === 0;
      return {
        phase: 'play',
        isYourTurn: mine,
        canAct: mine,
        hint: mine
          ? leading
            ? '轮到你领出：单张，或同门顺子（多张必须同门且严格相邻）。'
            : '轮到你跟牌：同门同张数，结构优先（最长连续段的第一分解必须最大）。'
          : `等座位 ${deal.playTurn ?? '?'} 出牌（要等就调 wait_for_turn）。`
      };
    }
    case 'scored':
      return {
        phase: 'scored',
        isYourTurn: true,
        canAct: true,
        hint: '本副已结算（见 view.deal.summary）：可以用 deal 开下一副。'
      };
  }
}

/** 同桌码：显式给了就用，否则从该凭据的桌里推断（0 张 / 多张各有各的话要说） */
export async function resolveCode(rt: ToolRuntime, code: unknown): Promise<string> {
  if (typeof code === 'string' && code.trim().length > 0) return code.trim().toUpperCase();
  const tables = await rt.api.listTables();
  if (tables.length === 0) {
    throw new ToolError('这个凭据还没在任何一张同桌里：用 join_table 拿邀请码入座，或用 create_table 自己开一张。');
  }
  if (tables.length === 1) return tables[0]!.code.toUpperCase();
  throw new ToolError(
    `这个凭据在多张同桌里（${tables.map((t) => t.code).join('、')}）：请用 code 参数指定用哪一张。`
  );
}

export async function stateOf(rt: ToolRuntime, codeArg: unknown): Promise<TableState> {
  const code = await resolveCode(rt, codeArg);
  const payload = await rt.api.table(code);
  return {
    code,
    role: payload.role,
    table: payload.table,
    view: payload.view,
    you: payload.you,
    turn: turnOf(payload.role, payload.view, payload.you)
  };
}

async function act(rt: ToolRuntime, codeArg: unknown, action: SeatlessAction): Promise<TableState> {
  const code = await resolveCode(rt, codeArg);
  await rt.api.act(code, action);
  return stateOf(rt, code);
}

async function waitForTurn(rt: ToolRuntime, codeArg: unknown, secondsArg: unknown): Promise<unknown> {
  const requested = typeof secondsArg === 'number' && Number.isFinite(secondsArg) ? secondsArg : undefined;
  const seconds = Math.min(Math.max(requested ?? rt.defaultWaitSeconds ?? DEFAULT_WAIT_SECONDS, 0), MAX_WAIT_SECONDS);
  const timeoutMs = seconds * 1000;
  const pollMs = Math.max(rt.pollMs ?? DEFAULT_POLL_MS, MIN_POLL_MS);
  const sleep = rt.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  const startedAt = Date.now();
  for (;;) {
    const state = await stateOf(rt, codeArg);
    if (state.turn.canAct) return { ...state, timedOut: false };
    // 观战者没有座位：等多久都不会轮到自己，立刻说清楚而不是空转到超时
    if (state.role === 'spectator') return { ...state, timedOut: false };
    if (Date.now() - startedAt >= timeoutMs) return { ...state, timedOut: true };
    await sleep(pollMs);
  }
}

/**
 * 工具表：与传输无关的**唯一**工具定义。
 *
 * stdio 包（src/stdio.ts）与 web 的 `/api/mcp` 路由都把这张表挂到各自的 SDK 服务器上，
 * 所以两条传输的能力、文案、错误形状永远一致；这里不 import SDK，也不需要网络。
 * 服务端始终是唯一裁判：读写都经过 `GameApi`，而它的出口只有个人视图。
 */
export const TOOLS: readonly ToolSpec[] = [
  {
    name: 'get_state',
    description:
      '读当前局面（幂等）。返回 role（player/spectator）、view（**公共视图**：叫牌、已出的牌、各家手牌张数、级别 —— 观战者能看到的全部）、you（你的手牌与拿上来的底牌，观战者为 null）、table、turn（轮到谁、你能不能动、该做什么）。',
    input: codeField,
    run: (rt, args) => stateOf(rt, args['code'])
  },
  {
    name: 'wait_for_turn',
    description:
      `等轮到自己再返回（阻塞 ≤ ${MAX_WAIT_SECONDS} 秒，默认 ${DEFAULT_WAIT_SECONDS} 秒）：内部每 ${DEFAULT_POLL_MS}ms 读一次局面，直到你能行动（发牌/叫牌/埋底/出牌/开下一副）或超时。超时就把 timedOut 置 true 并原样返回当前局面，直接再调一次即可。`,
    input: { ...codeField, timeout_seconds: z.number().int().min(0).max(MAX_WAIT_SECONDS).optional() },
    run: (rt, args) => waitForTurn(rt, args['code'], args['timeout_seconds'])
  },
  {
    name: 'read_rules',
    description: `读玩法说明（打牌前先读一遍）：不传 key 返回全部阶段（${HELP_KEYS.length} 段）；key 取 ${HELP_KEYS.join('/')}。`,
    input: { key: z.string().optional().describe('阶段键；省略则返回全部阶段') },
    run: async (_rt, args) => {
      const raw = args['key'];
      if (raw !== undefined && !HELP_KEYS.includes(raw as HelpKey)) {
        throw new ToolError(`key 只能是 ${HELP_KEYS.join(' / ')}；收到「${String(raw)}」`);
      }
      const keys: readonly HelpKey[] = raw === undefined ? HELP_KEYS : [raw as HelpKey];
      return {
        entries: keys.map((k) => {
          const entry = phaseHelp(k);
          return { key: k, title: entry.title, anchor: entry.anchor, lines: entry.body };
        }),
        note: '完整图文教程在 /rules#<anchor>；升级表与顺子示例都在里面。'
      };
    }
  },
  {
    name: 'legal_bids',
    description: '列出当前所有合法叫品（分数为主序、步长 5，同分花色必须更高）：不是叫牌阶段时返回空表。',
    input: codeField,
    run: async (rt, args) => {
      const state = await stateOf(rt, args['code']);
      const deal = state.view?.deal ?? null;
      const options = state.view === null ? [] : bidCandidates(state.view);
      return {
        code: state.code,
        phase: deal?.phase ?? 'lobby',
        highestBid: deal?.highestBid ?? null,
        turn: state.turn,
        options,
        note:
          options.length === 0
            ? '现在没有可叫的叫品（不是叫牌阶段，或者已经轮不到你）。'
            : '同分之下 strain 越大越高：C < D < H < S < NT。'
      };
    }
  },
  {
    name: 'check_play',
    description:
      '出牌前的本地预判：给出的牌在规则上合不合法（领出要同门成顺子；跟牌同门同张数且结构优先）。服务端才是唯一裁判，这一步只是省一次往返。',
    input: { ...codeField, cards: z.array(CardSchema).min(1) },
    run: async (rt, args) => {
      const state = await stateOf(rt, args['code']);
      if (state.role !== 'player') {
        return { ok: false, error: '你在观战，没有手牌可出（先用 join_table 入座）' };
      }
      const view = state.view;
      const deal = view?.deal ?? null;
      if (view === null || deal === null || deal.trump === null || deal.phase !== 'play') {
        return { ok: false, error: '现在不是出牌阶段' };
      }
      if (state.you === null) return { ok: false, error: '拿不到你的手牌（you 为 null）' };
      const cards = args['cards'] as Card[];
      const lead = deal.trick !== null && deal.trick.plays.length > 0 ? deal.trick.plays[0]!.cards : null;
      const error = checkPlay(state.you.hand, cards, deal.trump, lead);
      return { ok: error === null, error: error ?? null };
    }
  },
  {
    name: 'bid',
    description: '叫牌：call 传 "pass"，或 { points, strain }（points 为 5 的倍数、≥40；strain 取 C/D/H/S/NT）。成功后返回新局面。',
    input: { ...codeField, call: CallSchema },
    run: (rt, args) => act(rt, args['code'], { type: 'bid', call: args['call'] as BidCall })
  },
  {
    name: 'bury',
    description: '庄家埋底：恰好 3 张（从你的 20 张里扣进暗底）。成功后返回新局面。',
    input: { ...codeField, cards: z.array(CardSchema).length(3) },
    run: (rt, args) => act(rt, args['code'], { type: 'bury', cards: args['cards'] as Card[] })
  },
  {
    name: 'play',
    description:
      '出牌：cards 是这次要出的 1 张或多张（多张必须同门顺子/结构优先）。牌对象可以直接拿 get_state 里 you.hand 的原样元素。成功后返回新局面。',
    input: { ...codeField, cards: z.array(CardSchema).min(1) },
    run: (rt, args) => act(rt, args['code'], { type: 'play', cards: args['cards'] as Card[] })
  },
  {
    name: 'deal',
    description: '发下一副（上一副已结算、或还没开始第一副时可用；三人到齐才发得出去）。返回新局面。',
    input: codeField,
    run: (rt, args) => act(rt, args['code'], { type: 'deal' })
  },
  {
    name: 'new_game',
    description: '对局结束后开新对局（级别重置、发牌人轮转）。没结束时会失败。',
    input: codeField,
    run: (rt, args) => act(rt, args['code'], { type: 'newGame' })
  },
  {
    name: 'list_my_tables',
    description:
      '列出这个凭据所在的同桌（邀请码 + 已入座人数 + 我在那张桌的角色），用来在没被告知邀请码时找到该坐哪张桌。',
    input: {},
    run: async (rt) => {
      const tables: readonly TableSummary[] = await rt.api.listTables();
      return { tables };
    }
  },
  {
    name: 'join_table',
    description:
      '用邀请码进桌：有空座就入座（坐上空座会继承该座位的级别与手牌），**满座则以观战者身份进入**（不再报错）。已在座则原样返回。成功后返回新局面。',
    input: { code: z.string().min(1).describe('6 位邀请码') },
    run: async (rt, args) => {
      const code = (args['code'] as string).trim().toUpperCase();
      await rt.api.enterTable(code);
      return stateOf(rt, code);
    }
  },
  {
    name: 'create_table',
    description: '自己开一张新同桌，返回邀请码（随后要把码告诉同桌的另外两人）。',
    input: {},
    run: async (rt) => {
      const code = await rt.api.createTable();
      return { code, note: '把邀请码发给另外两人，他们在大厅粘贴邀请链接即可入座。' };
    }
  }
];

export function toolByName(name: string): ToolSpec | undefined {
  return TOOLS.find((tool) => tool.name === name);
}

/** 统一的调用入口：先按 zod shape 校验参数，再把错误收敛成一句人话（SDK 侧转成 isError） */
export async function callTool(spec: ToolSpec, rt: ToolRuntime, rawArgs: unknown): Promise<unknown> {
  const parsed = z.object(spec.input).safeParse(rawArgs ?? {});
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue?.path.join('.') ?? '(参数)';
    throw new ToolError(`参数格式不正确：${where} ${issue?.message ?? ''}`.trim());
  }
  try {
    return await spec.run(rt, parsed.data as Record<string, unknown>);
  } catch (error) {
    if (error instanceof ToolError) throw error;
    if (error instanceof ApiError) throw new ToolError(`服务器拒绝：${error.message}`);
    throw new ToolError(error instanceof Error ? error.message : String(error));
  }
}
