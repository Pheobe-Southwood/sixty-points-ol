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
  "slug": "deal-zhs7sx",
  "title": "随机局",
  "names": [
    "你",
    "阿豪",
    "小美"
  ],
  "spec": {
    "seed": "zhs7sx",
    "dealerSeat": 1,
    "levels": [
      {
        "rank": 7,
        "cycle": 1
      },
      {
        "rank": 10,
        "cycle": 1
      },
      {
        "rank": 14,
        "cycle": 0
      }
    ]
  },
  "intro": "这一副是后期局：三家级别 7(+1)、10(+1)、A，本副级牌 10、主打 ♠。阿豪手上 ♠K-♠A-♥10-♠10 正好串成一条四顺（两张副级 10 里挑一张），再加一个大王，八张主，直接叫 50♠；你和小美牌都一般，很快就不叫了。\n这一副的看点有两个：阿豪的清主能不能成，以及——底牌那三张是 0 分，最后一轮赢下来其实没什么额外好处。",
  "outro": "这一副走得很干净：第一墩四顺清主，第二墩大王逼出小王，主牌清完（18 张主打完两墩只剩 6 张，之后外面一张都不剩）。此后庄家一路收分，只在第 6 墩被小美的 ♦9 拦了一下、第 7 墩又丢 20 分，但底子已经够厚——75 分对 50 的定约，打成，升 3 级。\n值得一提的是最后一轮：庄家用最后一张 ♦10（副级，算主牌）单张杀掉小美的 ♥A。底牌三张是 0 分，所以这次保底只赚了个「不挨罚」——埋了分才有保底可言，不埋分，最后一轮就是普通一墩。",
  "deal": {
    "hands": [
      [
        "S12",
        "C6",
        "D6",
        "H5",
        "D4",
        "H11",
        "H4",
        "C12",
        "S9",
        "H2",
        "S11",
        "S3",
        "S7",
        "D7",
        "C2",
        "D5",
        "H13"
      ],
      [
        "D13",
        "C7",
        "S10",
        "D3",
        "D10",
        "D8",
        "S5",
        "S13",
        "S4",
        "S14",
        "j1",
        "D14",
        "H10",
        "H12",
        "C9",
        "H3",
        "C13"
      ],
      [
        "C5",
        "H7",
        "H6",
        "D2",
        "H14",
        "S8",
        "S6",
        "H8",
        "j0",
        "C10",
        "C3",
        "C11",
        "D11",
        "C4",
        "S2",
        "D12",
        "D9"
      ]
    ],
    "originalKitty": [
      "H9",
      "C14",
      "C8"
    ],
    "kitty": [
      "H12",
      "H9",
      "H3"
    ],
    "trump": {
      "strain": "S",
      "rank": 10
    },
    "contract": {
      "points": 50,
      "strain": "S",
      "declarerSeat": 1
    },
    "summary": {
      "dealNo": 1,
      "contract": {
        "points": 50,
        "strain": "S",
        "declarerSeat": 1
      },
      "trump": {
        "strain": "S",
        "rank": 10
      },
      "declarerTrickPoints": 75,
      "defenderTrickPoints": 25,
      "originalKitty": [
        {
          "suit": "H",
          "rank": 9
        },
        {
          "suit": "C",
          "rank": 14
        },
        {
          "suit": "C",
          "rank": 8
        }
      ],
      "kitty": [
        {
          "suit": "H",
          "rank": 12
        },
        {
          "suit": "H",
          "rank": 9
        },
        {
          "suit": "H",
          "rank": 3
        }
      ],
      "lastTrickSize": 1,
      "protectedBottom": true,
      "multiplier": 1,
      "kittyPoints": 0,
      "finalScore": 75,
      "made": true,
      "shortfall": 0,
      "levelChanges": [
        {
          "seat": 1,
          "from": {
            "rank": 10,
            "cycle": 1
          },
          "to": {
            "rank": 13,
            "cycle": 1
          },
          "levels": 3
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
        "阿豪 发牌"
      ],
      "cards": [],
      "points": 0,
      "text": "阿豪发牌。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 1,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 50♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "此牌甚佳。若打 10、♠ 主，自己有 4 张普通黑桃、三张 10（其中一张是主 10），还有一个大王。♠K-A-♦10-♠10 成为大顺，可以清主，颇有把握。",
      "source": "polish",
      "original": "此牌甚佳。若打 10，♠ 主，则自己有 4 张普通黑瞳、三张 10，其中一张主 10，和一个大王。♠K-A-♦10-♠10 成为大顺，可以清主，颇有把握。",
      "why": "只改了一个错别字（黑瞳 → 黑桃）和两处标点。「三张 10」「4 张普通黑桃」都对着引擎口径核过：主级是 ♠10，♦10 与 ♥10 都是副级，四张 10 全算主牌。"
    },
    {
      "index": 2,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "牌不好，比较平均：主牌五张，缺大王和主级 ♠10，再往上叫顶不住。",
      "source": "polish",
      "original": "牌不好，较平均，缺乏硬主 A。",
      "why": "两处要改：「硬主」在全项目里统一叫「常主」；「缺乏硬主 A」读不通——小美其实有 ♣10 和 小王两张常主，缺的是大王和主级 ♠10。按她实际的手牌改成可核对的说法，请你确认是否合意。"
    },
    {
      "index": 3,
      "kind": "bid",
      "seat": 0,
      "headline": "你 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "此牌实在一般，即使叫 ♥ 也只有 7 张主。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 4,
      "kind": "bury",
      "seat": 1,
      "headline": "阿豪 埋 3 张（底分 0）",
      "tags": [
        "这 3 张结算前对闲家不可见"
      ],
      "cards": [
        "H12",
        "H9",
        "H3"
      ],
      "points": 0,
      "text": "红桃不大，且此局分牌均在顺中，优先保顺，只埋绝红桃以供杀牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 5,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♠K-♠A-♥10-♠10",
      "tags": [
        "领出 4 张顺子",
        "主牌",
        "赢墩",
        "带 30 分"
      ],
      "cards": [
        "S10",
        "H10",
        "S14",
        "S13"
      ],
      "points": 30,
      "text": "清主。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 6,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♠2 ♠6 ♠8 ♣10",
      "tags": [
        "结构性跟牌（1+1+1+1）",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "C10",
        "S8",
        "S6",
        "S2"
      ],
      "points": 10,
      "text": "留下一张小王，其他跟走。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 7,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♠3 ♠9-J-Q",
      "tags": [
        "结构性跟牌（3+1）",
        "此轮不赢"
      ],
      "cards": [
        "S12",
        "S11",
        "S9",
        "S3"
      ],
      "points": 0,
      "text": "♠9-J-Q 是顺子（10 为主牌），必须这样出。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 8,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 大王",
      "tags": [
        "领出单张",
        "主牌",
        "赢墩"
      ],
      "cards": [
        "j1"
      ],
      "points": 0,
      "text": "剩 6 张主，自己有 4 张，若外面是平均型（1+1）则成功清完。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 9,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 小王",
      "tags": [
        "同门跟 1 张",
        "此轮不赢"
      ],
      "cards": [
        "j0"
      ],
      "points": 0,
      "text": "跟了张小王。大王已经领出，这张只是白跟——不过它一落，外面就再没有王了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 10,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♠7",
      "tags": [
        "同门跟 1 张",
        "此轮不赢"
      ],
      "cards": [
        "S7"
      ],
      "points": 0,
      "text": "跟 ♠7。♠ 是本副主牌，这一张出完，自己一张主也不剩。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 11,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♣K-A",
      "tags": [
        "领出 2 张顺子",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "C14",
        "C13"
      ],
      "points": 10,
      "text": "出必大牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 12,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♣3-4",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "C4",
        "C3"
      ],
      "points": 0,
      "text": "长顺被拆，但必跟。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 13,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♣2 ♣6",
      "tags": [
        "结构性跟牌（1+1）",
        "此轮不赢"
      ],
      "cards": [
        "C6",
        "C2"
      ],
      "points": 0,
      "text": "♣ 手上三张都散着（♣2、♣6、♣Q），先出最小的两张。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 14,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♣7-8-9",
      "tags": [
        "领出 3 张顺子",
        "赢墩"
      ],
      "cards": [
        "C9",
        "C8",
        "C7"
      ],
      "points": 0,
      "text": "主清完了，开始收副牌。♣7-8-9 连着，外面已经管不上。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 15,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♣5 ♣J ♦2",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "C11",
        "C5",
        "D2"
      ],
      "points": 5,
      "text": "♣ 只剩两张，先交出去，再顺手垫一张 ♦2。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 16,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♥2 ♥J ♣Q",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "H11",
        "H2",
        "C12"
      ],
      "points": 0,
      "text": "♣ 只剩 ♣Q 一张，交出去，另外垫两张 ♥。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 17,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♦K-A",
      "tags": [
        "领出 2 张顺子",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "D14",
        "D13"
      ],
      "points": 10,
      "text": "♦K-♦A 也是大的，继续要分。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 18,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♦J-Q",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "D12",
        "D11"
      ],
      "points": 0,
      "text": "跟 ♦J-Q。管不上，但必须跟。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 19,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦6-7",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "D7",
        "D6"
      ],
      "points": 0,
      "text": "跟 ♦6-7，手里留 ♦4-5。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 20,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♦3",
      "tags": [
        "领出单张",
        "此轮不赢"
      ],
      "cards": [
        "D3"
      ],
      "points": 0,
      "text": "出 ♦3 单张，看看外面还剩什么。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 21,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♦9",
      "tags": [
        "同门跟 1 张",
        "赢墩"
      ],
      "cards": [
        "D9"
      ],
      "points": 0,
      "text": "♦9 压过 ♦3，这一墩闲家拿走了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 22,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦5",
      "tags": [
        "同门跟 1 张",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "D5"
      ],
      "points": 5,
      "text": "跟 ♦5。这 5 分记在闲家账上——两家闲家是一起算的。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 23,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♥6-7-8",
      "tags": [
        "领出 3 张顺子",
        "赢墩"
      ],
      "cards": [
        "H8",
        "H7",
        "H6"
      ],
      "points": 0,
      "text": "小美反手甩出 ♥6-7-8 三顺。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 24,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♥4-5 ♥K",
      "tags": [
        "结构性跟牌（2+1）",
        "此轮不赢",
        "带 15 分"
      ],
      "cards": [
        "H13",
        "H5",
        "H4"
      ],
      "points": 15,
      "text": "跟 ♥4-5，再搭一张 ♥K。这墩反正是队友赢，10 分顺手送给自家。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 25,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♠4-5 ♦8",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "S5",
        "S4",
        "D8"
      ],
      "points": 5,
      "text": "跟不出 ♥，只能垫三张。♠4-5 明明是主牌的两顺，可领出的是 3 张 ♥——张数对不上，一样杀不了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 26,
      "kind": "play",
      "seat": 2,
      "headline": "小美 领出 ♥A",
      "tags": [
        "领出单张",
        "此轮不赢"
      ],
      "cards": [
        "H14"
      ],
      "points": 0,
      "text": "手上最后一张，甩 ♥A。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 27,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦4",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "D4"
      ],
      "points": 0,
      "text": "垫 ♦4，这是自己最后一张牌。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 28,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♦10",
      "tags": [
        "杀牌（单张主牌）",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "D10"
      ],
      "points": 10,
      "text": "庄家最后一张是 ♦10——副级，算主牌，单张正好杀掉这轮。最后一轮归庄家，底牌那三张是 0 分，所以保底只是个名分。",
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
      "points": 40,
      "size": 4,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "S10",
            "H10",
            "S14",
            "S13"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "C10",
            "S8",
            "S6",
            "S2"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "S12",
            "S11",
            "S9",
            "S3"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 4 张",
        "主牌领出",
        "本墩 40 分"
      ],
      "note": "仅剩 18-12=6 张主，庄家获得主动权",
      "lines": [
        {
          "index": 5,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♠K-♠A-♥10-♠10",
          "tags": [
            "领出 4 张顺子",
            "主牌",
            "赢墩",
            "带 30 分"
          ],
          "cards": [
            "S10",
            "H10",
            "S14",
            "S13"
          ],
          "points": 30,
          "text": "清主。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 6,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♠2 ♠6 ♠8 ♣10",
          "tags": [
            "结构性跟牌（1+1+1+1）",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "C10",
            "S8",
            "S6",
            "S2"
          ],
          "points": 10,
          "text": "留下一张小王，其他跟走。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 7,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♠3 ♠9-J-Q",
          "tags": [
            "结构性跟牌（3+1）",
            "此轮不赢"
          ],
          "cards": [
            "S12",
            "S11",
            "S9",
            "S3"
          ],
          "points": 0,
          "text": "♠9-J-Q 是顺子（10 为主牌），必须这样出。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 1,
      "leaderSeat": 1,
      "winnerSeat": 1,
      "points": 0,
      "size": 1,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "j1"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "j0"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "S7"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 1 张",
        "主牌领出"
      ],
      "note": "庄家很幸运，成功清完主牌。",
      "lines": [
        {
          "index": 8,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 大王",
          "tags": [
            "领出单张",
            "主牌",
            "赢墩"
          ],
          "cards": [
            "j1"
          ],
          "points": 0,
          "text": "剩 6 张主，自己有 4 张，若外面是平均型（1+1）则成功清完。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 9,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 小王",
          "tags": [
            "同门跟 1 张",
            "此轮不赢"
          ],
          "cards": [
            "j0"
          ],
          "points": 0,
          "text": "跟了张小王。大王已经领出，这张只是白跟——不过它一落，外面就再没有王了。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 10,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♠7",
          "tags": [
            "同门跟 1 张",
            "此轮不赢"
          ],
          "cards": [
            "S7"
          ],
          "points": 0,
          "text": "跟 ♠7。♠ 是本副主牌，这一张出完，自己一张主也不剩。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 2,
      "leaderSeat": 1,
      "winnerSeat": 1,
      "points": 10,
      "size": 2,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "C14",
            "C13"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "C4",
            "C3"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "C6",
            "C2"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 2 张",
        "本墩 10 分"
      ],
      "note": "清主之后开始收分：♣K-♣A 连着又是一手大的，10 分收进来。小美被迫拆掉 ♣3-4-5 那条三顺，你手上则只剩 ♣Q 一张 ♣。",
      "lines": [
        {
          "index": 11,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♣K-A",
          "tags": [
            "领出 2 张顺子",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "C14",
            "C13"
          ],
          "points": 10,
          "text": "出必大牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 12,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♣3-4",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "C4",
            "C3"
          ],
          "points": 0,
          "text": "长顺被拆，但必跟。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 13,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♣2 ♣6",
          "tags": [
            "结构性跟牌（1+1）",
            "此轮不赢"
          ],
          "cards": [
            "C6",
            "C2"
          ],
          "points": 0,
          "text": "♣ 手上三张都散着（♣2、♣6、♣Q），先出最小的两张。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 3,
      "leaderSeat": 1,
      "winnerSeat": 1,
      "points": 5,
      "size": 3,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "C9",
            "C8",
            "C7"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "C11",
            "C5",
            "D2"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "H11",
            "H2",
            "C12"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 3 张",
        "本墩 5 分"
      ],
      "note": "♣7-8-9 再收 5 分。这一轮之后庄家手上只剩 7 张牌，其中 3 张主。",
      "lines": [
        {
          "index": 14,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♣7-8-9",
          "tags": [
            "领出 3 张顺子",
            "赢墩"
          ],
          "cards": [
            "C9",
            "C8",
            "C7"
          ],
          "points": 0,
          "text": "主清完了，开始收副牌。♣7-8-9 连着，外面已经管不上。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 15,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♣5 ♣J ♦2",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "C11",
            "C5",
            "D2"
          ],
          "points": 5,
          "text": "♣ 只剩两张，先交出去，再顺手垫一张 ♦2。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 16,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♥2 ♥J ♣Q",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "H11",
            "H2",
            "C12"
          ],
          "points": 0,
          "text": "♣ 只剩 ♣Q 一张，交出去，另外垫两张 ♥。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 4,
      "leaderSeat": 1,
      "winnerSeat": 1,
      "points": 10,
      "size": 2,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "D14",
            "D13"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "D12",
            "D11"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D7",
            "D6"
          ]
        }
      ],
      "headline": "阿豪 领出 · 阿豪 赢墩",
      "tags": [
        "每家 2 张",
        "本墩 10 分"
      ],
      "note": "♦K-♦A 又来 10 分。到这儿庄家的分已经 65 了。",
      "lines": [
        {
          "index": 17,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♦K-A",
          "tags": [
            "领出 2 张顺子",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "D14",
            "D13"
          ],
          "points": 10,
          "text": "♦K-♦A 也是大的，继续要分。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 18,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♦J-Q",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "D12",
            "D11"
          ],
          "points": 0,
          "text": "跟 ♦J-Q。管不上，但必须跟。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 19,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦6-7",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "D7",
            "D6"
          ],
          "points": 0,
          "text": "跟 ♦6-7，手里留 ♦4-5。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 5,
      "leaderSeat": 1,
      "winnerSeat": 2,
      "points": 5,
      "size": 1,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "D3"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "D9"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D5"
          ]
        }
      ],
      "headline": "阿豪 领出 · 小美 赢墩",
      "tags": [
        "每家 1 张",
        "本墩 5 分"
      ],
      "note": "庄家出 ♦3 想接着收，被小美的 ♦9 压住——这是闲家拿下的第一墩，5 分。",
      "lines": [
        {
          "index": 20,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♦3",
          "tags": [
            "领出单张",
            "此轮不赢"
          ],
          "cards": [
            "D3"
          ],
          "points": 0,
          "text": "出 ♦3 单张，看看外面还剩什么。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 21,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♦9",
          "tags": [
            "同门跟 1 张",
            "赢墩"
          ],
          "cards": [
            "D9"
          ],
          "points": 0,
          "text": "♦9 压过 ♦3，这一墩闲家拿走了。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 22,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦5",
          "tags": [
            "同门跟 1 张",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "D5"
          ],
          "points": 5,
          "text": "跟 ♦5。这 5 分记在闲家账上——两家闲家是一起算的。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 6,
      "leaderSeat": 2,
      "winnerSeat": 2,
      "points": 20,
      "size": 3,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "H8",
            "H7",
            "H6"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "H13",
            "H5",
            "H4"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "S5",
            "S4",
            "D8"
          ]
        }
      ],
      "headline": "小美 领出 · 小美 赢墩",
      "tags": [
        "每家 3 张",
        "本墩 20 分"
      ],
      "note": "小美顺势再甩 ♥6-7-8 三顺，你搭上 ♥4-5 和 ♥K，阿豪垫的 ♠5 也带 5 分：20 分全归闲家。",
      "lines": [
        {
          "index": 23,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♥6-7-8",
          "tags": [
            "领出 3 张顺子",
            "赢墩"
          ],
          "cards": [
            "H8",
            "H7",
            "H6"
          ],
          "points": 0,
          "text": "小美反手甩出 ♥6-7-8 三顺。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 24,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♥4-5 ♥K",
          "tags": [
            "结构性跟牌（2+1）",
            "此轮不赢",
            "带 15 分"
          ],
          "cards": [
            "H13",
            "H5",
            "H4"
          ],
          "points": 15,
          "text": "跟 ♥4-5，再搭一张 ♥K。这墩反正是队友赢，10 分顺手送给自家。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 25,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♠4-5 ♦8",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "S5",
            "S4",
            "D8"
          ],
          "points": 5,
          "text": "跟不出 ♥，只能垫三张。♠4-5 明明是主牌的两顺，可领出的是 3 张 ♥——张数对不上，一样杀不了。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 7,
      "leaderSeat": 2,
      "winnerSeat": 1,
      "points": 10,
      "size": 1,
      "plays": [
        {
          "seat": 2,
          "cards": [
            "H14"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D4"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "D10"
          ]
        }
      ],
      "headline": "小美 领出 · 阿豪 赢墩",
      "tags": [
        "每家 1 张",
        "有杀牌",
        "本墩 10 分"
      ],
      "note": "最后一轮。小美甩出 ♥A，庄家用最后一张 ♦10（副级，算主牌）单张杀掉，10 分拿回来。底牌三张是 0 分，所以这一轮赢下来也只是走个形式——保底 +0。",
      "lines": [
        {
          "index": 26,
          "kind": "play",
          "seat": 2,
          "headline": "小美 领出 ♥A",
          "tags": [
            "领出单张",
            "此轮不赢"
          ],
          "cards": [
            "H14"
          ],
          "points": 0,
          "text": "手上最后一张，甩 ♥A。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 27,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦4",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "D4"
          ],
          "points": 0,
          "text": "垫 ♦4，这是自己最后一张牌。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 28,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♦10",
          "tags": [
            "杀牌（单张主牌）",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "D10"
          ],
          "points": 10,
          "text": "庄家最后一张是 ♦10——副级，算主牌，单张正好杀掉这轮。最后一轮归庄家，底牌那三张是 0 分，所以保底只是个名分。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    }
  ],
  "counts": {
    "total": 29,
    "author": 8,
    "polish": 2,
    "fill": 19,
    "blank": 0,
    "blankIndexes": []
  }
};
