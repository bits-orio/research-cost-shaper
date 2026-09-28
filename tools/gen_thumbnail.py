#!/usr/bin/env python3
"""Generate thumbnail.png: the mod-portal card, in the house style shared
with Multi-Team Support, Land Title Registry and Open Discord Bridge:
512x512, charcoal ground, a thin square frame, the three-letter mark, and a
grey subtitle in caps, at the same heights so the cards line up in a row on
the author page.

Three layers, back to front, inside the frame:

  - A research lab's glass seen up close. Factorio's lab is a dome made from a
    pentakis dodecahedron (a dodecahedron with a low five-sided pyramid on each
    face, 60 triangles). The same solid is built here, apexes pushed out to the
    sphere, and projected so large that its front panels tile the whole card:
    flat blue panels lit from one side, warm struts, lighter hubs where they
    meet. Drawn from geometry, not from the game's sprite. Like LTR's stripes,
    the texture stays inside the frame.
  - The cost curve, rising across it in the companion page's orange, with a
    soft dark edge so it reads over the glass.
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

CURVE = (240, 138, 62)
CURVE_WIDTH = 7
# The curve: low and flat on the left, climbing to the top right, as a
# "hard late game" curve looks on the page's log scale. Normalised 0..1.
CURVE_POINTS = [(0.0, 0.16), (0.3, 0.26), (0.55, 0.40), (0.78, 0.62), (1.0, 0.92)]

# The background: a lab's glass seen up close. The same pentakis dodecahedron
# the lab is built from, projected so large that its front panels tile the
# whole card. FACET_RADIUS is the sphere's radius in card pixels: below about
# 360 the panels that would cover the corners face away and leave gaps.
# PITCH and YAW turn the solid to choose which panels face the viewer.
FACET_RADIUS = 360
FACET_CENTRE = (256, 256)
FACET_PITCH = math.radians(12)
FACET_YAW = math.radians(18)
# Flat glass tones, darkest to brightest: a lab mid-research, kept dark
# enough to sit behind the mark.
GLASS = ((16, 38, 74), (20, 52, 100), (28, 72, 132), (44, 102, 172))
STRUT = (150, 142, 128)
HUB = (196, 186, 166)
LIGHT = (-0.5, 0.6, 0.62)

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


def turn(p):
    """Pitch then yaw the solid, choosing which panels face the viewer (+z)."""
    x, y, z = p
    c, s_ = math.cos(FACET_PITCH), math.sin(FACET_PITCH)
    y, z = y * c - z * s_, y * s_ + z * c
    c, s_ = math.cos(FACET_YAW), math.sin(FACET_YAW)
    x, z = x * c + z * s_, -x * s_ + z * c
    return (x, y, z)


def project(p):
    """Card coordinates (supersampled), looking straight at the sphere."""
    x, y, _ = p
    cx, cy = FACET_CENTRE
    r = FACET_RADIUS * SUPERSAMPLE
    return (cx * SUPERSAMPLE + r * x, cy * SUPERSAMPLE - r * y)


def draw_facets(img):
    """The front panels, flat-shaded back to front, then struts and hubs."""
    d = ImageDraw.Draw(img)
    light = normalise(LIGHT)
    faces = []
    for tri in pentakis_triangles():
        pts = [turn(v) for v in tri]
        normal = normalise(tuple(sum(p[i] for p in pts) for i in range(3)))
        if normal[2] <= 0:
            continue
        shade = max(0.0, dot(normal, light))
        tone = GLASS[min(len(GLASS) - 1, int(shade * len(GLASS)))]
        faces.append((normal[2], [project(p) for p in pts], tone))
    faces.sort(key=lambda f: f[0])
    for _, poly, tone in faces:
        d.polygon(poly, fill=tone)
    hubs = set()
    for _, poly, _ in faces:
        d.line(poly + [poly[0]], fill=STRUT, width=5 * SUPERSAMPLE, joint="curve")
        hubs.update((round(x), round(y)) for x, y in poly)
    hr = 5 * SUPERSAMPLE
    for x, y in hubs:
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
    # The texture stays inside the frame, as LTR's stripes do; the margin
    # outside it is plain ground like every card in the row.
    facets = Image.new("RGB", (S, S), BG)
    draw_facets(facets)
    lo, hi = inner_box()
    inside = Image.new("L", (S, S), 0)
    ImageDraw.Draw(inside).rectangle([lo, lo, hi, hi], fill=255)
    big.paste(facets, (0, 0), inside)
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
