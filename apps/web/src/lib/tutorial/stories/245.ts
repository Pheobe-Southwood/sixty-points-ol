/**
 * 由 apps/web/scripts/build-deal-stories.ts 生成，请勿手改。
 *
 * 源文件：
 *   docs/deals/<slug>.json         作者打出来的牌局与逐步原话（永不改写）
 *   docs/deals/notes/<slug>.json   润色与补写（含 original / why，供复核）
 * 改讲解请改这两份，再重跑：pnpm --filter web deal
 */
import type { StoryDealData } from '$lib/story/story-data';

export const STORY: StoryDealData = {
  "slug": "245",
  "title": "偏牌 245",
  "names": [
    "你",
    "阿豪",
    "小美"
  ],
  "spec": {
    "seed": "gkz5mo",
    "dealerSeat": 0,
    "levels": [
      {
        "rank": 2,
        "cycle": 0
      },
      {
        "rank": 4,
        "cycle": 0
      },
      {
        "rank": 5,
        "cycle": 0
      }
    ]
  },
  "intro": "这一副偏牌：你手上方块六张，阿豪红桃六张，而小美的红桃是整整五张连在一起，主牌足足八张。叫牌从 40 一路对拉到 60，最后阿豪 60♥ 坐庄。看点在后面——他想清主，一头撞在小美的主牌上。",
  "outro": "这副牌两个转折点。一是小美从头到尾不叫、不露声色，把阿豪一路推到 60；二是第 2 墩，她用 ♥8-9-10 管住了庄家的清主——7 张主牌对 8 张，阿豪从那一刻起就落在劣势里。\n最后 25 − 10 = 15 分，差 45 分，两家闲家各升 5 级。这也是「叫高没好处」最直观的一副：60 分没让他多拿一个级数，只是把及格线抬到了够不着的地方。",
  "deal": {
    "hands": [
      [
        "j0",
        "S11",
        "C5",
        "D14",
        "D5",
        "H3",
        "S12",
        "C8",
        "C7",
        "D12",
        "S4",
        "C2",
        "C3",
        "D3",
        "D8",
        "S2",
        "D6"
      ],
      [
        "H13",
        "S10",
        "C9",
        "D13",
        "D11",
        "C13",
        "D7",
        "j1",
        "C14",
        "C11",
        "S3",
        "D10",
        "H2",
        "H5",
        "H7",
        "H6",
        "H14"
      ],
      [
        "S14",
        "H9",
        "D2",
        "H12",
        "D9",
        "C4",
        "H4",
        "S13",
        "H11",
        "H8",
        "C10",
        "H10",
        "D4",
        "S6",
        "S5",
        "S9",
        "C6"
      ]
    ],
    "originalKitty": [
      "C12",
      "S8",
      "S7"
    ],
    "kitty": [
      "S10",
      "S3",
      "D7"
    ],
    "trump": {
      "strain": "H",
      "rank": 4
    },
    "contract": {
      "points": 60,
      "strain": "H",
      "declarerSeat": 1
    },
    "summary": {
      "dealNo": 1,
      "contract": {
        "points": 60,
        "strain": "H",
        "declarerSeat": 1
      },
      "trump": {
        "strain": "H",
        "rank": 4
      },
      "declarerTrickPoints": 25,
      "defenderTrickPoints": 65,
      "originalKitty": [
        {
          "suit": "C",
          "rank": 12
        },
        {
          "suit": "S",
          "rank": 8
        },
        {
          "suit": "S",
          "rank": 7
        }
      ],
      "kitty": [
        {
          "suit": "S",
          "rank": 10
        },
        {
          "suit": "S",
          "rank": 3
        },
        {
          "suit": "D",
          "rank": 7
        }
      ],
      "lastTrickSize": 1,
      "protectedBottom": false,
      "multiplier": 1,
      "kittyPoints": 10,
      "finalScore": 15,
      "made": false,
      "shortfall": 45,
      "levelChanges": [
        {
          "seat": 0,
          "from": {
            "rank": 2,
            "cycle": 0
          },
          "to": {
            "rank": 7,
            "cycle": 0
          },
          "levels": 5
        },
        {
          "seat": 2,
          "from": {
            "rank": 5,
            "cycle": 0
          },
          "to": {
            "rank": 10,
            "cycle": 0
          },
          "levels": 5
        }
      ]
    }
  },
  "lines": [
    {
      "index": 0,
      "kind": "deal",
      "seat": null,
      "headline": "发牌：每家 17 张，另留 3 张暗底",
      "tags": [
        "你 发牌"
      ],
      "cards": [],
      "points": 0,
      "text": "发牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 1,
      "kind": "bid",
      "seat": 0,
      "headline": "你 40♦",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "方块长，六张；其中 ♦3-5-6 是连着的三顺（级牌是 4，♦4 归主牌，跳过）。手里另外还有两张 2，不过是普通副牌——这一副的级牌是 4，不是 2。",
      "source": "polish",
      "original": "方块长，且有两张 2。叫牌后 ♦A-♣️2 可以成较大顺。",
      "why": "原句读不通：本副级牌是庄家阿豪的 4，所以两张 2（♣2 ♠2）不是级牌；而 ♦A 与 ♣2 既不同门（♦ 与 ♣）也不相邻（层号 12 与 1），引擎判定不可能成顺。按你手上实际的牌，真正连起来的是 ♦3-5-6。顺带把原句里 ♣ 后面的 emoji 变体字符去掉了。"
    },
    {
      "index": 2,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 40♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "红桃长，且有 5-6-7 较长三连顺",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 3,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "没有王，没有 5，不好自己打；上家叫红桃，打 4，自己有 8-9-10-J-Q，一张主 4、两张副 4，相当令人满意。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 4,
      "kind": "bid",
      "seat": 0,
      "headline": "你 45♦",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "自己红桃极少，不愿让对方打。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 5,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 45♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "自认为红桃能得较多分，继续博弈。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 6,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "继续不叫。三张 4（♥4 ♦4 ♣4）都攥在自己手里，当闲家等着打反击，比自己去坐庄舒服。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 7,
      "kind": "bid",
      "seat": 0,
      "headline": "你 50♦",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "往上抬。真要是 ♦ 当主，自己这六张方块全算主，再加 ♠4 和小王，硬牌就来了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 8,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 50♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "红桃六张加大王，他也觉得自己撑得住，跟。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 9,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "还是不动。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 10,
      "kind": "bid",
      "seat": 0,
      "headline": "你 55♦",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "再抬一手。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 11,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 55♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "还跟。两个人都在赌对方先松口。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 12,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "继续旁观。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 13,
      "kind": "bid",
      "seat": 0,
      "headline": "你 60♦",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "抬到 60。走到这一步不全是为了打 ♦，更是不想让对方轻松成交。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 14,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 60♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "阿豪接了 60。他心里有底：红桃长，还有大王。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 15,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "第三家不叫。只要最后叫牌的人也松手，这副就成交在 60♥。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 16,
      "kind": "bid",
      "seat": 0,
      "headline": "你 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "另一家一直不叫，怀疑其红桃好。自己继续叫可能打不过。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 17,
      "kind": "bury",
      "seat": 1,
      "headline": "阿豪 埋 3 张（底分 10）",
      "tags": [
        "这 3 张结算前对闲家不可见"
      ],
      "cards": [
        "S10",
        "S3",
        "D7"
      ],
      "points": 10,
      "text": "认为有保底希望，埋下分；确保 ♠ 出完 7-8 就结束后续可杀牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 18,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♣J-Q-K-A",
      "tags": [
        "领出 4 张顺子",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "C14",
        "C13",
        "C12",
        "C11"
      ],
      "points": 10,
      "text": "必大牌，要分",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 19,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♦2 ♦9 ♣6 ♣10",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "C10",
        "C6",
        "D9",
        "D2"
      ],
      "points": 10,
      "text": "必出两张 ♣，再垫两张，刚好可以把 ♦ 垫完，后续杀牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 20,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♣2-3-5 ♣7",
      "tags": [
        "结构性跟牌（3+1）",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "C7",
        "C5",
        "C3",
        "C2"
      ],
      "points": 5,
      "text": "2-3-5 是三顺（4 为级牌跳过），必出；再跟一张",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 21,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♥5-6-7",
      "tags": [
        "领出 3 张顺子",
        "主牌",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "H7",
        "H6",
        "H5"
      ],
      "points": 5,
      "text": "准备清主",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 22,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♥8-9-10",
      "tags": [
        "同门跟 3 张",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "H10",
        "H9",
        "H8"
      ],
      "points": 10,
      "text": "很遗憾，庄家被管上了。这里不得不拆五顺，因为另外的 ♣4-♥4 只是两顺，有三顺必须先出。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 23,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♥3 ♠4 小王",
      "tags": [
        "结构性跟牌（1+1+1）",
        "此轮不赢"
      ],
      "cards": [
        "j0",
        "S4",
        "H3"
      ],
      "points": 0,
      "text": "仅此三张主牌",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 24,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♦4-♥4",
      "tags": [
        "领出 2 张顺子",
        "主牌",
        "赢墩"
      ],
      "cards": [
        "H4",
        "D4"
      ],
      "points": 0,
      "text": "反攻：目前剩余 9 张主牌，自己有 5 张，另一家看起来没有主了，那么庄家只有 4 张主。可以将庄家清完。先出大顺。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 25,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦5 ♣8",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "C8",
        "D5"
      ],
      "points": 5,
      "text": "自己已经出了小王，小王-大王顺子不存在，队友牌必大无疑，垫分。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 26,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♥K-A",
      "tags": [
        "同门跟 2 张",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "H14",
        "H13"
      ],
      "points": 10,
      "text": "仅此一手。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 27,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♥J-Q",
      "tags": [
        "领出 2 张顺子",
        "主牌",
        "赢墩"
      ],
      "cards": [
        "H12",
        "H11"
      ],
      "points": 0,
      "text": "继续反攻，看起来庄家没有顺子了。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 28,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦3 ♦6",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "D6",
        "D3"
      ],
      "points": 0,
      "text": "没有分，随意出。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 29,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♥2 大王",
      "tags": [
        "结构性跟牌（1+1）",
        "此轮不赢"
      ],
      "cards": [
        "j1",
        "H2"
      ],
      "points": 0,
      "text": "仅此一手",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 30,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♠K-A",
      "tags": [
        "领出 2 张顺子",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "S14",
        "S13"
      ],
      "points": 10,
      "text": "出 ♠K-A 大顺，庄家没有主牌，无法杀牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 31,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♠J-Q",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "S12",
        "S11"
      ],
      "points": 0,
      "text": "必须跟顺",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 32,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♠7-8",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "S8",
        "S7"
      ],
      "points": 0,
      "text": "必须跟顺",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 33,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♠5-6",
      "tags": [
        "领出 2 张顺子",
        "赢墩",
        "带 5 分"
      ],
      "cards": [
        "S6",
        "S5"
      ],
      "points": 5,
      "text": "继续出顺",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 34,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♠2 ♦8",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "S2",
        "D8"
      ],
      "points": 0,
      "text": "剩余一张黑桃必出，再垫一张",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 35,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♦10-J",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "D11",
        "D10"
      ],
      "points": 10,
      "text": "陷入被动，只能留一些大牌在手里。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 36,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♠9",
      "tags": [
        "领出单张",
        "赢墩"
      ],
      "cards": [
        "S9"
      ],
      "points": 0,
      "text": "剩余的牌都大了，随意出牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 37,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦Q",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "D12"
      ],
      "points": 0,
      "text": "手里只剩两张方块，随便垫。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 38,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♣9",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "C9"
      ],
      "points": 0,
      "text": "庄家也早没主了，跟着垫。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 39,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♣4",
      "tags": [
        "领出单张",
        "主牌",
        "赢墩"
      ],
      "cards": [
        "C4"
      ],
      "points": 0,
      "text": "最后一轮。小美甩出最后一张 4——那是主牌，另外两家一张主都没有，这张必赢。底牌要归闲家了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 40,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦A",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "D14"
      ],
      "points": 0,
      "text": "跟不出主，垫 ♦A。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 41,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♦K",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "D13"
      ],
      "points": 10,
      "text": "庄家最后垫掉 ♦K，这 10 分也归了闲家；更疼的是最后一轮被闲家拿走，底牌那 10 分要从他账上倒扣。",
      "source": "fill",
      "original": null,
      "why": null
    }
  ],
  "tricks": [
    {
      "ordinal": 0,
      "leaderSeat": 1,
      "winnerSeat": 1,
      "points": 25,
      "size": 4,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "C14",
            "C13",
            "C12",
            "C11"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "C10",
            "C6",
            "D9",
            "D2"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "C7",
            "C5",
            "C3",
            "C2"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 4 张",
        "本墩 25 分"
      ],
      "note": "至此，庄家赢 25 分。",
      "lines": [
        {
          "index": 18,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♣J-Q-K-A",
          "tags": [
            "领出 4 张顺子",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "C14",
            "C13",
            "C12",
            "C11"
          ],
          "points": 10,
          "text": "必大牌，要分",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 19,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♦2 ♦9 ♣6 ♣10",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "C10",
            "C6",
            "D9",
            "D2"
          ],
          "points": 10,
          "text": "必出两张 ♣，再垫两张，刚好可以把 ♦ 垫完，后续杀牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 20,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♣2-3-5 ♣7",
          "tags": [
            "结构性跟牌（3+1）",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "C7",
            "C5",
            "C3",
            "C2"
          ],
          "points": 5,
          "text": "2-3-5 是三顺（4 为级牌跳过），必出；再跟一张",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 1,
      "leaderSeat": 1,
      "winnerSeat": 2,
      "points": 15,
      "size": 3,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "H7",
            "H6",
            "H5"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "H10",
            "H9",
            "H8"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "j0",
            "S4",
            "H3"
          ]
        }
      ],
      "headline": "阿豪 领出 · 小美 赢墩",
      "tags": [
        "每家 3 张",
        "主牌领出",
        "本墩 15 分"
      ],
      "note": "庄家意图清主，意外被拦截。",
      "lines": [
        {
          "index": 21,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♥5-6-7",
          "tags": [
            "领出 3 张顺子",
            "主牌",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "H7",
            "H6",
            "H5"
          ],
          "points": 5,
          "text": "准备清主",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 22,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♥8-9-10",
          "tags": [
            "同门跟 3 张",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "H10",
            "H9",
            "H8"
          ],
          "points": 10,
          "text": "很遗憾，庄家被管上了。这里不得不拆五顺，因为另外的 ♣4-♥4 只是两顺，有三顺必须先出。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 23,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♥3 ♠4 小王",
          "tags": [
            "结构性跟牌（1+1+1）",
            "此轮不赢"
          ],
          "cards": [
            "j0",
            "S4",
            "H3"
          ],
          "points": 0,
          "text": "仅此三张主牌",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 2,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 15,
      "size": 2,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "H4",
            "D4"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "C8",
            "D5"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "H14",
            "H13"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 2 张",
        "主牌领出",
        "本墩 15 分"
      ],
      "note": "小美用 ♦4-♥4 反攻——副级接主级，在主牌里刚好连着，两张就是一条顺。阿豪手上只有 ♥K-A 能跟，10 分送了出去。这一墩之后，庄家的主牌从 7 张掉到 2 张。",
      "lines": [
        {
          "index": 24,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♦4-♥4",
          "tags": [
            "领出 2 张顺子",
            "主牌",
            "赢墩"
          ],
          "cards": [
            "H4",
            "D4"
          ],
          "points": 0,
          "text": "反攻：目前剩余 9 张主牌，自己有 5 张，另一家看起来没有主了，那么庄家只有 4 张主。可以将庄家清完。先出大顺。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 25,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦5 ♣8",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "C8",
            "D5"
          ],
          "points": 5,
          "text": "自己已经出了小王，小王-大王顺子不存在，队友牌必大无疑，垫分。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 26,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♥K-A",
          "tags": [
            "同门跟 2 张",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "H14",
            "H13"
          ],
          "points": 10,
          "text": "仅此一手。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 3,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 0,
      "size": 2,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "H12",
            "H11"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D6",
            "D3"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "j1",
            "H2"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 2 张",
        "主牌领出"
      ],
      "note": "庄家只剩 ♥2 和 大王，一个 13 层、一个 16 层，凑不成两张连牌，只能拆开跟——大王白白扔掉，这墩 0 分，主牌却是彻底交出去了。",
      "lines": [
        {
          "index": 27,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♥J-Q",
          "tags": [
            "领出 2 张顺子",
            "主牌",
            "赢墩"
          ],
          "cards": [
            "H12",
            "H11"
          ],
          "points": 0,
          "text": "继续反攻，看起来庄家没有顺子了。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 28,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦3 ♦6",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "D6",
            "D3"
          ],
          "points": 0,
          "text": "没有分，随意出。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 29,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♥2 大王",
          "tags": [
            "结构性跟牌（1+1）",
            "此轮不赢"
          ],
          "cards": [
            "j1",
            "H2"
          ],
          "points": 0,
          "text": "仅此一手",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 4,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 10,
      "size": 2,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "S14",
            "S13"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "S12",
            "S11"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "S8",
            "S7"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 2 张",
        "本墩 10 分"
      ],
      "note": "庄家一张主都没有了。小美 ♠K-A 大顺，怎么出都拿得住，10 分到手。",
      "lines": [
        {
          "index": 30,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♠K-A",
          "tags": [
            "领出 2 张顺子",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "S14",
            "S13"
          ],
          "points": 10,
          "text": "出 ♠K-A 大顺，庄家没有主牌，无法杀牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 31,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♠J-Q",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "S12",
            "S11"
          ],
          "points": 0,
          "text": "必须跟顺",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 32,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♠7-8",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "S8",
            "S7"
          ],
          "points": 0,
          "text": "必须跟顺",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 5,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 15,
      "size": 2,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "S6",
            "S5"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "S2",
            "D8"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "D11",
            "D10"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 2 张",
        "本墩 15 分"
      ],
      "note": "继续 ♠5-6。闲家的顺子一手比一手大，庄家只能看着分被收走。",
      "lines": [
        {
          "index": 33,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♠5-6",
          "tags": [
            "领出 2 张顺子",
            "赢墩",
            "带 5 分"
          ],
          "cards": [
            "S6",
            "S5"
          ],
          "points": 5,
          "text": "继续出顺",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 34,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♠2 ♦8",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "S2",
            "D8"
          ],
          "points": 0,
          "text": "剩余一张黑桃必出，再垫一张",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 35,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♦10-J",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "D11",
            "D10"
          ],
          "points": 10,
          "text": "陷入被动，只能留一些大牌在手里。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 6,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 0,
      "size": 1,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "S9"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D12"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "C9"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 1 张"
      ],
      "note": "一张 ♠9 也是大的。到这儿节奏完全捏在小美手上。",
      "lines": [
        {
          "index": 36,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♠9",
          "tags": [
            "领出单张",
            "赢墩"
          ],
          "cards": [
            "S9"
          ],
          "points": 0,
          "text": "剩余的牌都大了，随意出牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 37,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦Q",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "D12"
          ],
          "points": 0,
          "text": "手里只剩两张方块，随便垫。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 38,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♣9",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "C9"
          ],
          "points": 0,
          "text": "庄家也早没主了，跟着垫。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 7,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 10,
      "size": 1,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "C4"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D14"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "D13"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 1 张",
        "主牌领出",
        "本墩 10 分"
      ],
      "note": "冲动是魔鬼，小美虽然红桃好，但不主动盖叫，不露声色，把阿豪推向 60，最后只获得 25-10=15 分。阿豪也没有料到，主牌会如此不平均，清主战略大败。最终差 45 分，闲家升 5 级。",
      "lines": [
        {
          "index": 39,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♣4",
          "tags": [
            "领出单张",
            "主牌",
            "赢墩"
          ],
          "cards": [
            "C4"
          ],
          "points": 0,
          "text": "最后一轮。小美甩出最后一张 4——那是主牌，另外两家一张主都没有，这张必赢。底牌要归闲家了。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 40,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦A",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "D14"
          ],
          "points": 0,
          "text": "跟不出主，垫 ♦A。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 41,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♦K",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "D13"
          ],
          "points": 10,
          "text": "庄家最后垫掉 ♦K，这 10 分也归了闲家；更疼的是最后一轮被闲家拿走，底牌那 10 分要从他账上倒扣。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    }
  ],
  "counts": {
    "total": 42,
    "author": 26,
    "polish": 1,
    "fill": 15,
    "blank": 0,
    "blankIndexes": []
  }
};
