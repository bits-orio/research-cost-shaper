# Research Cost Shaper

A Factorio mod that multiplies research costs along a curve you design. You
set the multiplier for early, mid and late game, and the mod works out where
every tech in your modpack falls on that curve. A companion web page shows
each tech's new cost before you start a run.

## Status

Early development. The curve maths is done and tested; the mod does not
change costs yet.

## How it works

1. Each tech gets a progress position `x` from 0 to 1: the log of the science
   spent to reach it, with shared prerequisites counted once. This is
   independent of how deep or tangled the modpack's tech tree is.
2. The curve maps `x` to a multiplier. It is defined by control points and
   drawn as a smooth monotone curve in log space.
3. The curve is one line of text, e.g. `v1; pts=0:2, 0.5:4, 1:10`, which you
   paste into the mod setting. Full format: [spec/curve-format.md](spec/curve-format.md).

## Layout

```
info.json, settings.lua, lib/, locale/   the mod
site/                                    companion web page (GitHub Pages)
spec/                                    curve format and shared test cases
tests/                                   Lua (5.2, via lupa) and JS tests
tools/test.sh                            runs both test suites
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
