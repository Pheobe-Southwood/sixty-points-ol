/**
 * 叫牌面板「可达性」守卫：面板是一个 flex 列，**唯一可伸缩的滚动区**是叫牌历史，
 * 「不叫」是它后面正常文档流里的固定页脚 —— 于是页脚既不压住内容，也不会被裁掉。
 *
 * 两代坏形状都是这条不变式的反例：
 * 1. 「flex 列 + `overflow-hidden` + `shrink-0` 候选区」：固定开销超过面板高度时，
 *    `overflow-hidden` 从底部裁掉最后一行（正是「不叫」），它又不在任何滚动区里，滚也滚不回来。
 * 2. 「面板自己滚 + 「不叫」sticky 贴底」：按钮确实点得到，但它是**浮**在内容上的 ——
 *    滚动时压住排在最后的历史行（手机上那半行「45NT / 50NT / 55♥」就是这么被切掉的）。
 * 现在：面板 `flex flex-col` + `max-h`；历史区 `min-h-0 flex-1 overflow-y-auto`（自己滚、先被压缩）；
 * 「不叫」排在它之后、`shrink-0`、不 sticky。任何视口高度下，页脚都在，且内容的可见部分都不被遮。
 *
 * 用 `data-bid-panel` 定位面板：与仓库既有的 `data-marked` 同一套路，SSR HTML 里也在。
 * 注释先剥掉再判断 —— 解释「上一版为什么坏」的注释里写着 `overflow-hidden`，不构成违规。
 */
export interface PanelCheck {
  readonly ok: boolean;
  readonly reason: string;
}

export interface PanelCheckOptions {
  /** 页面上是否必须有「不叫」按钮：观战者与非本家轮次时它本来就不渲染，默认必须有 */
  readonly requirePassButton?: boolean;
}

function fail(reason: string): PanelCheck {
  return { ok: false, reason };
}

/** 取一个标签里的 class 值（源码与 SSR 都用双引号的普通字符串形式） */
function classOf(tag: string): string {
  const match = /\bclass="([^"]*)"/.exec(tag);
  return match?.[1] ?? '';
}

/** 取某个位置所在的标签（往回找最近的 `<`，往前后各截到 `>`） */
function tagAt(body: string, index: number): string {
  const start = body.lastIndexOf('<', index);
  if (start < 0) return '';
  const end = body.indexOf('>', index);
  if (end < 0) return '';
  return body.slice(start, end + 1);
}

/** 「不叫」按钮的 class：在「不叫」文字之前找最近的 `<button` */
function passButtonClass(body: string): string | null {
  const text = body.indexOf('不叫');
  if (text < 0) return null;
  const start = body.lastIndexOf('<button', text);
  if (start < 0) return null;
  const end = body.indexOf('>', start);
  if (end < 0) return null;
  return classOf(body.slice(start, end + 1));
}

export function checkBidPanelReachability(markup: string, options: PanelCheckOptions = {}): PanelCheck {
  const source = markup.replace(/<!--[\s\S]*?-->/g, '');
  const marker = source.indexOf('data-bid-panel');
  if (marker < 0) {
    return fail('找不到叫牌面板：它必须带 data-bid-panel 钩子（源码守卫与 ui-check 都靠它定位）');
  }
  const open = source.lastIndexOf('<section', marker);
  const openEnd = source.indexOf('>', marker);
  if (open < 0 || openEnd < 0) return fail('叫牌面板的 <section> 开标签不完整');
  const end = source.indexOf('</section>', openEnd);
  if (end < 0) return fail('叫牌面板的 <section> 没有闭合');
  const tag = source.slice(open, openEnd + 1);
  const body = source.slice(openEnd + 1, end);
  if (body.includes('<section')) {
    return fail('叫牌面板里又套了一层 <section>：面板的几何只该由这一个容器决定');
  }

  const panelClass = classOf(tag);
  if (!panelClass.includes('max-h-')) {
    return fail('叫牌面板没有高度上限（缺 max-h-*）：叫牌可以一直抬价，面板会往毡面外长');
  }
  if (panelClass.includes('overflow-hidden')) {
    return fail(
      '叫牌面板用 overflow-hidden 裁切自己：内容超过 max-h 时，排在最后的「不叫」会被从底部裁掉 —— 上一版就是这么丢掉「不叫」的'
    );
  }
  if (!/\bflex\b/.test(panelClass) || !panelClass.includes('flex-col')) {
    return fail(
      '叫牌面板不是 flex 列（缺 flex flex-col）：只有 flex 列才能让历史区先被压缩、「不叫」稳稳留在正常文档流里'
    );
  }

  const scrollIndex = body.indexOf('overflow-y-auto');
  if (scrollIndex < 0) {
    return fail('面板里找不到叫牌历史的滚动区（缺 overflow-y-auto）：历史一长就会把「不叫」顶出面板');
  }
  const scrollClass = classOf(tagAt(body, scrollIndex));
  if (!scrollClass.includes('min-h-0') || !scrollClass.includes('flex-1')) {
    return fail(
      '历史的滚动区不是可伸缩的那一块（需要 min-h-0 + flex-1）：它不先被压缩，固定内容就会把「不叫」挤出面板'
    );
  }
  const scrollCount = body.match(/overflow-y-auto/g)?.length ?? 0;
  if (scrollCount > 1) {
    return fail(`面板里有 ${scrollCount} 处 overflow-y-auto：只允许叫牌历史那一块滚`);
  }
  const elasticCount = body.match(/flex-1/g)?.length ?? 0;
  if (elasticCount > 1) {
    return fail(`面板里有 ${elasticCount} 处 flex-1：可伸缩的只允许历史滚动区这一块`);
  }
  if (body.includes('overflow-hidden')) {
    return fail(
      '面板里还有 overflow-hidden 裁切区：固定高度的子块会把「不叫」顶出面板底边（上一版的故障形状）'
    );
  }

  const passIndex = body.indexOf('不叫');
  if (passIndex >= 0 && passIndex < scrollIndex) {
    return fail('「不叫」排在历史滚动区之前：页脚必须排在滚动区之后，历史才不会从它下面穿过去');
  }

  const buttonClass = passButtonClass(body);
  if (buttonClass === null) {
    if (options.requirePassButton === false) return { ok: true, reason: '' };
    return fail('面板里找不到「不叫」按钮：轮到自己时必须有一个可点的「不叫」');
  }
  if (buttonClass.includes('sticky')) {
    return fail(
      '「不叫」是 sticky 的：它会浮在历史行上，把排在最后的那半行叫牌记录压掉 —— 页脚要在正常文档流里（容器内不许出现 sticky）'
    );
  }
  if (!buttonClass.includes('shrink-0')) {
    return fail('「不叫」不是 shrink-0：flex 列空间不够时它会被压缩，命中区随之变小');
  }
  if (!buttonClass.includes('min-h-11')) {
    return fail('「不叫」的命中区不足 44px（缺 min-h-11）');
  }
  return { ok: true, reason: '' };
}

/**
 * 叫牌候选区的**固定五槽 + 跳叫触发**守卫：每档五个槽（不可叫的花色留隐形占位）、
 * 候选区容器带 `data-bid-trigger="row-end|full-row|none"`、且隐形占位**绝不是按钮**。
 *
 * 为什么钉在标记与类上：「有没有补位」渲染完就看不出差别了 —— 补位后的四格与占位后的五格
 * 静态标签长得一样，只差一个 `invisible` 类，而字形的**横向位置**正是误触的来源。
 * 源码守卫（`test/bid-panel.test.ts`）与 ui-check 的出货 HTML 用同一份判据；
 * 档位与触发形态的取值由 `labels.ts` 的 `bidTiers` 负责（四场景表与反证在 labels.test.ts）。
 */
export function checkBidSlots(markup: string): PanelCheck {
  const source = markup.replace(/<!--[\s\S]*?-->/g, '');
  // 源码里它绑的是 `layout.trigger`（Svelte 表达式），出货 HTML 里是三个枚举值之一的字面量
  const trigger = /data-bid-trigger=(?:"([^"]*)"|\{([^}]*)\})/.exec(source);
  if (trigger === null) {
    return fail('候选区缺 data-bid-trigger：面板必须暴露触发钮形态（row-end / full-row / none）');
  }
  const literal = trigger[1];
  const expression = trigger[2];
  if (literal !== undefined) {
    if (literal !== 'row-end' && literal !== 'full-row' && literal !== 'none') {
      return fail(`data-bid-trigger 的值不是 row-end / full-row / none：${literal}`);
    }
  } else if (!/layout\.trigger/.test(expression ?? '')) {
    return fail(
      `源码里的 data-bid-trigger 必须绑到 labels.ts 给出的 layout.trigger，实际绑的是 {${expression}}`
    );
  }

  const legal = source.match(/data-bid-slot="legal"/g)?.length ?? 0;
  const invisible = source.match(/data-bid-slot="invisible"/g)?.length ?? 0;
  if (legal === 0) {
    return fail('候选区里没有 data-bid-slot="legal"：可叫的档位不是按固定槽渲染的');
  }
  // 源码形态（含 Svelte 模板）里必须写出隐形占位那一支；出货 HTML 在没有不可叫花色时可以为 0
  if (source.includes('{#each') && invisible === 0) {
    return fail('源码里没有 data-bid-slot="invisible"：不可叫的花色没留隐形占位，下一步就是补位');
  }
  // 隐形占位绝不能是按钮：不可见的按钮照样吃点击与键盘焦点
  for (const match of source.matchAll(/data-bid-slot="invisible"/g)) {
    const tag = tagAt(source, match.index ?? 0);
    if (tag.startsWith('<button')) {
      return fail('不可叫的花色被渲染成了 <button>：隐形占位必须不可点（span + invisible）');
    }
  }
  // 旧形状：按「合法花色」逐档摆 —— 后面的花色会往前补位
  if (/each\s+row\.strains/.test(source)) {
    return fail('候选区又按「合法花色」摆（each row.strains）：后面会往前补位，同一横向位置换了花色');
  }
  return { ok: true, reason: '' };
}
