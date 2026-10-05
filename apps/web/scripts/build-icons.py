"""生成站点图标（favicon.svg / favicon.ico / apple-touch-icon.png）。

设计语言取自 app.css 的 `.felt`：径向毡面渐变 + 金色内环，
正中一枚金色的「60」。所有资产由本脚本一处生成，改设计只改这里：

    python apps/web/scripts/build-icons.py

依赖：Pillow（光栅部分）；SVG 部分是纯文本模板。
字体在候选列表里挑机器上第一个存在的（Segoe UI Bold → Arial Bold → …），
保证脚本在不同 Windows 机器上都能跑。
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ---------- 设计令牌（512 视口坐标系，与 app.css 的 .felt 对齐） ----------

# radial-gradient(120% 95% at 50% 28%, #17714f, #0d4432 48%, #072b1f)
GRAD_CENTER = (256, 512 * 0.28)
GRAD_RX, GRAD_RY = 512 * 0.60, 512 * 0.475
GRAD_STOPS = (0.0, (0x17, 0x71, 0x4F)), (0.48, (0x0D, 0x44, 0x32)), (1.0, (0x07, 0x2B, 0x1F))

GOLD = (0xD8, 0xB4, 0x5A)  # --color-gold

CORNER_RADIUS = 112  # 圆角方块的四角半径
RING_INSET = 26  # 金色内环的缩进
RING_RADIUS = 88
RING_WIDTH = 9
RING_ALPHA = 120  # 0.16 的桌面内环在 favicon 尺度看不见，这里提到 ~0.47

TEXT = '60'
TEXT_INK_WIDTH = 300  # 「60」墨迹宽度占视口的比例（300/512 ≈ 59%）
TEXT_SHADOW = (0, 7, 10, 70)  # (dx, dy, blur, alpha)

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\segoeuib.ttf',  # Segoe UI Bold
    r'C:\Windows\Fonts\arialbd.ttf',  # Arial Bold
    r'C:\Windows\Fonts\trebucbd.ttf',  # Trebuchet Bold
    '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
]

OUT_DIR = Path(__file__).resolve().parents[1] / 'static'

# SVG 的 <text> 用的字体栈：客户端没有哪一款也会落到任意 sans-serif，
# 数字「60」在所有无衬线体里的形制几乎一致。
SVG_FONT_STACK = "'Segoe UI', Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif"


def _lerp(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def felt_gradient(size: int) -> Image.Image:
    """径向毡面渐变。512 上逐像素算再放大：渐变是平滑的，放大无损观感。"""
    img = Image.new('RGB', (512, 512))
    px = img.load()
    cx, cy = GRAD_CENTER
    for y in range(512):
        dy = (y - cy) / GRAD_RY
        for x in range(512):
            dx = (x - cx) / GRAD_RX
            t = min(math.sqrt(dx * dx + dy * dy), 1.0)
            color = GRAD_STOPS[0][1]
            for (t0, c0), (t1, c1) in zip(GRAD_STOPS, GRAD_STOPS[1:]):
                if t >= t0:
                    color = _lerp(c0, c1, (t - t0) / (t1 - t0))
            px[x, y] = color
    return img.resize((size, size), Image.LANCZOS)


def _pick_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default(size)


def _fit_font(target_ink_width: float, k: float) -> ImageFont.FreeTypeFont:
    """按目标墨迹宽度反推字号，迭代一次即收敛。"""
    font = _pick_font(256)
    probe = ImageDraw.Draw(Image.new('L', (8, 8)))
    ink_w = probe.textbbox((0, 0), TEXT, font=font)[2]
    return _pick_font(round(ink_w and 256 * target_ink_width / ink_w * k))


def render_master(size: int = 1024, rounded: bool = True) -> Image.Image:
    """在 `size` 的正方形上渲染完整设计。rounded=False 用于 apple-touch-icon：
    iOS 自己裁圆角，预裁透明角会被垫黑。"""
    k = size / 512
    img: Image.Image

    if rounded:
        mask = Image.new('L', (size, size), 0)
        ImageDraw.Draw(mask).rounded_rectangle(
            [0, 0, size - 1, size - 1], radius=round(CORNER_RADIUS * k), fill=255
        )
        img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
        img.paste(felt_gradient(size), (0, 0), mask)
    else:
        img = felt_gradient(size).convert('RGBA')

    ring = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    inset = round(RING_INSET * k)
    ImageDraw.Draw(ring).rounded_rectangle(
        [inset, inset, size - 1 - inset, size - 1 - inset],
        radius=round(RING_RADIUS * k),
        outline=(*GOLD, RING_ALPHA),
        width=max(2, round(RING_WIDTH * k)),
    )
    img = Image.alpha_composite(img, ring)

    font = _fit_font(TEXT_INK_WIDTH, k)
    probe = ImageDraw.Draw(Image.new('L', (8, 8)))
    left, top, right, bottom = probe.textbbox((0, 0), TEXT, font=font)
    dx = size / 2 - (left + right) / 2
    dy = size / 2 - (top + bottom) / 2

    dx_, dy_, blur, alpha = TEXT_SHADOW
    shadow = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(shadow).text((dx + dx_ * k, dy + dy_ * k), TEXT, font=font, fill=(0, 0, 0, alpha))
    img = Image.alpha_composite(img, shadow.filter(ImageFilter.GaussianBlur(blur * k)))

    text = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    ImageDraw.Draw(text).text((dx, dy), TEXT, font=font, fill=(*GOLD, 255))
    return Image.alpha_composite(img, text)


def build_svg() -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <radialGradient id="felt" gradientUnits="userSpaceOnUse" cx="{GRAD_CENTER[0]:g}" cy="{GRAD_CENTER[1]:.0f}" r="{GRAD_RX:g}">
      <stop offset="0" stop-color="#17714f"/>
      <stop offset="0.48" stop-color="#0d4432"/>
      <stop offset="1" stop-color="#072b1f"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" rx="{CORNER_RADIUS}" fill="url(#felt)"/>
  <rect x="{RING_INSET}" y="{RING_INSET}" width="{512 - 2 * RING_INSET}" height="{512 - 2 * RING_INSET}" rx="{RING_RADIUS}" fill="none" stroke="#d8b45a" stroke-opacity="{RING_ALPHA / 255:.2f}" stroke-width="{RING_WIDTH}"/>
  <text x="256" y="256" text-anchor="middle" dominant-baseline="central" font-family="{SVG_FONT_STACK}" font-weight="700" font-size="272" fill="#d8b45a">60</text>
</svg>
"""


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    (OUT_DIR / 'favicon.svg').write_text(build_svg(), encoding='utf-8', newline='\n')

    master = render_master(1024, rounded=True)
    master.save(
        OUT_DIR / 'favicon.ico',
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    touch = render_master(1024, rounded=False).convert('RGB').resize((180, 180), Image.LANCZOS)
    touch.save(OUT_DIR / 'apple-touch-icon.png')

    print(f'icons written to {OUT_DIR}')


if __name__ == '__main__':
    main()
