/**
 * 叫牌面板「可达性」守卫：面板必须自己是**唯一**的滚动区，而「不叫」必须是它内部的
 * sticky 页脚 —— 判断是纯字符串级的，源码（`BidPanel.svelte`）与出货 SSR HTML 共用这一份。
 *
 * 为什么守的是机制而不是「页面里有 max-h-*」：上一版正是那么守的。`max-h-[56%]` 与
 * `overflow-y-auto` 一直都在，可面板是 flex 列 + `overflow-hidden`，候选区是
 * `shrink-0 max-h-44` —— 手机上面板可用高度 ~240px、固定开销 ~344px，可压缩的历史区
 * 被压到 0 之后，差额由 `overflow-hidden` 从**底部**裁掉，裁掉的正是排在最后的「不叫」。
 * 类名全在、按钮没了，所以守卫必须落在「谁在滚动、按钮怎么钉住」这一层。
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

/** Tailwind 的 bottom-* 取值（sticky 需要一个明确的贴边偏移） */
const BOTTOM_OFFSET = /\bbottom-(?:0|0\.5|1|1\.5|2|2\.5|3|3\.5|4|5|6|8|10|12)\b/;

function fail(reason: string): PanelCheck {
  return { ok: false, reason };
}

/** 取一个标签里的 class 值（源码与 SSR 都用双引号的普通字符串形式） */
function classOf(tag: string): string {
  const match = /\bclass="([^"]*)"/.exec(tag);
  return match?.[1] ?? '';
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
    return fail('叫牌面板里又套了一层 <section>：面板必须只有它自己一个滚动区');
  }

  const panelClass = classOf(tag);
  if (!panelClass.includes('max-h-')) {
    return fail('叫牌面板没有高度上限（缺 max-h-*）：叫牌可以一直抬价，面板会往毡面外长');
  }
  if (panelClass.includes('overflow-hidden')) {
    return fail(
      '叫牌面板用 overflow-hidden 裁切自己：内容超过 max-h 时，排在最后的子元素会被从底部裁掉 —— 上一版就是这么丢掉「不叫」的'
    );
  }
  if (!panelClass.includes('overflow-y-auto')) {
    return fail('叫牌面板自己不是滚动区（缺 overflow-y-auto）：超出 max-h 的部分只会被裁掉，滚不到');
  }
  const innerScroll = body.match(/overflow-y-auto/g)?.length ?? 0;
  const innerClip = body.match(/overflow-hidden/g)?.length ?? 0;
  if (innerScroll > 0 || innerClip > 0) {
    return fail(
      `面板内部还有第二个滚动/裁切区（overflow-y-auto ×${innerScroll}、overflow-hidden ×${innerClip}）：` +
        '固定高度的子块会把「不叫」顶出面板底边'
    );
  }

  const buttonClass = passButtonClass(body);
  if (buttonClass === null) {
    if (options.requirePassButton === false) return { ok: true, reason: '' };
    return fail('面板里找不到「不叫」按钮：轮到自己时必须有一个可点的「不叫」');
  }
  if (!buttonClass.includes('sticky') || !BOTTOM_OFFSET.test(buttonClass)) {
    return fail(
      '「不叫」不是 sticky 底部（需要 sticky + bottom-*）：内容超出面板时它会被顶出滚动区，滚到底也可能点不到'
    );
  }
  if (!buttonClass.includes('min-h-11')) {
    return fail('「不叫」的命中区不足 44px（缺 min-h-11）');
  }
  return { ok: true, reason: '' };
}
