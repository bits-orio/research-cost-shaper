#!/usr/bin/env python3
"""Generate thumbnail.png: the mod-portal card, in the house style shared
with Multi-Team Support, Land Title Registry and Open Discord Bridge:
512x512, charcoal ground, a thin square frame, the three-letter mark, and a
grey subtitle in caps, at the same heights so the cards line up in a row on
the author page.

The letters wear the first three science pack colours, the ones every curve
starts from:

    R   automation   red
    C   logistic     green
    S   chemical     blue

Behind them sits what the mod is about: a cost curve rising across a faint
log-scale grid, in the companion page's orange. As on LTR's card, a centred
black halo separates the letters from what is under them without changing
the letters themselves.

Drawn at SUPERSAMPLE times the size and scaled down, so the curve stays smooth.

Run from the repo root:  python3 tools/gen_thumbnail.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

SIZE = 512
SUPERSAMPLE = 2
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

GRID = (58, 58, 58)
CURVE = (240, 138, 62)
CURVE_WIDTH = 7
# The curve: low and flat on the left, climbing to the top right, as a
# "hard late game" curve looks on the page's log scale. Normalised 0..1.
CURVE_POINTS = [(0.0, 0.16), (0.3, 0.26), (0.55, 0.40), (0.78, 0.62), (1.0, 0.92)]


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


def underlay():
    """Grid and curve inside the frame, drawn large and scaled down."""
    s = SIZE * SUPERSAMPLE
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    lo = (FRAME_INSET + FRAME_WIDTH) * SUPERSAMPLE
    hi = s - lo
    span = hi - lo
    for i in range(1, 6):
        v = lo + span * i / 6
        d.line([(v, lo), (v, hi)], fill=GRID, width=2 * SUPERSAMPLE)
        d.line([(lo, v), (hi, v)], fill=GRID, width=2 * SUPERSAMPLE)
    pad = span * 0.08
    xy = [(lo + pad + (span - 2 * pad) * x, hi - pad - (span - 2 * pad) * y) for x, y in smooth(CURVE_POINTS)]
    d.line(xy, fill=CURVE, width=CURVE_WIDTH * SUPERSAMPLE, joint="curve")
    r = CURVE_WIDTH * SUPERSAMPLE * 1.6
    for x, y in CURVE_POINTS:
        cx, cy = lo + pad + (span - 2 * pad) * x, hi - pad - (span - 2 * pad) * y
        d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BG, outline=CURVE, width=3 * SUPERSAMPLE)
    return img.resize((SIZE, SIZE), Image.Resampling.LANCZOS)


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
    img = underlay()
    d = ImageDraw.Draw(img)
    far = SIZE - 1 - FRAME_INSET
    d.rectangle([FRAME_INSET, FRAME_INSET, far, far], outline=FRAME, width=FRAME_WIDTH)

    layer, (left, top, right, bottom) = draw_letters()
    offset = (round(SIZE / 2 - (left + right) / 2), round(LETTERS_CENTRE_Y - (top + bottom) / 2))
    img.paste(glow_for(layer), offset, glow_for(layer))
    img.paste(layer, offset, layer)

    # The subtitle gets the same halo, so the curve passing behind it
    # doesn't cut through the letters.
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
