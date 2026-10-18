#!/usr/bin/env python3
"""Cinematic Helion share cards — code-drawn after image APIs hit quota."""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont

BG = np.array([0x09, 0x09, 0x0B], dtype=np.float64)
DARK = np.array([0x14, 0x14, 0x18], dtype=np.float64)
INK = np.array([0xEC, 0xEC, 0xEF], dtype=np.float64)
MUTED = np.array([0x8B, 0x8B, 0x93], dtype=np.float64)
SILVER = np.array([0xC5, 0xCD, 0xD8], dtype=np.float64)

TITLE_FONT = "/usr/share/fonts/truetype/liberation/LiberationSansNarrow-Bold.ttf"
TAG_FONT = "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf"
OUT_DIR = "/workspace/.grok"


def lerp(a, b, t):
    t = np.clip(t, 0.0, 1.0)
    if isinstance(t, np.ndarray):
        return a + (b - a) * t[..., None]
    return a + (b - a) * t


def starfield(h, w, seed, density=0.0020):
    rng = np.random.default_rng(seed)
    img = np.zeros((h, w, 3), dtype=np.float64)
    img[:] = BG
    n = int(h * w * density)
    xs = rng.integers(0, w, n)
    ys = rng.integers(0, h, n)
    bright = rng.power(3.4, n) * 0.80 + 0.06
    size_roll = rng.random(n)
    for x, y, b, s in zip(xs, ys, bright, size_roll):
        col = lerp(SILVER, INK, float(b))
        img[y, x] = np.maximum(img[y, x], col * b)
        if s > 0.93 and 1 <= x < w - 1 and 1 <= y < h - 1:
            img[y, x - 1] = np.maximum(img[y, x - 1], col * b * 0.32)
            img[y, x + 1] = np.maximum(img[y, x + 1], col * b * 0.32)
            img[y - 1, x] = np.maximum(img[y - 1, x], col * b * 0.32)
            img[y + 1, x] = np.maximum(img[y + 1, x], col * b * 0.32)
    # A few brighter pinpoints
    for _ in range(18):
        x = int(rng.integers(8, w - 8))
        y = int(rng.integers(8, h - 8))
        img[y, x] = INK
        img[y, x - 1] = np.maximum(img[y, x - 1], SILVER * 0.45)
        img[y, x + 1] = np.maximum(img[y, x + 1], SILVER * 0.45)
        img[y - 1, x] = np.maximum(img[y - 1, x], SILVER * 0.45)
        img[y + 1, x] = np.maximum(img[y + 1, x], SILVER * 0.45)
    return img


def add_glow(img, cx, cy, radius, color, strength):
    h, w = img.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / max(radius, 1)
    fall = np.exp(-d * d * 2.15) * strength
    img[:] = np.clip(img + fall[..., None] * color, 0, 255)
    return img


def draw_orbital_rings(img, cx, cy, radius, rot=-0.38, rx_mul=2.45, ry_mul=0.36):
    """Saturn-style elliptical rings, back half occluded by the disc."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    x0 = xx - cx
    y0 = yy - cy
    c, s = math.cos(rot), math.sin(rot)
    xr = x0 * c + y0 * s
    yr = -x0 * s + y0 * c
    rx = radius * rx_mul
    ry = radius * ry_mul
    e = np.sqrt((xr / rx) ** 2 + (yr / ry) ** 2 + 1e-9)
    planet = (x0 * x0 + y0 * y0) <= (radius * radius)

    rings = [
        (0.70, 0.010, 0.38, SILVER * 0.75),
        (0.82, 0.014, 0.72, INK * 0.92),
        (0.94, 0.008, 0.50, SILVER),
        (1.08, 0.006, 0.28, MUTED),
    ]
    # Paint back half first (yr < 0 is the far side), then the planet caller
    # paints the disc, then we paint the front half.
    return e, yr, planet, rings, rx, ry, rot


def paint_ring_side(img, e, yr, planet, rings, behind):
    for inner, width, alpha, col in rings:
        dist = np.abs(e - inner)
        band = dist < width
        if behind:
            vis = band & (yr < 0) & ~planet
        else:
            vis = band & (yr >= -width * 0.3)
            # front still draws over planet
        if not np.any(vis):
            continue
        glow = np.clip(1.0 - dist / width, 0, 1) ** 1.35
        a = (glow * alpha)[..., None]
        img[vis] = np.clip(img[vis] * (1 - a[vis]) + col * a[vis], 0, 255)


def paint_satellites(img, cx, cy, rx, ry, rot, scale, seed=5):
    rng = np.random.default_rng(seed)
    h, w = img.shape[:2]
    c, s = math.cos(rot), math.sin(rot)
    # Place along the brightest ring (0.82)
    n = 11
    for i in range(n):
        t = (i / n) * math.tau + 0.35
        # skip the far (behind) arc
        # local ellipse point
        lx = rx * 0.82 * math.cos(t)
        ly = ry * 0.82 * math.sin(t)
        if ly < 0:
            continue
        px = cx + lx * c - ly * s
        py = cy + lx * s + ly * c
        ix, iy = int(round(px)), int(round(py))
        r = 2 if rng.random() > 0.4 else 1
        if r + 1 <= ix < w - r - 1 and r + 1 <= iy < h - r - 1:
            img[iy - r : iy + r + 1, ix - r : ix + r + 1] = INK
            img[iy, ix] = np.array([255.0, 255.0, 255.0])


def planet(img, cx, cy, radius, light_dir, rot=-0.38, rx_mul=2.45, ry_mul=0.36):
    h, w = img.shape[:2]
    yy, xx = np.mgrid[:h, :w]
    dx = (xx - cx) / radius
    dy = (yy - cy) / radius
    r2 = dx * dx + dy * dy
    on = r2 <= 1.0
    z = np.zeros_like(r2)
    z[on] = np.sqrt(np.clip(1.0 - r2[on], 0, 1))

    lx, ly, lz = light_dir
    nrm = math.sqrt(lx * lx + ly * ly + lz * lz)
    lx, ly, lz = lx / nrm, ly / nrm, lz / nrm
    ndotl = dx * lx + dy * ly + z * lz
    lambert = np.clip(ndotl, 0, 1)

    # Dark world, thin sunlit crescent
    night = DARK * 0.55
    terminator = lerp(night, SILVER * 0.55, np.clip(lambert * 1.15 - 0.02, 0, 1) ** 0.85)
    day = lerp(terminator, INK * 0.78, lambert ** 3.2 * 0.55)

    # Quiet latitude banding
    bands = 0.94 + 0.06 * np.sin((dy * 5.4 + 0.3) * math.pi)
    day = day * bands[..., None]

    # Sun-facing atmosphere rim only
    edge = np.clip((np.sqrt(r2) - 0.78) / 0.22, 0, 1)
    rim = (edge ** 1.6) * np.clip(ndotl, 0, 1) ** 0.8
    day = day + rim[..., None] * INK * 0.55

    aa = np.clip((1.0 - np.sqrt(np.clip(r2, 0, 4))) * 28.0, 0, 1)

    e, yr, planet_mask, rings, rx, ry, rot = draw_orbital_rings(
        img, cx, cy, radius, rot=rot, rx_mul=rx_mul, ry_mul=ry_mul
    )
    paint_ring_side(img, e, yr, planet_mask, rings, behind=True)

    img[on] = day[on] * aa[on, None] + img[on] * (1 - aa[on, None])

    # Tight halo
    halo = (r2 > 1.0) & (r2 < 1.08)
    hstr = np.clip(1.0 - (np.sqrt(r2) - 1.0) / 0.08, 0, 1) ** 1.8
    hstr = hstr * np.clip(ndotl + 0.05, 0, 1)
    img[halo] = np.clip(img[halo] + hstr[halo, None] * SILVER * 0.28, 0, 255)

    paint_ring_side(img, e, yr, planet_mask, rings, behind=False)
    paint_satellites(img, cx, cy, rx, ry, rot, radius)
    return img


def tracked_text(draw, text, font, fill, x, y, tracking, anchor="lt"):
    sizes = [draw.textbbox((0, 0), ch, font=font) for ch in text]
    widths = [b[2] - b[0] for b in sizes]
    heights = [b[3] - b[1] for b in sizes]
    total = sum(widths) + tracking * max(len(text) - 1, 0)
    max_h = max(heights) if heights else 0
    if "m" in anchor[0]:
        x = x - total / 2
    if len(anchor) > 1 and anchor[1] == "m":
        y = y - max_h / 2
    cx0 = x
    for ch, tw in zip(text, widths):
        draw.text((x, y), ch, font=font, fill=fill)
        x += tw + tracking
    return total, max_h, cx0


def overlay_lockup(
    img_arr,
    title,
    tag,
    title_size,
    tag_size,
    tracking,
    cx,
    cy,
    tag_gap,
    title_fill,
    tag_fill,
    anchor="mm",
    rules=True,
):
    im = Image.fromarray(np.clip(img_arr, 0, 255).astype(np.uint8), "RGB")
    overlay = Image.new("RGBA", im.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    title_font = ImageFont.truetype(TITLE_FONT, title_size)
    tag_font = ImageFont.truetype(TAG_FONT, tag_size)

    tmp = ImageDraw.Draw(Image.new("RGB", (8, 8)))
    t_w, t_h, _ = tracked_text(tmp, title, title_font, (255, 255, 255), 0, 0, tracking, "lt")
    tag_bbox = tmp.textbbox((0, 0), tag, font=tag_font)
    tag_w = tag_bbox[2] - tag_bbox[0]
    tag_h = tag_bbox[3] - tag_bbox[1]
    block_h = t_h + tag_gap + tag_h

    if anchor == "mm":
        title_cy = cy - block_h / 2
        tracked_text(draw, title, title_font, title_fill, cx, title_cy, tracking, "mt")
        tag_y = title_cy + t_h + tag_gap
        draw.text((cx, tag_y), tag, font=tag_font, fill=tag_fill, anchor="ma")
        if rules:
            gap = 22
            y_line = tag_y + tag_h * 0.40
            left = cx - tag_w / 2 - gap
            right = cx + tag_w / 2 + gap
            rule_w = max(40, t_w * 0.07)
            col = (int(SILVER[0]), int(SILVER[1]), int(SILVER[2]), 150)
            draw.line([(left - rule_w, y_line), (left, y_line)], fill=col, width=2)
            draw.line([(right, y_line), (right + rule_w, y_line)], fill=col, width=2)
    elif anchor == "lt":
        tracked_text(draw, title, title_font, title_fill, cx, cy, tracking, "lt")
        draw.text((cx, cy + t_h + tag_gap), tag, font=tag_font, fill=tag_fill, anchor="lt")

    composed = Image.alpha_composite(im.convert("RGBA"), overlay)
    return np.array(composed.convert("RGB"), dtype=np.float64), (t_w, t_h, tag_w, tag_h, block_h)


def vignette(img, amount=0.40):
    h, w = img.shape[:2]
    yy, xx = np.ogrid[:h, :w]
    nx = (xx / (w - 1) - 0.5) * 2.0
    ny = (yy / (h - 1) - 0.5) * 2.0
    r = np.sqrt(nx * nx * 0.70 + ny * ny)
    v = np.clip(1.0 - np.clip(r - 0.38, 0, 1) ** 1.45 * amount, 0.48, 1.0)
    img *= v[..., None]
    return img


def film_grain(img, seed, amount=5.5):
    rng = np.random.default_rng(seed)
    noise = rng.normal(0, amount, img.shape[:2])
    img += noise[..., None]
    return np.clip(img, 0, 255)


def render_og(path):
    w, h = 2400, 1260
    img = starfield(h, w, seed=7, density=0.0021)
    add_glow(img, 2320, 400, 560, np.array([255.0, 248.0, 236.0]), 0.92)
    add_glow(img, 2140, 460, 260, SILVER, 0.38)
    add_glow(img, 1100, 620, 980, DARK, 0.28)
    planet(
        img,
        cx=1680,
        cy=860,
        radius=390,
        light_dir=(0.72, -0.18, 0.62),
        rot=-0.42,
        rx_mul=2.55,
        ry_mul=0.34,
    )
    vignette(img, 0.36)
    yy, xx = np.ogrid[:h, :w]
    scrim = np.exp(-((xx - w / 2) ** 2) / (2 * 620 ** 2) - ((yy - 520) ** 2) / (2 * 200 ** 2))
    img = img * (1 - scrim[..., None] * 0.50)

    img, metrics = overlay_lockup(
        img,
        title="HELION",
        tag="CLAIM THE SYSTEM",
        title_size=348,
        tag_size=38,
        tracking=34,
        cx=w / 2,
        cy=520,
        tag_gap=30,
        title_fill=(0xEC, 0xEC, 0xEF, 255),
        tag_fill=(0x8B, 0x8B, 0x93, 255),
        anchor="mm",
    )
    img = film_grain(img, 3, 4.2)
    Image.fromarray(img.astype(np.uint8), "RGB").save(path, "PNG")
    print("og raw", img.shape, "title_w", round(metrics[0]), "span", round(metrics[0] / w, 3))
    return metrics


def render_banner(path):
    w, h = 2400, 528
    img = starfield(h, w, seed=19, density=0.0025)
    add_glow(img, 2320, 150, 420, np.array([255.0, 248.0, 236.0]), 0.80)
    add_glow(img, 2080, 200, 200, SILVER, 0.32)
    planet(
        img,
        cx=1820,
        cy=310,
        radius=210,
        light_dir=(0.72, -0.16, 0.62),
        rot=-0.40,
        rx_mul=2.60,
        ry_mul=0.32,
    )
    vignette(img, 0.28)
    yy, xx = np.ogrid[:h, :w]
    left = np.clip(1.0 - (xx / (w * 0.52)), 0, 1) ** 1.15
    img = img * (1 - left[..., None] * 0.28) + BG * (left[..., None] * 0.28)

    img, metrics = overlay_lockup(
        img,
        title="HELION",
        tag="CLAIM THE SYSTEM",
        title_size=168,
        tag_size=24,
        tracking=18,
        cx=88,
        cy=56,
        tag_gap=12,
        title_fill=(0xEC, 0xEC, 0xEF, 255),
        tag_fill=(0x8B, 0x8B, 0x93, 255),
        anchor="lt",
        rules=False,
    )
    img = film_grain(img, 9, 3.8)
    Image.fromarray(img.astype(np.uint8), "RGB").save(path, "PNG")
    print("banner raw", img.shape, "title_w", round(metrics[0]), "end_y", 56 + metrics[4])
    return metrics


if __name__ == "__main__":
    os.makedirs(OUT_DIR, exist_ok=True)
    render_og(os.path.join(OUT_DIR, "og-raw.png"))
    render_banner(os.path.join(OUT_DIR, "banner-raw.png"))
