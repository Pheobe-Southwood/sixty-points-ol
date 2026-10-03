<script lang="ts">
  import {
    cardClass,
    cardKey,
    cardsPoints,
    levelFromProgress,
    levelProgress,
    type BidCall,
    type TrumpModel
  } from '@sixty/engine';
  import CardView from '$lib/components/Card.svelte';
  import CardRow from '$lib/components/CardRow.svelte';
  import HandFan from '$lib/components/HandFan.svelte';
  import LevelBadge from '$lib/components/LevelBadge.svelte';
  import TrickCluster from '$lib/components/TrickCluster.svelte';
  import TryPlay from '$lib/components/TryPlay.svelte';
  import { strainGlyph, trumpText } from '$lib/labels';
  import { settlePreview } from '$lib/settle';
  import {
    AUCTION_INTENTS,
    BURY_HAND,
    DEFENDER_STEPS,
    DEMO_AUCTION,
    DEMO_KITTY,
    DEMO_SETTLE_INPUT,
    KITTY_EQUATION,
    LEVEL_DEMO,
    LEVEL_STEPS,
    MULTIPLIER_ROWS,
    OFF_RANK_EQUALS,
    POINT_CARDS,
    POINT_ROWS,
    RUFF_LEAD,
    RUFF_WINNER,
    RUN_NOT_ADJACENT,
    RUN_SKIPS_LEVEL,
    TRUMP_DEMO_CARDS,
    TRUMP_HEARTS,
    TRUMP_LADDER,
    TRUMP_NT,
    TRUMP_RUN,
    TRY_FOLLOW,
    TRY_LEAD,
    TRY_RUFF,
    TUTORIAL_NAMES,
    UPGRADE_ROWS
  } from '$lib/tutorial/scenarios';

  const TOC: readonly { readonly id: string; readonly label: string }[] = [
    { id: 'start', label: '流程' },
    { id: 'basics', label: '牌与分值' },
    { id: 'trump', label: '级牌与主牌' },
    { id: 'auction', label: '叫牌' },
    { id: 'bury', label: '埋底' },
    { id: 'play', label: '打牌' },
    { id: 'inference', label: '打牌推论' },
    { id: 'scoring', label: '结算' },
    { id: 'levels', label: '升级与赛程' }
  ];

  const section = 'scroll-mt-4 rounded-2xl bg-black/25 p-4 ring-1 ring-white/10 sm:p-5';
  const heading = 'text-base font-bold text-ivory';
  const body = 'mt-2 space-y-2 text-xs leading-relaxed text-white/65';
  const chip = 'rounded-md bg-white/10 px-2 py-1';
  /** 每个静态示例块顶部的将牌环境说明 */
  const env = 'mb-2 text-[11px] text-gold/70';

  function callLabel(call: BidCall): string {
    return call === 'pass' ? '不叫' : `${call.points}${strainGlyph(call.strain)}`;
  }

  const kittyPoints = cardsPoints(DEMO_KITTY);

  /** 同一组牌在不同将牌下主牌张数不同：这就是「将牌决定主牌」的直观演示 */
  const trumpCount = (trump: TrumpModel): number =>
    TRUMP_DEMO_CARDS.filter((card) => cardClass(card, trump) === 'T').length;

  const followLead = TRY_FOLLOW.lead ?? [];
  const followAnswer = TRY_FOLLOW.hand.slice(0, 4);

  /** 闲家门槛：由底牌分与末轮张数算出，页面不手写数字 */
  const settle = settlePreview(DEMO_SETTLE_INPUT);

  /** 升级步进：用引擎自己的换算函数算目标级别，避免教程另写一套算术 */
  const steps = LEVEL_STEPS.map((step) => ({
    ...step,
    to: levelFromProgress(levelProgress(step.from) + step.levels)
  }));
</script>

<main class="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6">
  <header>
    <a class="text-xs text-white/50 hover:text-white" href="/">← 大厅</a>
    <h1 class="mt-2 text-2xl font-black tracking-wide text-ivory">新手教程</h1>
    <p class="mt-1.5 text-xs leading-relaxed text-white/55">
      用真实牌面走一遍从叫牌到结算的全过程，每一步都带练手题与打牌推论。示例统一按「本副级牌 = 5」讲解；
      规则里出现的每个数字都由规则引擎在测试里核对过，不会和牌桌上跑的不一样。
    </p>
  </header>

  <nav class="flex flex-wrap gap-1.5 text-[11px]">
    {#each TOC as item (item.id)}
      <a class="rounded-full bg-black/30 px-3 py-1 text-white/65 ring-1 ring-white/10 hover:bg-black/50" href={`#${item.id}`}
        >{item.label}</a
      >
    {/each}
  </nav>

  <section id="start" class={section}>
    <h2 class={heading}>1. 目标与流程</h2>
    <div class={body}>
      <p>
        三个人打一副牌：<b class="text-ivory">叫到牌的人单独一家（庄家）</b>，另外两家（闲家）是一队。庄家要抓够自己叫的分数才算赢下这一副。
      </p>
      <p>一副 54 张：每人 17 张，剩 3 张扣成暗底。四步走完一副：</p>
      <ol class="ml-4 list-decimal space-y-1">
        <li><b class="text-ivory">叫牌</b>：从 40 分起叫，叫得最高的人坐庄，并定下这一副的将牌花色。</li>
        <li><b class="text-ivory">埋底</b>：庄家拿到底牌后，从 20 张里扣 3 张进暗底。</li>
        <li><b class="text-ivory">打牌</b>：庄家领出，三家轮流跟牌，共 17 轮（每人每轮出同样张数）。</li>
        <li><b class="text-ivory">结算</b>：数庄家抓到的分 + 底牌分 × 末轮张数，够不够定约分；据此升级。</li>
      </ol>
      <p>
        座位与轮转：出牌顺序是 <b class="text-ivory">你 → 左边（你的下家）→ 右边（你的上家）→ 你</b>；每副的发牌人轮换，首副随机。发牌人率先叫牌。
      </p>
    </div>
  </section>

  <section id="basics" class={section}>
    <h2 class={heading}>2. 牌与分值</h2>
    <div class={body}>
      <p>
        全场一共 100 分，只有三种牌带分：<b class="text-ivory">5 / 10 / K</b>。牌面上没有额外的分值标记 ——
        点数本身就说明了分值，认得这三张就够。
      </p>
      <CardRow cards={POINT_CARDS} size="md" />
      <div class="flex flex-wrap gap-1.5">
        {#each POINT_ROWS as row (row.label)}
          <span class={chip}>{row.label} = <b class="text-gold">{row.points}</b> 分</span>
        {/each}
      </div>
      <p>
        四张 5（20 分）+ 四张 10（40 分）+ 四张 K（40 分）= 100 分。双王不带分，但它们是最大的主牌。
      </p>
      <p>
        推论：<b class="text-ivory">分牌是这一副的胜负手</b>。庄家抓到的分要够定约，闲家只要把分留给自家人（或者干脆抓走）就够了。
      </p>
    </div>
  </section>

  <section id="trump" class={section}>
    <h2 class={heading}>3. 级牌与主牌</h2>
    <div class={body}>
      <p>
        这一副有一张 <b class="text-ivory">级牌点数</b>，取自庄家的级别（本节示例里是 <b class="text-gold">5</b>）；
        这四张 5 永远算主牌。此外，叫牌叫到的那个花色整门都是主牌 —— 无主时则只有四张级牌加双王。
      </p>

      <p class="pt-1 text-white/80">
        同样是这些牌，将牌不同，主牌（<b class="text-gold">金边</b>）就完全不同：
      </p>
      <div class="space-y-3 rounded-xl bg-black/30 p-3">
        <div>
          <p class={env}>本副：{trumpText(TRUMP_HEARTS)} → 主牌 {trumpCount(TRUMP_HEARTS)} 张</p>
          <CardRow cards={TRUMP_DEMO_CARDS} trump={TRUMP_HEARTS} />
        </div>
        <div>
          <p class={env}>本副：{trumpText(TRUMP_NT)} → 主牌只剩 {trumpCount(TRUMP_NT)} 张：四张级牌 + 双王</p>
          <CardRow cards={TRUMP_DEMO_CARDS} trump={TRUMP_NT} />
        </div>
      </div>

      <p class="pt-1">主牌内部的大小顺序（从大到小）：</p>
      <p class={env}>本副：{trumpText(TRUMP_HEARTS)}（下面这六张全是主牌）</p>
      <CardRow cards={TRUMP_LADDER} trump={TRUMP_HEARTS} size="md" />
      <p>
        大王 &gt; 小王 &gt; 主级（主花色的 5）&gt; 副级（其他三门的 5，三张完全相等）&gt; 主花色其他牌。副牌则各自成门，
        每门从 2 到 A，<b class="text-ivory">但跳过级牌</b>：级牌已经归主牌了。
      </p>
      <p>
        记住这个「跳过」很关键：级牌是 5 时，♣3 与 ♣6 之间没有别的遗漏 —— 副牌里的 5 已经不在这一门了，
        所以它们算<b class="text-ivory">连着</b>。下面打牌一节会反复用到这一点。
      </p>
    </div>
  </section>

  <section id="auction" class={section}>
    <h2 class={heading}>4. 叫牌：定庄、定主</h2>
    <div class={body}>
      <ul class="ml-4 list-disc space-y-1">
        <li>从 <b class="text-ivory">40 分起步，每次至少加 5 分</b>；分数是主序，同分时花色必须更高：♣ &lt; ♦ &lt; ♥ &lt; ♠ &lt; 无主。</li>
        <li>叫牌无上限、无加倍；你叫多少分，坐庄后就要抓够多少分。</li>
        <li>连续两家不叫即成交；三家开叫全部 pass 时本副作废重发（级别不变，换下一位发牌人）。</li>
      </ul>

      <p class="pt-1">一段真实成交的叫牌（发牌人是你）：</p>
      <div class="flex flex-wrap gap-1.5">
        {#each DEMO_AUCTION as entry, index (index)}
          <span class={chip}>
            <span class="text-white/50">{TUTORIAL_NAMES[entry.seat]}</span>
            {callLabel(entry.call)}
          </span>
        {/each}
      </div>
      <p>
        结果：<b class="text-gold">阿豪 45♥ 坐庄</b>，主打 ♥，级牌是阿豪的级别点数。阿豪要抓 45 分才算打成。
      </p>

      <p class="pt-1 font-semibold text-white/80">闲家要到多少分才能把庄家打输？</p>
      <p>
        不是简单的「100 − 45 = 55」—— 那漏掉了<b class="text-ivory">底牌那 3 张的分</b>。底分按末轮张数在庄家账上加加减减，
        所以闲家的门槛跟着<b class="text-ivory">保底还是抠底</b>走。以定约 45 分、暗底 {kittyPoints} 分、末轮每人 2 张为例：
      </p>
      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/25">
          <p class="font-semibold text-emerald-300">保底（末轮庄家赢）</p>
          <p class="mt-1">
            庄家账上多 {kittyPoints} × 2 = <b>{kittyPoints * 2}</b> 分 ⇒ 闲家要抓
            <b class="tabular-nums">{settle.protectBar}</b> 分以上才打得输他
          </p>
        </div>
        <div class="rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-400/25">
          <p class="font-semibold text-rose-300">抠底（末轮闲家赢）</p>
          <p class="mt-1">
            庄家账上倒扣 {kittyPoints} × 2 = <b>{kittyPoints * 2}</b> 分 ⇒ 闲家只要抓
            <b class="tabular-nums">{settle.digBar}</b> 分以上就够
          </p>
        </div>
      </div>
      <p class="text-[11px] text-white/50">
        只有底牌 0 分时两者才同时等于 {settle.naiveBar}（即 100 − 定约分）。也就是说：<b class="text-ivory">埋了分就等于把自己的命门押在末轮上</b>
        —— 保住了闲家门槛被抬高，被抠了门槛立刻塌下来。
      </p>

      <p class="pt-1 font-semibold text-white/80">叫法的意图</p>
      <div class="overflow-hidden rounded-xl ring-1 ring-white/10">
        <table class="w-full text-[11px]">
          <thead class="bg-white/5 text-white/50">
            <tr>
              <th class="px-3 py-1.5 text-left font-semibold">叫法</th>
              <th class="px-3 py-1.5 text-left font-semibold">你想表达什么</th>
            </tr>
          </thead>
          <tbody>
            {#each AUCTION_INTENTS as row (row.call)}
              <tr class="border-t border-white/5">
                <td class="px-3 py-1.5 whitespace-nowrap text-gold">{row.call}</td>
                <td class="px-3 py-1.5">{row.intent}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <p class="pt-1 font-semibold text-white/80">叫牌的心理博弈（阻击叫）</p>
      <div class="rounded-xl bg-black/30 p-3">
        <p>
          <b class="text-ivory">叫牌是认领责任</b>：成交之后你一个人对两家，叫多少分就要抓多少分。所以叫分同时是「承诺」和「信号」
          —— 对手会据此判断你的牌力。
        </p>
        <p class="mt-2">
          <b class="text-ivory">升级只看实际抓分，不看叫分</b>：手牌强就该把价格叫高，把牌力换成级数；强牌只叫 40 是白白浪费。
          反过来，<b class="text-ivory">弱牌永远不叫</b>：三家全 pass 只是重发，叫牌权回到下一位发牌人，你没有任何损失；
          有人接手，你就当闲家，靠他失败升级。pass 是零成本的。
        </p>
        <p class="mt-2">
          <b class="text-gold">阻击叫</b>就是在这两点之间下注：明知自己「大概打得成」却直接往上跳（40 → 55），
          赌的是对手也只是「还行」。对手接受，你当闲家，赚他失败；对手放弃，你自己承担失败。
          所以<b class="text-ivory">阻击最有效的时机，是你判断对手只比你好一点</b>：
          他接了很可能差一点打不成，他不接你就白拿一副。
        </p>
        <p class="mt-2">
          <b class="text-ivory">先 pass 再叫（藏牌）</b>：首轮不叫能让两家低估你，等他们把价格叫低了你再接手。
          不叫也是发言 —— 你的沉默同样是给对手的信息。
        </p>
        <p class="mt-2">
          <b class="text-ivory">位置与节奏</b>：连续两家不叫就成交，所以你后面两家一 pass 就定案；
          <b class="text-ivory">最后叫牌的人压力最大</b>，因为再没人替你接。反过来，你也可以在成交前一刻抬价，
          让对方在「接一个高得多的价格」和「放你走」之间选。
        </p>
        <p class="mt-2">
          <b class="text-ivory">比分不同，风险偏好也该不同</b>：落后时更该冲高分（升级看抓分，输了也只是对手两人各升
          <span class="tabular-nums">ceil(差/10)</span>），领先时叫稳一点，别把机会送出去。
        </p>
      </div>

      <p>
        除此之外，手上长套（一门牌多）、常主（双王与级牌）、分牌多，才值得往上叫；
        三门都短、又没常主时，40 分都可能守不住。
      </p>
    </div>
  </section>

  <section id="bury" class={section}>
    <h2 class={heading}>5. 埋底</h2>
    <div class={body}>
      <p>
        庄家拿到底牌后共有 20 张，要扣 3 张进暗底，另外两家在结算前看不到。手牌示意（真实为 20 张）：
      </p>
      <p class={env}>本副：{trumpText(TRUMP_HEARTS)}（金边 = 主牌）</p>
      <div class="rounded-xl bg-black/25 px-2 py-3">
        <HandFan hand={BURY_HAND} trump={TRUMP_HEARTS} />
      </div>
      <div class="flex flex-wrap items-center gap-3 pt-1">
        <p class="text-[11px] text-white/55">示例暗底（{kittyPoints} 分）</p>
        <CardRow cards={DEMO_KITTY} size="md" />
      </div>
      <p>
        底分不会凭空消失：最后按 <b class="text-ivory">底牌分 × 末轮张数</b> 结算。末轮庄家赢下叫
        <b class="text-emerald-300">保底</b>（加分），被闲家赢走叫 <b class="text-rose-300">抠底</b>（扣分，可为负）。
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each MULTIPLIER_ROWS as row (row.lastTrick)}
          <span class={chip}>{row.lastTrick} → 底分 × <b class="text-gold">{row.multiplier}</b></span>
        {/each}
      </div>
      <p>
        推论：埋分是双刃剑 —— {kittyPoints} 分底被保底等于白拿 {kittyPoints} × 张数，被抠底就倒扣同样多。
        所以庄家通常<b class="text-ivory">把分埋掉、把大牌留在手里护底</b>，并且末轮尽量多出牌（张数就是倍率）。
      </p>
    </div>
  </section>

  <section id="play" class={section}>
    <h2 class={heading}>6. 打牌</h2>
    <div class={body}>
      <ul class="ml-4 list-disc space-y-1">
        <li><b class="text-ivory">领出</b>：单张，或同门顺子（同门内按大小严格相邻的 2 张及以上）。副牌顺子跳过级牌。</li>
        <li><b class="text-ivory">跟牌</b>：同门、同张数。该门不够时，先把该门出完，剩下的随便垫。</li>
        <li><b class="text-ivory">结构优先</b>：该门够张数时，所选牌的「最长连续段」分解必须字典序最大 —— 领 4 顺而你有 3 顺 + 2 顺，必须出 3 顺 + 任 1 张。</li>
        <li><b class="text-ivory">赢墩</b>：与领出同长度、同门的更高顺子，或用同张数的连续主牌杀牌；长度不同或结构不同（如 3 + 1）都不能赢。大小完全相等时先出为大。</li>
      </ul>

      <div class="space-y-3 pt-2">
        <TryPlay title={TRY_LEAD.title} task={TRY_LEAD.task} hand={TRY_LEAD.hand} trump={TRY_LEAD.trump} />
        <TryPlay
          title={TRY_FOLLOW.title}
          task={TRY_FOLLOW.task}
          hand={TRY_FOLLOW.hand}
          trump={TRY_FOLLOW.trump}
          lead={TRY_FOLLOW.lead}
        />
        <TryPlay title={TRY_RUFF.title} task={TRY_RUFF.task} hand={TRY_RUFF.hand} trump={TRY_RUFF.trump} lead={TRY_RUFF.lead} />
      </div>

      <p class="pt-2">练手 2 的正确答案长这样：3 顺 + 1 张，而不是把 2 顺也一起打出去。</p>
      <div class="flex flex-wrap items-end gap-4">
        <TrickCluster cards={followLead} trump={TRY_FOLLOW.trump} caption="上家领出 4 张 ♣ 顺子" />
        <TrickCluster cards={followAnswer} trump={TRY_FOLLOW.trump} caption="你跟：♣3-4-6 + ♣Q" />
      </div>
    </div>
  </section>

  <section id="inference" class={section}>
    <h2 class={heading}>7. 打牌推论</h2>
    <div class={body}>
      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">① 常主永远最大</p>
        <p class="mt-1">双王、主级、副级统称常主，任何副牌顺子都杀不过它们。</p>
        <p class={env}>本副：{trumpText(TRUMP_HEARTS)}（♠ 是副牌，♥ 与四张 5、双王都是主牌）</p>
        <div class="mt-2 flex flex-wrap items-end gap-4">
          <TrickCluster cards={RUFF_LEAD} trump={TRUMP_HEARTS} caption="副牌最大：♠A-K-Q" />
          <TrickCluster cards={RUFF_WINNER} trump={TRUMP_HEARTS} caption="最低的三张主牌顺子" badge="赢墩" />
        </div>
      </div>

      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">② 副牌顺子跳过级牌</p>
        <p class="mt-1">
          <b class="text-gold">级牌 5</b> 归主牌，所以 ♣5 不在 ♣ 这一门里：♣3 之后直接接 ♣4、接着就是 ♣6
          —— <b class="text-ivory">♣3-4-6 三张是连着的</b>，可以当顺子出。
        </p>
        <p class={env}>本副：{trumpText(TRUMP_HEARTS)}（级牌 5 已归主牌，三门副牌的 5 都空了）</p>
        <div class="mt-2 space-y-2">
          <div>
            <p class="mb-1 text-[11px] text-emerald-300">✓ ♣3-4-6 合法顺子（♣5 是级牌，不在这一门）</p>
            <CardRow cards={RUN_SKIPS_LEVEL} trump={TRUMP_HEARTS} size="md" />
          </div>
          <div>
            <p class="mb-1 text-[11px] text-rose-300">✗ ♣3 与 ♣9 中间隔着 ♣4-♣8，不能一起出</p>
            <CardRow cards={RUN_NOT_ADJACENT} trump={TRUMP_HEARTS} size="md" />
          </div>
          <div>
            <p class="mb-1 text-[11px] text-white/55">
              主牌顺子按主牌全序相邻：♥3-4-6 在主牌里同样连着（♥5 是主级，比这六张里的 ♥ 都大）
            </p>
            <CardRow cards={TRUMP_RUN} trump={TRUMP_HEARTS} size="md" />
          </div>
        </div>
      </div>

      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">③ 副级三张完全相等</p>
        <p class="mt-1">
          <b class="text-gold">级牌 5</b> 时，其他三门的 5（♠5 ♦5 ♣5）大小一模一样，彼此不构成顺子相邻；
          它们之间比大小时看谁先出，平张先出为大。
        </p>
        <p class={env}>本副：{trumpText(TRUMP_HEARTS)}</p>
        <CardRow cards={OFF_RANK_EQUALS} trump={TRUMP_HEARTS} size="md" />
      </div>

      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">④ 缺门：能杀就杀，垫牌不赢</p>
        <p class="mt-1">
          某一门一张都没有时，你可以用同张数的连续主牌杀牌赢下这一轮，也可以垫掉没用的牌 —— 但垫牌无论多大都不能赢。
          末轮尤其要抢：赢下末轮才有保底 / 抠底。
        </p>
      </div>

      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">⑤ 分牌晚出，或垫给队友</p>
        <p class="mt-1">
          5 / 10 / K 带分，谁抓走算谁的。手里有分牌时，尽量等自己能赢的那一轮再出；跟不出门时优先把分垫给队友
          （庄家则相反：想办法把分收进自己手里）。
        </p>
      </div>

      <div class="rounded-xl bg-black/30 p-3">
        <p class="font-semibold text-ivory">⑥ 末轮张数是倍率</p>
        <p class="mt-1">
          最后一轮每人出几张，底分就乘几倍。所以末轮前要留足同门的连牌：末轮出 3 张，底分就是 ×3。
        </p>
        <p class={env}>本副：{trumpText(TRUMP_HEARTS)}</p>
        {#if TRY_RUFF.lead}
          <div class="mt-2">
            <TrickCluster cards={TRY_RUFF.lead} trump={TRY_RUFF.trump} caption="缺三门牌时，三张连续主牌就能赢下这一轮" />
          </div>
        {/if}
      </div>
    </div>
  </section>

  <section id="scoring" class={section}>
    <h2 class={heading}>8. 结算</h2>
    <div class={body}>
      <p>庄家得分 = 墩分 + 底牌分 × 末轮张数：</p>
      <div class="flex items-start justify-center gap-1.5 rounded-xl bg-black/30 py-3">
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums">{KITTY_EQUATION.trickPoints}</p>
          <p class="mt-1.5 text-[10px] text-white/50">墩分</p>
        </div>
        <span class="mt-2 text-lg leading-none text-white/40">+</span>
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums">{KITTY_EQUATION.kittyPoints}</p>
          <p class="mt-1.5 text-[10px] text-white/50">底牌 {DEMO_KITTY.length} 张</p>
          <div class="kitty-mini mt-1 flex justify-center">
            {#each DEMO_KITTY as card (cardKey(card))}
              <CardView {card} trump={TRUMP_HEARTS} size="sm" />
            {/each}
          </div>
        </div>
        <span class="mt-2 text-lg leading-none text-white/40">×</span>
        <div class="w-10 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums text-gold">{KITTY_EQUATION.multiplier}</p>
          <p class="mt-1.5 text-[10px] text-white/50">末轮张数</p>
        </div>
        <span class="mt-2 text-lg leading-none text-white/40">=</span>
        <div class="w-14 text-center">
          <p class="text-[26px] font-black leading-none tabular-nums text-gold">{KITTY_EQUATION.madeFinal}</p>
          <p class="mt-1.5 text-[10px] text-white/50">最终得分</p>
        </div>
      </div>
      <p class="text-[11px] text-white/50">示例：墩分 55 + 底牌 {kittyPoints} 分 × 2 = 75 分，定约 {KITTY_EQUATION.contract} 分。</p>

      <div class="grid gap-2 sm:grid-cols-2">
        <div class="rounded-xl bg-emerald-500/10 p-3 ring-1 ring-emerald-400/25">
          <p class="font-semibold text-emerald-300">保底（末轮庄家赢）</p>
          <p class="mt-1">
            {KITTY_EQUATION.trickPoints} + {kittyPoints} × 2 = <b>{KITTY_EQUATION.madeFinal}</b> ≥
            {KITTY_EQUATION.contract} → 打成
          </p>
        </div>
        <div class="rounded-xl bg-rose-500/10 p-3 ring-1 ring-rose-400/25">
          <p class="font-semibold text-rose-300">抠底（末轮闲家赢）</p>
          <p class="mt-1">
            {KITTY_EQUATION.trickPoints} − {kittyPoints} × 2 = <b>{KITTY_EQUATION.setFinal}</b> &lt;
            {KITTY_EQUATION.contract} → 打输
          </p>
        </div>
      </div>

      <p class="pt-1 font-semibold text-white/80">怎么判断「打成」</p>
      <p>
        一条式子：<b class="text-ivory">最终得分 = 墩分 ± 底牌分 × 末轮张数</b>（末轮庄家赢就是 +，闲家赢就是 −），
        <b class="text-ivory">≥ 定约分</b> 就是打成 —— 正好等于也算打成，所以上面例子里的 −20 会让 55 掉到 35，直接出局。
      </p>
      <p>
        另外记住这条恒等式：<b class="text-ivory">庄家墩分 + 闲家墩分 + 底牌分 = 100</b>。底牌那 3 张分不算在任何人的墩里，
        只在结算时按倍数在庄家账上进出 —— 这就是为什么「闲家抓够 100 − 定约分」只在底牌 0 分时才对（见叫牌一节的表格）。
      </p>
    </div>
  </section>

  <section id="levels" class={section}>
    <h2 class={heading}>9. 升级与赛程</h2>
    <div class={body}>
      <p>
        级别写成 <b class="text-ivory">点数(+过次)</b>：从 2(+0) 起步，A 之后进 2(+1)，可以越级跳档。
      </p>
      <div class="flex flex-wrap gap-4 rounded-xl bg-black/30 p-3">
        {#each LEVEL_DEMO as level, index (index)}
          <div class="text-center">
            <LevelBadge {level} />
            <p class="mt-1.5 text-[10px] text-white/45">{`${level.rank === 14 ? 'A' : level.rank}(+${level.cycle})`}</p>
          </div>
        {/each}
        <p class="self-center text-[11px] text-white/55">左起：5(+0) 也叫「打 5」、A(+1)、5(+2)</p>
      </div>

      <p class="pt-1 font-semibold text-white/80">庄家怎么升级</p>
      <p>
        升级<b class="text-ivory">只看实际拿到的最终得分，与叫了多少分无关</b>：叫 45 打成拿 75 分，和叫 75 打成拿 75 分，
        升级完全一样。这是叫牌要往上叫的真正理由 —— 牌力应该换成级数。
      </p>
      <p>
        得分的来源是 5 / 10 / K，所以<b class="text-ivory">只会是 5 的倍数</b>，59 / 69 / 79 这些边界永远不会出现。
        真实的档位只有这些：
      </p>
      <div class="overflow-hidden rounded-xl ring-1 ring-white/10">
        <table class="w-full text-[11px]">
          <thead class="bg-white/5 text-white/50">
            <tr>
              <th class="px-3 py-1.5 text-left font-semibold">最终得分</th>
              <th class="px-3 py-1.5 text-left font-semibold">庄家升级</th>
            </tr>
          </thead>
          <tbody>
            {#each UPGRADE_ROWS as row (row.range)}
              <tr class="border-t border-white/5">
                <td class="px-3 py-1.5 tabular-nums">{row.range}</td>
                <td class="px-3 py-1.5 text-gold">{row.levels}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p>
        「升 N 级」就是<b class="text-ivory">从你当前的级别往前推进 N 级</b>，跨过 A 就进位到下一轮的 2：
      </p>
      <div class="space-y-1.5">
        {#each steps as step, index (index)}
          <p class="rounded-lg bg-black/30 px-3 py-2 text-[11px]">
            {step.from.rank === 14 ? 'A' : step.from.rank}(+{step.from.cycle}) 升 {step.levels} 级 →
            <b class="text-gold">{step.to.rank === 14 ? 'A' : step.to.rank}(+{step.to.cycle})</b>
            <span class="ml-1 text-white/45">（{step.note}）</span>
          </p>
        {/each}
      </div>
      <p>
        举例：庄家现在是 5(+0)，打成拿到 75 分 → 升 3 级 → <b class="text-gold">8(+0)</b>。
      </p>

      <p class="pt-1 font-semibold text-white/80">打输了呢</p>
      <p>
        庄家<b class="text-ivory">级别不变</b>；两名闲家各升 <b class="text-ivory">ceil(差 / 10)</b> 级（向上取整），
        其中 <b class="text-ivory">差 = 定约分 − 最终得分</b>。差同样是 5 的倍数，所以实际只会出现这些档：
      </p>
      <div class="flex flex-wrap gap-1.5">
        {#each DEFENDER_STEPS as step (step.shortfall)}
          <span class={chip}>差 {step.shortfall} → 各升 <b class="text-gold">{step.levels}</b> 级</span>
        {/each}
      </div>
      <p>
        所以闲家也有动力把分抓狠一点：庄家差得越多，两名闲家一次升得越多（差 35 → 各升 4 级）。
        反过来说，庄家叫得太高而打输，代价是给对手两人同时送级。
      </p>
      <p>
        对局结束：<b class="text-ivory">两家达 2(+2)，或一家达 2(+3)</b>；总进度最高者为冠军。
      </p>
    </div>
  </section>

  <footer class="flex flex-wrap items-center justify-between gap-2 pb-4 text-xs text-white/50">
    <span>看完了？回大厅开一桌吧。</span>
    <a class="rounded-lg bg-gold px-4 py-2 text-xs font-bold text-ink transition hover:brightness-110" href="/">回大厅</a>
  </footer>
</main>
