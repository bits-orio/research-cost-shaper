#!/usr/bin/env python3
"""Generate thumbnail.png: the mod-portal card, in the house style shared
with Multi-Team Support, Land Title Registry and Open Discord Bridge:
512x512, charcoal ground, a thin square frame, the three-letter mark, and a
grey subtitle in caps, at the same heights so the cards line up in a row on
the author page.

Three layers, back to front:

  - A research lab, as flat art. Factorio's lab is the top half of a pentakis
    dodecahedron (a dodecahedron with a low five-sided pyramid on each face,
    60 triangles), glowing blue while it researches, on a dark base ring. It
    is not the game's sprite: the solid is built here, apexes pushed out to
    the sphere so it reads as a geodesic dome, stood on one apex, cut at the
    equator and viewed from a little above. Each panel gets one of a few flat
    blues from a single light, and the base ring's indicator lights wear the
    science pack colours.
  - The cost curve, rising across the lab in the companion page's orange.
  - The mark, RCS, in the first three science pack colours, and the subtitle.
    As on LTR's card, a centred black halo separates them from what is under
    them without changing the letters themselves.

Drawn at SUPERSAMPLE times the size and scaled down, so edges stay smooth.

Run from the repo root:  python3 tools/gen_thumbnail.py
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 512
SUPERSAMPLE = 2
S = SIZE * SUPERSAMPLE
BG = (43, 43, 43)
FRAME = (64, 64, 64)
FRAME_INSET = 14
FRAME_WIDTH = 8
SUBTITLE_FILL = (154, 160, 166)

HALO = (0, 0, 0)
HALO_RADIUS = 8
HALO_STRENGTH = 1.5

LETTERS = "RCS"
# Science pack colours from site/app.js, lifted a little for a dark ground.
LETTER_COLORS = ((232, 72, 64), (70, 186, 86), (70, 150, 232))
SUBTITLE = "RESEARCH COSTS"

LETTERS_CENTRE_Y = 220
SUBTITLE_CENTRE_Y = 426

FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LETTER_SIZE = 185
SUBTITLE_SIZE = 44

GRID = (52, 52, 52)
CURVE = (240, 138, 62)
CURVE_WIDTH = 7
# The curve: low and flat on the left, climbing to the top right, as a
# "hard late game" curve looks on the page's log scale. Normalised 0..1.
CURVE_POINTS = [(0.0, 0.16), (0.3, 0.26), (0.55, 0.40), (0.78, 0.62), (1.0, 0.92)]

# The lab, in card pixels: centre of the base ring, radius, how far the viewer
# looks down on it, and how far it is turned about its vertical axis.
LAB_CENTRE = (256, 330)
LAB_RADIUS = 184
LAB_TILT = math.radians(20)
LAB_YAW = math.radians(18)
# Flat glass tones, darkest to brightest: a lab mid-research.
GLASS = ((16, 40, 80), (22, 60, 116), (32, 88, 158), (58, 128, 200))
STRUT = (178, 168, 150)
HUB = (214, 204, 184)
BASE = (46, 50, 56)
BASE_EDGE = (74, 80, 88)
GLOW = (40, 110, 220)
LIGHT = (-0.45, 0.65, 0.6)
PACK_LIGHTS = ((232, 72, 64), (70, 186, 86), (70, 150, 232), (160, 90, 210), (230, 190, 50))

PHI = (1 + 5 ** 0.5) / 2


def normalise(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def pentakis_triangles():
    """The 60 faces of a pentakis dodecahedron, every vertex on the unit sphere.

    Dodecahedron corners, plus one apex over each of its 12 pentagons (the
    pentagon centres are the icosahedron's vertices). Each pentagon becomes
    five triangles fanned from its apex.
    """
    corners = [(x, y, z) for x in (-1, 1) for y in (-1, 1) for z in (-1, 1)]
    for a in (-1, 1):
        for b in (-1, 1):
            corners += [(0, a / PHI, b * PHI), (a / PHI, b * PHI, 0), (a * PHI, 0, b / PHI)]
    corners = [normalise(c) for c in corners]
    apexes = []
    for a in (-1, 1):
        for b in (-1, 1):
            apexes += [(0, a * PHI, b), (a * PHI, b, 0), (a, 0, b * PHI)]
    apexes = [normalise(c) for c in apexes]

    tris = []
    for apex in apexes:
        ring = sorted(corners, key=lambda c: -dot(c, apex))[:5]
        # Order the pentagon's corners around the apex.
        ref = normalise(tuple(ring[0][i] - apex[i] * dot(ring[0], apex) for i in range(3)))
        side = normalise((apex[1] * ref[2] - apex[2] * ref[1], apex[2] * ref[0] - apex[0] * ref[2], apex[0] * ref[1] - apex[1] * ref[0]))
        ring.sort(key=lambda c: math.atan2(dot(c, side), dot(c, ref)))
        for i in range(5):
            tris.append((apex, ring[i], ring[(i + 1) % 5]))
    return tris


def orient(p):
    """Stand the solid on an apex: turn (0, PHI, 1) to straight up, then yaw."""
    t = math.atan2(1, PHI)
    x, y, z = p
    y, z = y * math.cos(t) + z * math.sin(t), -y * math.sin(t) + z * math.cos(t)
    x, z = x * math.cos(LAB_YAW) + z * math.sin(LAB_YAW), -x * math.sin(LAB_YAW) + z * math.cos(LAB_YAW)
    return (x, y, z)


def clip_above_equator(poly):
    """Sutherland-Hodgman against y >= 0: the dome is the solid's top half."""
    out = []
    for i, cur in enumerate(poly):
        prev = poly[i - 1]
        if cur[1] >= 0:
            if prev[1] < 0:
                t = prev[1] / (prev[1] - cur[1])
                out.append(tuple(prev[k] + (cur[k] - prev[k]) * t for k in range(3)))
            out.append(cur)
        elif prev[1] >= 0:
            t = prev[1] / (prev[1] - cur[1])
            out.append(tuple(prev[k] + (cur[k] - prev[k]) * t for k in range(3)))
    return out


def project(p):
    """Card coordinates (supersampled) for a point, seen from a little above."""
    x, y, z = p
    cx, cy = LAB_CENTRE
    r = LAB_RADIUS * SUPERSAMPLE
    return (cx * SUPERSAMPLE + r * x, cy * SUPERSAMPLE - r * (y * math.cos(LAB_TILT) - z * math.sin(LAB_TILT)))


def draw_lab(img):
    d = ImageDraw.Draw(img)
    view = (0, math.sin(LAB_TILT), math.cos(LAB_TILT))
    light = normalise(LIGHT)
    cx, cy = (c * SUPERSAMPLE for c in LAB_CENTRE)
    r = LAB_RADIUS * SUPERSAMPLE

    # Glow: the blue a working lab throws on the ground around it.
    glow = Image.new("L", img.size, 0)
    ImageDraw.Draw(glow).ellipse([cx - r * 1.12, cy - r * 1.02, cx + r * 1.12, cy + r * 0.34], fill=150)
    glow = glow.filter(ImageFilter.GaussianBlur(28 * SUPERSAMPLE))
    img.paste(Image.new("RGB", img.size, GLOW), (0, 0), glow)

    # Base ring: the front half of the equator, dropped into a band, with
    # socket lights in the science pack colours.
    band = 16 * SUPERSAMPLE
    equator = lambda deg: project((math.sin(math.radians(deg)), 0, math.cos(math.radians(deg))))
    front = [equator(t) for t in range(-90, 91, 3)]
    d.polygon(front + [(x, y + band) for x, y in reversed(front)], fill=BASE)
    d.line(front, fill=BASE_EDGE, width=3 * SUPERSAMPLE)
    for k, t in enumerate(range(-75, 76, 15)):
        x, y = equator(t)
        w = 9 * SUPERSAMPLE * math.cos(math.radians(t)) + 2 * SUPERSAMPLE
        top = y + 3.5 * SUPERSAMPLE
        d.rounded_rectangle([x - w, top, x + w, top + 9 * SUPERSAMPLE], radius=2 * SUPERSAMPLE, fill=(28, 30, 34))
        lr = 3 * SUPERSAMPLE
        mid = top + 4.5 * SUPERSAMPLE
        d.ellipse([x - lr, mid - lr, x + lr, mid + lr], fill=PACK_LIGHTS[k % len(PACK_LIGHTS)])

    # Glass panels, flat-shaded back to front, then the struts over them.
    faces = []
    for tri in pentakis_triangles():
        poly = clip_above_equator([orient(v) for v in tri])
        if len(poly) < 3:
            continue
        normal = normalise(tuple(sum(v[i] for v in (orient(u) for u in tri)) for i in range(3)))
        facing = dot(normal, view)
        if facing <= 0:
            continue
        shade = max(0.0, dot(normal, light))
        tone = GLASS[min(len(GLASS) - 1, int(shade * len(GLASS)))]
        faces.append((facing, [project(p) for p in poly], tone))
    faces.sort(key=lambda f: f[0])
    for _, poly, tone in faces:
        d.polygon(poly, fill=tone)
    hubs = set()
    for _, poly, _ in faces:
        d.line(poly + [poly[0]], fill=STRUT, width=4 * SUPERSAMPLE, joint="curve")
        hubs.update((round(x), round(y)) for x, y in poly)
    hr = 3.5 * SUPERSAMPLE
    base_y = cy
    for x, y in hubs:
        if y < base_y - 2 * SUPERSAMPLE:  # clipped points on the equator are not hubs
            d.ellipse([x - hr, y - hr, x + hr, y + hr], fill=HUB)


def smooth(points, steps=64):
    """Catmull-Rom through the control points, for a hand-drawn-looking curve."""
    pts = [points[0]] + points + [points[-1]]
    out = []
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i - 1], pts[i], pts[i + 1], pts[i + 2]
        for s in range(steps):
            t = s / steps
            t2, t3 = t * t, t * t * t
            out.append(tuple(
                0.5 * (2 * p1[k] + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2
                       + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3)
                for k in (0, 1)))
    out.append(points[-1])
    return out


def inner_box():
    lo = (FRAME_INSET + FRAME_WIDTH) * SUPERSAMPLE
    return lo, S - lo


def draw_grid(img):
    d = ImageDraw.Draw(img)
    lo, hi = inner_box()
    for i in range(1, 6):
        v = lo + (hi - lo) * i / 6
        d.line([(v, lo), (v, hi)], fill=GRID, width=2 * SUPERSAMPLE)
        d.line([(lo, v), (hi, v)], fill=GRID, width=2 * SUPERSAMPLE)


def draw_curve(img):
    """The curve on its own layer with a soft dark halo, so it reads over the lab."""
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    lo, hi = inner_box()
    span = hi - lo
    pad = span * 0.08
    at = lambda x, y: (lo + pad + (span - 2 * pad) * x, hi - pad - (span - 2 * pad) * y)
    d.line([at(x, y) for x, y in smooth(CURVE_POINTS)], fill=CURVE + (255,), width=CURVE_WIDTH * SUPERSAMPLE, joint="curve")
    r = CURVE_WIDTH * SUPERSAMPLE * 1.6
    for x, y in CURVE_POINTS:
        cx, cy = at(x, y)
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BG + (255,), outline=CURVE + (255,), width=3 * SUPERSAMPLE)
    shadow = layer.getchannel("A").filter(ImageFilter.GaussianBlur(5 * SUPERSAMPLE)).point(lambda v: min(255, int(v * 1.3)))
    img.paste(Image.new("RGB", img.size, HALO), (0, 0), shadow)
    img.paste(layer, (0, 0), layer)


def draw_letters():
    """The mark on its own layer, so it can be centred by its inked box."""
    layer = Image.new("RGBA", (SIZE * 2, SIZE * 2), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    font = ImageFont.truetype(FONT, LETTER_SIZE)
    x = SIZE / 2
    for ch, color in zip(LETTERS, LETTER_COLORS):
        d.text((x, SIZE / 2), ch, font=font, fill=color)
        x += d.textlength(ch, font=font)
    return layer, layer.getbbox()


def glow_for(layer):
    alpha = layer.getchannel("A").filter(ImageFilter.GaussianBlur(HALO_RADIUS))
    alpha = alpha.point(lambda v: min(255, int(v * HALO_STRENGTH)))
    halo = Image.new("RGBA", layer.size, HALO + (0,))
    halo.putalpha(alpha)
    return halo


def build():
    big = Image.new("RGB", (S, S), BG)
    draw_grid(big)
    draw_lab(big)
    draw_curve(big)
    img = big.resize((SIZE, SIZE), Image.Resampling.LANCZOS)

    d = ImageDraw.Draw(img)
    far = SIZE - 1 - FRAME_INSET
    d.rectangle([FRAME_INSET, FRAME_INSET, far, far], outline=FRAME, width=FRAME_WIDTH)

    layer, (left, top, right, bottom) = draw_letters()
    offset = (round(SIZE / 2 - (left + right) / 2), round(LETTERS_CENTRE_Y - (top + bottom) / 2))
    img.paste(glow_for(layer), offset, glow_for(layer))
    img.paste(layer, offset, layer)

    sub = Image.new("RGBA", img.size, (0, 0, 0, 0))
    ImageDraw.Draw(sub).text((SIZE / 2, SUBTITLE_CENTRE_Y), SUBTITLE,
                             font=ImageFont.truetype(FONT, SUBTITLE_SIZE), fill=SUBTITLE_FILL, anchor="mm")
    img.paste(glow_for(sub), (0, 0), glow_for(sub))
    img.paste(sub, (0, 0), sub)
    return img


def main():
    root = Path(__file__).resolve().parent.parent
    out = root / "thumbnail.png"
    build().save(out, optimize=True)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
