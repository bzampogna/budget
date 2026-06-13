#!/usr/bin/env python3
"""Generate the Draft Day PWA icons (football on a field-green background).

Pure-python PNG writer, no dependencies. Run from the repo root:
    python3 scripts/make-draft-icons.py
Writes draft/icon-180.png, draft/icon-192.png, draft/icon-512.png.
"""
import math
import os
import struct
import zlib

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'draft')


def write_png(path, w, h, pixels):
    raw = bytearray()
    stride = w * 3
    for y in range(h):
        raw.append(0)  # filter: none
        raw += pixels[y * stride:(y + 1) * stride]

    def chunk(tag, data):
        return (struct.pack('>I', len(data)) + tag + data +
                struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff))

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)


def sample(u, v):
    """Color at normalized coords u,v in [-1,1]. Returns (r,g,b) floats 0-255."""
    # field-green radial gradient background
    d = math.sqrt(u * u + v * v) / 1.4142
    bg = [
        (1 - d) * 22 + d * 6,
        (1 - d) * 101 + d * 46,
        (1 - d) * 52 + d * 22,
    ]
    # faint yard lines
    for yl in (-0.72, -0.36, 0.0, 0.36, 0.72):
        if abs(v - yl) < 0.012:
            bg = [c * 0.9 + 255 * 0.1 for c in bg]
    # rotate -45 degrees for the football
    c45 = math.cos(math.pi / 4)
    rx = (u * c45 + v * c45)
    ry = (-u * c45 + v * c45)
    a, b = 0.66, 0.42  # ellipse radii
    e = (rx / a) ** 2 + (ry / b) ** 2
    if e <= 1.0:
        col = [146.0, 64.0, 14.0]  # leather brown
        # shading toward the lower edge
        shade = max(0.0, min(1.0, 0.5 + ry / b * 0.5))
        col = [c * (1.05 - 0.35 * shade) for c in col]
        # dark outline near the edge
        if e > 0.88:
            col = [c * 0.55 for c in col]
        # white end stripes
        if 0.40 < abs(rx) < 0.50 and e <= 0.88:
            col = [245.0, 245.0, 240.0]
        # laces: long center stitch + cross stitches
        if abs(ry) < 0.030 and abs(rx) < 0.27:
            col = [250.0, 250.0, 245.0]
        for k in (-0.20, -0.10, 0.0, 0.10, 0.20):
            if abs(rx - k) < 0.020 and abs(ry) < 0.085:
                col = [250.0, 250.0, 245.0]
        return col
    return bg


def render(size, ss=3):
    px = bytearray(size * size * 3)
    inv = 2.0 / (size * ss)
    for y in range(size):
        for x in range(size):
            r = g = b = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    u = (x * ss + sx + 0.5) * inv - 1.0
                    v = (y * ss + sy + 0.5) * inv - 1.0
                    cr, cg, cb = sample(u, v)
                    r += cr
                    g += cg
                    b += cb
            n = ss * ss
            i = (y * size + x) * 3
            px[i] = min(255, int(r / n))
            px[i + 1] = min(255, int(g / n))
            px[i + 2] = min(255, int(b / n))
    return px


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in (512, 192, 180):
        path = os.path.join(OUT_DIR, f'icon-{size}.png')
        write_png(path, size, size, render(size))
        print('wrote', path)


if __name__ == '__main__':
    main()
