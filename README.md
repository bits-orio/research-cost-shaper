# Research Cost Shaper

A Factorio mod that multiplies research costs along a curve you design. You
set the multiplier for early, mid and late game, and the mod works out where
every tech in your modpack falls on that curve. A companion web page shows
each tech's new cost before you start a run.

## Status

Early development, targeting Factorio 2.0 (2.1 build to follow from the same
code). The mod applies the curve at every game launch to whatever techs your
modpack has, and writes a per-tech cost report to `factorio-current.log`. The
companion page and the export are not built yet.

## How it works

1. Each tech gets a progress position `x` from 0 to 1: the log of the science
   spent to reach it, with shared prerequisites counted once. This is
   independent of how deep or tangled the modpack's tech tree is.
2. The curve maps `x` to a multiplier. It is defined by control points and
   drawn as a smooth monotone curve in log space.
3. The curve is one line of text, e.g. `v1; pts=0:2, 0.5:4, 1:10`, which you
   paste into the mod setting. Full format: [spec/curve-format.md](spec/curve-format.md).

## Credits

Research Cost Shaper grew out of a lot of runs with
[Technology Overload](https://mods.factorio.com/mod/technology-overload) by
RedRafe ([source](https://github.com/RedRafe/technology-overload)). It has been
a regular on my weekly server for a long time. Technology Overload showed that
research cost doesn't have to be one flat multiplier: its Funnel, Spiral and
Fibonacci modes shape costs across the whole tech tree. This mod takes that
idea and lets you draw the shape yourself.

It is a separate mod with its own code, not a fork, and RedRafe is not
involved in it. If you like fixed, well-tested presets, Technology Overload is
well worth a look.

## Layout

```
info.json, settings.lua, lib/, locale/   the mod
site/                                    companion web page (GitHub Pages)
spec/                                    curve format and shared test cases
tests/                                   Lua (5.2, via lupa) and JS tests
tools/test.sh                            runs both test suites
tools/report.sh <2.0|2.1> [mods-dir]     prints the cost report for a modpack
                                         using headless Factorio
```

## Development

Tests need Python 3 with `lupa` and Node 18+:

```
tools/test.sh
```

`./link-mod.sh` symlinks the repo into your Factorio mods folders.

Developed with AI coding assistants alongside human review and in-game testing.

## License

MIT, see [LICENSE](LICENSE).
