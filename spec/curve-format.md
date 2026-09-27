# Curve string format, v1

The one line that travels between the web page and the mod setting.

```
v1; pts=0:2, 0.3:5, 0.8:40, 1:150; inf=60; time=2
```

Sections are separated by `;`. Whitespace around any token is ignored. Empty
sections are ignored, so a trailing `;` is fine.

| Section | Required | Meaning |
|---|---|---|
| `v1` | yes, first | Format version. |
| `pts=x:m, x:m, ...` | yes | Control points. `x` is progress from 0 to 1, strictly increasing. `m` is the cost multiplier at that point, greater than 0. One point means a flat multiplier. |
| `inf=m` | no | Multiplier for techs whose cost is a formula (infinite and leveled research). Defaults to the curve's value at x = 1. |
| `time=m` | no | Multiplier for research time per unit. Defaults to 1. |

Numbers are plain decimals, optionally with an exponent (`1e3`). Hex,
`Infinity` and `NaN` are rejected. Unknown or repeated sections are errors, so
a typo fails loudly at startup instead of being silently ignored.

## Evaluation

- Left of the first point the curve holds the first multiplier; right of the
  last it holds the last.
- Between points it is a monotone cubic (Fritsch-Carlson) through
  `(x, ln m)`. So it passes through every point, never overshoots between
  them, and interpolates ratios: halfway between 4x and 100x is 20x.
- Two points give a straight line in log space (a constant growth rate).

## The x-axis

`x` for a tech is the natural log of the science spent to reach and finish it
(its own packs plus every distinct ancestor's, each counted once), scaled so
the cheapest tech is 0 and the most expensive is 1. See `lib/progress.lua`.

## Implementations

`lib/curve.lua` (game) and `site/curve.js` (page) are line-for-line ports.
`spec/curve-cases.json` holds shared cases; `tests/test_lua.py` also sweeps
both implementations against each other.
