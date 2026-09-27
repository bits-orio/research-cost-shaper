# Export format, v1

What the mod hands to the companion page. Written at every launch to
`script-output/research-cost-shaper/rcs-export.txt`, and shown in game by
`/rcs-export`. Overwritten each launch: it always describes the modpack that
is loaded now.

```
RCS1:<base64 of zlib-deflated JSON>
```

Same encoding as a blueprint string (`helpers.encode_string`). Decode by
stripping `RCS1:`, base64-decoding, and inflating (zlib).

```jsonc
{
  "format": 1,
  "curve": "v1; pts=0:2, 0.5:4, 1:10",      // the setting that produced new_* below
  "mods": [["base", "2.0.77"], ["space-age", "2.0.77"], ...],
  "techs": {
    "rocket-silo": {
      "kind": "count",                        // "count" | "formula" | "trigger"
      "skipped": "exempt",                    // absent unless unchanged: "trigger" | "exempt"
      "x": 0.722, "spent": 10965,             // curve position, science spent to reach it
      "multiplier": 5.92,
      "count": 1000, "new_count": 5921,       // count techs
      "formula": "1.2^L*1000",                // formula techs
      "new_formula": "(1.2^L*1000)*10",
      "time": 60, "new_time": 120,            // new_time absent when time=1
      "ingredients": [["automation-science-pack", 1], ...],
      "prerequisites": ["concrete", ...],     // encodes as {} when empty
      "trigger": {"type": "craft-item", "item": "tungsten-plate"},  // trigger techs: research_trigger as-is
      "max_level": "infinite"                 // levelled techs: number or "infinite"
    }
  }
}
```

Fields absent from a tech mean "not applicable" or "unchanged". `trigger` and
`max_level` were added after the first release; older exports lack them.

A levelled tech's level is the number at the end of its name
(`physical-projectile-damage-7` is level 7), as in the game; `count_formula`
is evaluated with `L` set to that level. The page
recomputes new costs from `x` and its own curve, and compares against
`new_count` to catch any disagreement with the game (±1 allowed for
rounding).
