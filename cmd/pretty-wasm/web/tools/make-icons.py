#!/usr/bin/env python3
"""生成网页图标。

不依赖 PIL、cairosvg 或 ImageMagick：PNG 直接用 zlib 写，形状用有向距离场求
覆盖率，顺带做了抗锯齿。图形是圆角方块加四条横杠，和页面工具栏里"格式化"按钮
的图标一致。

用法（在仓库根目录执行）：

    python3 cmd/pretty-wasm/web/tools/make-icons.py

改动这里的图形后要重新执行，图标变了 Service Worker 的缓存也要跟着重算。
"""

import math
import os
import struct
import zlib

WEB_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 圆角方块的两端颜色，和页面 --accent 同一套色系。
BG_TOP = (0x2E, 0x74, 0xF6)
BG_BOTTOM = (0x14, 0x44, 0xB8)
BAR = (0xFF, 0xFF, 0xFF)

# 24x24 视图框里的四条横杠，和 index.html 中格式化按钮的 path 完全一致：
# M4 6h16 / M4 10h10 / M4 14h16 / M4 18h7
BARS = ((6, 16), (10, 10), (14, 16), (18, 7))
VIEW = 24.0
BAR_THICKNESS = 1.7  # 视图框单位


def rounded_box_distance(px, py, cx, cy, half_w, half_h, radius):
    """点到圆角矩形的距离，负数表示在内部。"""
    dx = abs(px - cx) - (half_w - radius)
    dy = abs(py - cy) - (half_h - radius)
    outside = math.hypot(max(dx, 0.0), max(dy, 0.0))
    return outside + min(max(dx, dy), 0.0) - radius


def blend(base, top, alpha):
    return tuple(int(round(b + (t - b) * alpha)) for b, t in zip(base, top))


def render(size, maskable=False):
    """返回 size*size 的 RGBA 字节。

    maskable 图标要留出安全区：系统可能把图标裁成圆形，图形必须缩在中心 80% 内，
    所以整块背景铺满、内容按比例缩小。
    """
    ss = 3  # 每个方向 3 倍超采样
    pixels = bytearray()
    radius = size * 0.22
    content = size * (0.60 if maskable else 0.76)
    offset = (size - content) / 2.0
    scale = content / VIEW
    bar_half = BAR_THICKNESS * scale / 2.0

    for y in range(size):
        for x in range(size):
            cover = 0.0
            bar_cover = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    px = x + (sx + 0.5) / ss
                    py = y + (sy + 0.5) / ss
                    d = rounded_box_distance(px, py, size / 2, size / 2,
                                             size / 2, size / 2, radius)
                    if d < 0.0:
                        cover += 1.0
                    lx = (px - offset) / scale
                    ly = (py - offset) / scale
                    for by, length in BARS:
                        # 每条横杠是一个两端全圆的胶囊，圆角半径等于半高。
                        if rounded_box_distance(lx, ly, 4 + length / 2, by,
                                                length / 2, BAR_THICKNESS / 2,
                                                BAR_THICKNESS / 2) < 0.0:
                            bar_cover += 1.0
                            break
            samples = ss * ss
            alpha = cover / samples
            bar_alpha = (bar_cover / samples) * (1.0 if cover > 0 else 0.0)
            t = y / max(size - 1, 1)
            bg = blend(BG_TOP, BG_BOTTOM, t)
            color = blend(bg, BAR, min(bar_alpha, alpha))
            pixels += bytes((color[0], color[1], color[2], int(round(alpha * 255))))
    return bytes(pixels)


def write_png(path, size, raw):
    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body))

    header = struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0)
    # 每行前面加一个过滤器字节 0（None）
    stride = size * 4
    rows = b''.join(b'\x00' + raw[y * stride:(y + 1) * stride] for y in range(size))
    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', header)
           + chunk(b'IDAT', zlib.compress(rows, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as fh:
        fh.write(png)
    return len(png)


SVG = '''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#2E74F6"/>
      <stop offset="1" stop-color="#1444B8"/>
    </linearGradient>
  </defs>
  <rect width="24" height="24" rx="5.25" fill="url(#bg)"/>
  <g stroke="#fff" stroke-width="1.7" stroke-linecap="round">
{lines}  </g>
</svg>
'''


def write_svg(path, maskable=False):
    scale = 0.60 if maskable else 1.0
    offset = (24 - 24 * scale) / 2
    lines = []
    for by, length in BARS:
        y = by * scale + offset
        lines.append('    <path d="M{:.2f} {:.2f}h{:.2f}"/>\n'.format(
            4 * scale + offset, y, length * scale))
    with open(path, 'w', encoding='utf-8') as fh:
        fh.write(SVG.format(lines=''.join(lines)))


def main():
    targets = [
        ('icon-192.png', 192, False),
        ('icon-512.png', 512, False),
        ('icon-maskable-512.png', 512, True),
        ('apple-touch-icon.png', 180, False),
    ]
    for name, size, maskable in targets:
        path = os.path.join(WEB_DIR, name)
        written = write_png(path, size, render(size, maskable))
        print(f'{name}: {size}x{size}, {written} 字节')
    # 只出矢量版 favicon；maskable 只发 PNG，浏览器对 SVG 的 maskable 支持并不一致。
    write_svg(os.path.join(WEB_DIR, 'favicon.svg'))
    print('favicon.svg 已生成')


if __name__ == '__main__':
    main()