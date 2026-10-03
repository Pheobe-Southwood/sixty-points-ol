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
  "slug": "222",
  "title": "开局随机 222",
  "names": [
    "你",
    "阿豪",
    "小美"
  ],
  "spec": {
    "seed": "1f3l99j",
    "dealerSeat": 1,
    "levels": [
      {
        "rank": 2,
        "cycle": 0
      },
      {
        "rank": 2,
        "cycle": 0
      },
      {
        "rank": 2,
        "cycle": 0
      }
    ]
  },
  "intro": "这一副三家牌都不错：阿豪 ♣ 五张、小美 ♥ 六张、你 ♠ 六张加 ♦2 和大王。叫牌三方各报家门，从 40 一路咬到 65，最后你 65♠ 坐庄。前面三墩打得顺，50 分很快到手；坏在后面——最后一轮被抠底，25 分收场。",
  "outro": "教训在埋底。你埋进去 ♥5-6 和 ♣10，一共 15 分，是指望保底的；结果最后一轮被闲家拿走，15 分乘 2 倍倒扣回去，55 分变成 25 分，差 40 分，两家闲家各升 4 级。\n65 这个叫分也是一半的原因：叫多高都不多拿级数，可一旦打输，欠多少分就按多少分给对手升。埋分和叫高是两个独立的风险，这副牌正好两个都占了。",
  "deal": {
    "hands": [
      [
        "H5",
        "S6",
        "D13",
        "C10",
        "S4",
        "D10",
        "D11",
        "S11",
        "D2",
        "H6",
        "D12",
        "S3",
        "C7",
        "S12",
        "j1",
        "S13",
        "D7"
      ],
      [
        "D4",
        "H4",
        "C13",
        "S10",
        "H11",
        "D5",
        "j0",
        "S7",
        "H8",
        "C5",
        "C6",
        "C9",
        "D3",
        "S14",
        "H2",
        "H12",
        "C14"
      ],
      [
        "H9",
        "S8",
        "C12",
        "H10",
        "S2",
        "C4",
        "D8",
        "H7",
        "S5",
        "D9",
        "D14",
        "C3",
        "H14",
        "H3",
        "C11",
        "S9",
        "H13"
      ]
    ],
    "originalKitty": [
      "C2",
      "D6",
      "C8"
    ],
    "kitty": [
      "H6",
      "H5",
      "C10"
    ],
    "trump": {
      "strain": "S",
      "rank": 2
    },
    "contract": {
      "points": 65,
      "strain": "S",
      "declarerSeat": 0
    },
    "summary": {
      "dealNo": 1,
      "contract": {
        "points": 65,
        "strain": "S",
        "declarerSeat": 0
      },
      "trump": {
        "strain": "S",
        "rank": 2
      },
      "declarerTrickPoints": 55,
      "defenderTrickPoints": 30,
      "originalKitty": [
        {
          "suit": "C",
          "rank": 2
        },
        {
          "suit": "D",
          "rank": 6
        },
        {
          "suit": "C",
          "rank": 8
        }
      ],
      "kitty": [
        {
          "suit": "H",
          "rank": 6
        },
        {
          "suit": "H",
          "rank": 5
        },
        {
          "suit": "C",
          "rank": 10
        }
      ],
      "lastTrickSize": 2,
      "protectedBottom": false,
      "multiplier": 2,
      "kittyPoints": 15,
      "finalScore": 25,
      "made": false,
      "shortfall": 40,
      "levelChanges": [
        {
          "seat": 1,
          "from": {
            "rank": 2,
            "cycle": 0
          },
          "to": {
            "rank": 6,
            "cycle": 0
          },
          "levels": 4
        },
        {
          "seat": 2,
          "from": {
            "rank": 2,
            "cycle": 0
          },
          "to": {
            "rank": 6,
            "cycle": 0
          },
          "levels": 4
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
      "text": "阿豪发牌。三家这手牌都不弱，叫牌有的争。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 1,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 40♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♣ 较多（5 张），加上 ♥2、小王共 7 张主，超过平均数。♣K-♣A-♥2 是长顺，由于小王存在不可能被管上",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 2,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 40♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♥ 好（6 张），♥K-♥A-♠2 成顺。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 3,
      "kind": "bid",
      "seat": 0,
      "headline": "你 40♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♠ 好（6 张），加上 ♦2、大王共 8 张主，超过平均数 6 张，且 ♠J-Q-K 较大。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 4,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 45♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "继续加。♣ 五张是他最长的一门，真按 ♣ 打，加上 ♥2、小王就是七张主。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 5,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 45♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♥ 六张，K-A 连着 ♠2 也是一条顺，她也跟。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 6,
      "kind": "bid",
      "seat": 0,
      "headline": "你 45♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♠ 六张加 ♦2、大王，八张主，比平均数多，跟上。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 7,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 50♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "50 了，谁也不肯先下来。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 8,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 50♥",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♥ 那边也够撑，继续跟。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 9,
      "kind": "bid",
      "seat": 0,
      "headline": "你 50♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♠ 是四门里最高的花色，同分就能压住他——这就是他只能往上抬价的原因。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 10,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 55♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "55。他 ♣K-♣A-♥2 那条长顺还没舍得放。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 11,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "缺少常主：手里只有一张 ♠2，没有王，再往上较难。",
      "source": "polish",
      "original": "缺失硬主，仅一张副 2，无主 2、王，再往上较难。",
      "why": "两处对不上：一是「硬主」在全项目里统一叫「常主」（双王 + 主级 + 副级）；二是「仅一张副 2、无主 2」自相矛盾——小美手上唯一的一张 2 是 ♠2，而本副主牌是 ♠，所以它是**主级**（不是副级），「无主 2」不成立。改成不会引起误解的说法。"
    },
    {
      "index": 12,
      "kind": "bid",
      "seat": 0,
      "headline": "你 55♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "跟上。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 13,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 60♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "60。两边都在赌对方先撒手。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 14,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "继续不叫。她的 ♥ 报到 50 就收手了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 15,
      "kind": "bid",
      "seat": 0,
      "headline": "你 60♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♦ 副牌兼好，硬实力充足",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 16,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 65♣",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "试探性阻击叫，认为对手可能接着加，但自己已经较悬。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 17,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "还是不叫，就看这两家谁先松口。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 18,
      "kind": "bid",
      "seat": 0,
      "headline": "你 65♠",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "♣ 少，坚决继续。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 19,
      "kind": "bid",
      "seat": 1,
      "headline": "阿豪 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "不愿意再冒 70 的风险。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 20,
      "kind": "bid",
      "seat": 2,
      "headline": "小美 不叫",
      "tags": [],
      "cards": [],
      "points": 0,
      "text": "结束，开始打牌",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 21,
      "kind": "bury",
      "seat": 0,
      "headline": "你 埋 3 张（底分 15）",
      "tags": [
        "这 3 张结算前对闲家不可见"
      ],
      "cards": [
        "H6",
        "H5",
        "C10"
      ],
      "points": 15,
      "text": "预计能保底，且有长顺。埋分，埋绝 ♥ 以供杀牌，♣ 剩余一顺，打出即可空出杀牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 22,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 ♠J-Q-K",
      "tags": [
        "领出 3 张顺子",
        "主牌",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "S13",
        "S12",
        "S11"
      ],
      "points": 10,
      "text": "试图清主",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 23,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♠7 ♠A-♥2",
      "tags": [
        "结构性跟牌（2+1）",
        "此轮不赢"
      ],
      "cards": [
        "H2",
        "S14",
        "S7"
      ],
      "points": 0,
      "text": "♠A-♥2 是顺子必出，再贴一张小牌",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 24,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♠5 ♠8-9",
      "tags": [
        "结构性跟牌（2+1）",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "S9",
        "S8",
        "S5"
      ],
      "points": 5,
      "text": "♠8-9 必出，在 5 和主 2 之间选择舍弃 5 分保大牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 25,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 大王",
      "tags": [
        "领出单张",
        "主牌",
        "赢墩"
      ],
      "cards": [
        "j1"
      ],
      "points": 0,
      "text": "剩余 9 张主牌，自己有 5 张，外面只有 4 张。先试探。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 26,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♠10",
      "tags": [
        "同门跟 1 张",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "S10"
      ],
      "points": 10,
      "text": "小王后续可能大，只能先弃分。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 27,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♠2",
      "tags": [
        "同门跟 1 张",
        "此轮不赢"
      ],
      "cards": [
        "S2"
      ],
      "points": 0,
      "text": "唯一一张牌了。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 28,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 ♦10-J-Q-K",
      "tags": [
        "领出 4 张顺子",
        "赢墩",
        "带 20 分"
      ],
      "cards": [
        "D13",
        "D12",
        "D11",
        "D10"
      ],
      "points": 20,
      "text": "出必大牌，要分。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 29,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♣9 ♦3-4-5",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "C9",
        "D5",
        "D4",
        "D3"
      ],
      "points": 5,
      "text": "♦ 三张必出，再垫一张无关紧要的牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 30,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♥3 ♦8-9 ♦A",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "H3",
        "D14",
        "D9",
        "D8"
      ],
      "points": 0,
      "text": "♦ 三张必出，再垫一张无关紧要的牌",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 31,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 ♣7-8",
      "tags": [
        "领出 2 张顺子",
        "此轮不赢"
      ],
      "cards": [
        "C8",
        "C7"
      ],
      "points": 0,
      "text": "♣ 虽然有较大的失牌权风险，但是必须打出，否则最后被抠底，或再盘末陷入被动。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 32,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♣K-A",
      "tags": [
        "同门跟 2 张",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "C14",
        "C13"
      ],
      "points": 10,
      "text": "管上",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 33,
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
      "text": "跟小牌",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 34,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♣5-6",
      "tags": [
        "领出 2 张顺子",
        "此轮不赢",
        "带 5 分"
      ],
      "cards": [
        "C6",
        "C5"
      ],
      "points": 5,
      "text": "继续发起攻势",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 35,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♣J-Q",
      "tags": [
        "同门跟 2 张",
        "此轮不赢"
      ],
      "cards": [
        "C12",
        "C11"
      ],
      "points": 0,
      "text": "跟 ♣J-Q，♣ 就清空了；手里的 ♥10 还留着。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 36,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♠3-4",
      "tags": [
        "杀牌（2 张主牌相连）",
        "赢墩"
      ],
      "cards": [
        "S4",
        "S3"
      ],
      "points": 0,
      "text": "杀牌，制止",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 37,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 ♦6-7",
      "tags": [
        "领出 2 张顺子",
        "赢墩"
      ],
      "cards": [
        "D7",
        "D6"
      ],
      "points": 0,
      "text": "外面还有小王未下，自己主牌顺子用完，吊主必然陷入被动。不如出他人必小的牌，让他人在垫牌中被动。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 38,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 ♥4 ♥8",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "H8",
        "H4"
      ],
      "points": 0,
      "text": "跟不出 ♦，垫两张 ♥。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 39,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♥7 ♥9",
      "tags": [
        "垫牌",
        "此轮不赢"
      ],
      "cards": [
        "H9",
        "H7"
      ],
      "points": 0,
      "text": "同样没 ♦ 了，也跟着垫 ♥。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 40,
      "kind": "play",
      "seat": 0,
      "headline": "你 领出 ♠6",
      "tags": [
        "领出单张",
        "主牌",
        "此轮不赢"
      ],
      "cards": [
        "S6"
      ],
      "points": 0,
      "text": "手上只剩 ♠6 和两张 2，先甩 ♠6 探一探——外面还有一张小王没下来。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 41,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 跟出 小王",
      "tags": [
        "同门跟 1 张",
        "赢墩"
      ],
      "cards": [
        "j0"
      ],
      "points": 0,
      "text": "小王压下来，阿豪拿下这墩，也拿到了出牌权。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 42,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♥10",
      "tags": [
        "垫牌",
        "此轮不赢",
        "带 10 分"
      ],
      "cards": [
        "H10"
      ],
      "points": 10,
      "text": "队友大，垫分",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 43,
      "kind": "play",
      "seat": 1,
      "headline": "阿豪 领出 ♥J-Q",
      "tags": [
        "领出 2 张顺子",
        "此轮不赢"
      ],
      "cards": [
        "H12",
        "H11"
      ],
      "points": 0,
      "text": "漂亮的攻势！最后一轮出顺子，瞄准底牌。",
      "source": "author",
      "original": null,
      "why": null
    },
    {
      "index": 44,
      "kind": "play",
      "seat": 2,
      "headline": "小美 跟出 ♥K-A",
      "tags": [
        "同门跟 2 张",
        "赢墩",
        "带 10 分"
      ],
      "cards": [
        "H14",
        "H13"
      ],
      "points": 10,
      "text": "小美 ♥K-A 盖过队友的 ♥J-Q。最后一轮闲家里谁大都一样——这一手拿住，底牌就归闲家了。",
      "source": "fill",
      "original": null,
      "why": null
    },
    {
      "index": 45,
      "kind": "play",
      "seat": 0,
      "headline": "你 跟出 ♦2 ♣2",
      "tags": [
        "主牌跟牌不成顺（1+1），不能赢",
        "此轮不赢"
      ],
      "cards": [
        "D2",
        "C2"
      ],
      "points": 0,
      "text": "很遗憾，这不是顺子，最终没能把握好，被抠底。最终只获得 25 分，闲家升 4 级。",
      "source": "author",
      "original": null,
      "why": null
    }
  ],
  "tricks": [
    {
      "ordinal": 0,
      "leaderSeat": 0,
      "winnerSeat": 0,
      "points": 15,
      "size": 3,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "S13",
            "S12",
            "S11"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "H2",
            "S14",
            "S7"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "S9",
            "S8",
            "S5"
          ]
        }
      ],
      "headline": "你 领出 · 你 赢墩",
      "tags": [
        "每家 3 张",
        "主牌领出",
        "本墩 15 分"
      ],
      "note": "至此，剩余 18-3*3=9 张主牌。",
      "lines": [
        {
          "index": 22,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 ♠J-Q-K",
          "tags": [
            "领出 3 张顺子",
            "主牌",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "S13",
            "S12",
            "S11"
          ],
          "points": 10,
          "text": "试图清主",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 23,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♠7 ♠A-♥2",
          "tags": [
            "结构性跟牌（2+1）",
            "此轮不赢"
          ],
          "cards": [
            "H2",
            "S14",
            "S7"
          ],
          "points": 0,
          "text": "♠A-♥2 是顺子必出，再贴一张小牌",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 24,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♠5 ♠8-9",
          "tags": [
            "结构性跟牌（2+1）",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "S9",
            "S8",
            "S5"
          ],
          "points": 5,
          "text": "♠8-9 必出，在 5 和主 2 之间选择舍弃 5 分保大牌。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 1,
      "leaderSeat": 0,
      "winnerSeat": 0,
      "points": 10,
      "size": 1,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "j1"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "S10"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "S2"
          ]
        }
      ],
      "headline": "你 领出 · 你 赢墩",
      "tags": [
        "每家 1 张",
        "主牌领出",
        "本墩 10 分"
      ],
      "note": "大王逼下 10 分，全盘只剩 6 张主牌。",
      "lines": [
        {
          "index": 25,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 大王",
          "tags": [
            "领出单张",
            "主牌",
            "赢墩"
          ],
          "cards": [
            "j1"
          ],
          "points": 0,
          "text": "剩余 9 张主牌，自己有 5 张，外面只有 4 张。先试探。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 26,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♠10",
          "tags": [
            "同门跟 1 张",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "S10"
          ],
          "points": 10,
          "text": "小王后续可能大，只能先弃分。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 27,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♠2",
          "tags": [
            "同门跟 1 张",
            "此轮不赢"
          ],
          "cards": [
            "S2"
          ],
          "points": 0,
          "text": "唯一一张牌了。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 2,
      "leaderSeat": 0,
      "winnerSeat": 0,
      "points": 25,
      "size": 4,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "D13",
            "D12",
            "D11",
            "D10"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "C9",
            "D5",
            "D4",
            "D3"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "H3",
            "D14",
            "D9",
            "D8"
          ]
        }
      ],
      "headline": "你 领出 · 你 赢墩",
      "tags": [
        "每家 4 张",
        "本墩 25 分"
      ],
      "note": "庄家已经得到了 50 分。",
      "lines": [
        {
          "index": 28,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 ♦10-J-Q-K",
          "tags": [
            "领出 4 张顺子",
            "赢墩",
            "带 20 分"
          ],
          "cards": [
            "D13",
            "D12",
            "D11",
            "D10"
          ],
          "points": 20,
          "text": "出必大牌，要分。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 29,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♣9 ♦3-4-5",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "C9",
            "D5",
            "D4",
            "D3"
          ],
          "points": 5,
          "text": "♦ 三张必出，再垫一张无关紧要的牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 30,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♥3 ♦8-9 ♦A",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "H3",
            "D14",
            "D9",
            "D8"
          ],
          "points": 0,
          "text": "♦ 三张必出，再垫一张无关紧要的牌",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 3,
      "leaderSeat": 0,
      "winnerSeat": 1,
      "points": 10,
      "size": 2,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "C8",
            "C7"
          ]
        },
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
        }
      ],
      "headline": "你 领出 · 阿豪 赢墩",
      "tags": [
        "每家 2 张",
        "本墩 10 分"
      ],
      "note": "阿豪用 ♣K-A 管上庄家的 ♣7-8，10 分倒手给了闲家。庄家本想从 ♣ 里抠分，反被将了一军。",
      "lines": [
        {
          "index": 31,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 ♣7-8",
          "tags": [
            "领出 2 张顺子",
            "此轮不赢"
          ],
          "cards": [
            "C8",
            "C7"
          ],
          "points": 0,
          "text": "♣ 虽然有较大的失牌权风险，但是必须打出，否则最后被抠底，或再盘末陷入被动。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 32,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♣K-A",
          "tags": [
            "同门跟 2 张",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "C14",
            "C13"
          ],
          "points": 10,
          "text": "管上",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 33,
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
          "text": "跟小牌",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 4,
      "leaderSeat": 1,
      "winnerSeat": 0,
      "points": 5,
      "size": 2,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "C6",
            "C5"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "C12",
            "C11"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "S4",
            "S3"
          ]
        }
      ],
      "headline": "阿豪 领出 · 你 赢墩",
      "tags": [
        "每家 2 张",
        "有杀牌",
        "本墩 5 分"
      ],
      "note": "阿豪继续出 ♣5-6，这次庄家用 ♠3-4 杀牌拿回来，5 分到手。这一墩之后庄家手上还剩 5 张牌，其中主牌 3 张。",
      "lines": [
        {
          "index": 34,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♣5-6",
          "tags": [
            "领出 2 张顺子",
            "此轮不赢",
            "带 5 分"
          ],
          "cards": [
            "C6",
            "C5"
          ],
          "points": 5,
          "text": "继续发起攻势",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 35,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♣J-Q",
          "tags": [
            "同门跟 2 张",
            "此轮不赢"
          ],
          "cards": [
            "C12",
            "C11"
          ],
          "points": 0,
          "text": "跟 ♣J-Q，♣ 就清空了；手里的 ♥10 还留着。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 36,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♠3-4",
          "tags": [
            "杀牌（2 张主牌相连）",
            "赢墩"
          ],
          "cards": [
            "S4",
            "S3"
          ],
          "points": 0,
          "text": "杀牌，制止",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 5,
      "leaderSeat": 0,
      "winnerSeat": 0,
      "points": 0,
      "size": 2,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "D7",
            "D6"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "H8",
            "H4"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "H9",
            "H7"
          ]
        }
      ],
      "headline": "你 领出 · 你 赢墩",
      "tags": [
        "每家 2 张"
      ],
      "note": "庄家改出 ♦6-7，两家都跟不出 ♦，只能垫 ♥。这墩 0 分，但出牌权还在庄家手里。",
      "lines": [
        {
          "index": 37,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 ♦6-7",
          "tags": [
            "领出 2 张顺子",
            "赢墩"
          ],
          "cards": [
            "D7",
            "D6"
          ],
          "points": 0,
          "text": "外面还有小王未下，自己主牌顺子用完，吊主必然陷入被动。不如出他人必小的牌，让他人在垫牌中被动。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 38,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 ♥4 ♥8",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "H8",
            "H4"
          ],
          "points": 0,
          "text": "跟不出 ♦，垫两张 ♥。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 39,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♥7 ♥9",
          "tags": [
            "垫牌",
            "此轮不赢"
          ],
          "cards": [
            "H9",
            "H7"
          ],
          "points": 0,
          "text": "同样没 ♦ 了，也跟着垫 ♥。",
          "source": "fill",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 6,
      "leaderSeat": 0,
      "winnerSeat": 1,
      "points": 10,
      "size": 1,
      "plays": [
        {
          "seat": 0,
          "cards": [
            "S6"
          ]
        },
        {
          "seat": 1,
          "cards": [
            "j0"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "H10"
          ]
        }
      ],
      "headline": "你 领出 · 阿豪 赢墩",
      "tags": [
        "每家 1 张",
        "主牌领出",
        "本墩 10 分"
      ],
      "note": "庄家出 ♠6 试探，外面的最后一张王——小王——压了下来。小美顺手把 ♥10 垫给队友：闲家又 10 分，出牌权也转到阿豪手上。",
      "lines": [
        {
          "index": 40,
          "kind": "play",
          "seat": 0,
          "headline": "你 领出 ♠6",
          "tags": [
            "领出单张",
            "主牌",
            "此轮不赢"
          ],
          "cards": [
            "S6"
          ],
          "points": 0,
          "text": "手上只剩 ♠6 和两张 2，先甩 ♠6 探一探——外面还有一张小王没下来。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 41,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 跟出 小王",
          "tags": [
            "同门跟 1 张",
            "赢墩"
          ],
          "cards": [
            "j0"
          ],
          "points": 0,
          "text": "小王压下来，阿豪拿下这墩，也拿到了出牌权。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 42,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♥10",
          "tags": [
            "垫牌",
            "此轮不赢",
            "带 10 分"
          ],
          "cards": [
            "H10"
          ],
          "points": 10,
          "text": "队友大，垫分",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    },
    {
      "ordinal": 7,
      "leaderSeat": 1,
      "winnerSeat": 2,
      "points": 10,
      "size": 2,
      "plays": [
        {
          "seat": 1,
          "cards": [
            "H12",
            "H11"
          ]
        },
        {
          "seat": 2,
          "cards": [
            "H14",
            "H13"
          ]
        },
        {
          "seat": 0,
          "cards": [
            "D2",
            "C2"
          ]
        }
      ],
      "headline": "阿豪 领出 · 小美 赢墩",
      "tags": [
        "每家 2 张",
        "有杀牌",
        "本墩 10 分"
      ],
      "note": "埋分有风险，叫牌需谨慎",
      "lines": [
        {
          "index": 43,
          "kind": "play",
          "seat": 1,
          "headline": "阿豪 领出 ♥J-Q",
          "tags": [
            "领出 2 张顺子",
            "此轮不赢"
          ],
          "cards": [
            "H12",
            "H11"
          ],
          "points": 0,
          "text": "漂亮的攻势！最后一轮出顺子，瞄准底牌。",
          "source": "author",
          "original": null,
          "why": null
        },
        {
          "index": 44,
          "kind": "play",
          "seat": 2,
          "headline": "小美 跟出 ♥K-A",
          "tags": [
            "同门跟 2 张",
            "赢墩",
            "带 10 分"
          ],
          "cards": [
            "H14",
            "H13"
          ],
          "points": 10,
          "text": "小美 ♥K-A 盖过队友的 ♥J-Q。最后一轮闲家里谁大都一样——这一手拿住，底牌就归闲家了。",
          "source": "fill",
          "original": null,
          "why": null
        },
        {
          "index": 45,
          "kind": "play",
          "seat": 0,
          "headline": "你 跟出 ♦2 ♣2",
          "tags": [
            "主牌跟牌不成顺（1+1），不能赢",
            "此轮不赢"
          ],
          "cards": [
            "D2",
            "C2"
          ],
          "points": 0,
          "text": "很遗憾，这不是顺子，最终没能把握好，被抠底。最终只获得 25 分，闲家升 4 级。",
          "source": "author",
          "original": null,
          "why": null
        }
      ]
    }
  ],
  "counts": {
    "total": 46,
    "author": 27,
    "polish": 1,
    "fill": 18,
    "blank": 0,
    "blankIndexes": []
  }
};
