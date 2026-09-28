# Research Cost Shaper

> Research costs on a curve you draw, checked tech by tech before you play.

[![Discord](https://img.shields.io/badge/Discord-join%20the%20server-5865F2?logo=discord&logoColor=white)](https://discord.gg/tWz4FT74pH) [![GitHub](https://img.shields.io/badge/GitHub-source-181717?logo=github&logoColor=white)](https://github.com/bits-orio/research-cost-shaper) [![Companion page](https://img.shields.io/badge/Companion%20page-design%20your%20curve-e0782c)](https://bits-orio.github.io/research-cost-shaper/)

A flat cost multiplier makes red science as painful as the endgame. Research Cost Shaper lets you decide how hard each stage is: a gentle start and a brutal Aquilo, a grindy early game that eases off, or anything in between. You draw the curve on a companion web page against your own modpack's tech tree, see every tech's new cost and how long each science tier takes at your SPM, then paste one line into the mod settings.

## Status

First release. Tested on Factorio 2.0 and 2.1, with and without Space Age. Costs are applied when the game loads, so it can be added to an existing save and the curve can be changed between sessions.

## Quick start

1. Install the mod and start Factorio once. It writes `rcs-export.txt` for your modpack into `script-output/research-cost-shaper/` in your Factorio folder.
2. Open the [companion page](https://bits-orio.github.io/research-cost-shaper/) and import that file (or type `/rcs-export` in game and paste the text).
3. Drag the curve until the costs look right: per tech, per science pack, and in hours at your SPM.
4. Click Copy for mod settings, paste it into Settings, Mod settings, Startup, Cost curve, and restart.
5. In game, `/rcs-check` confirms every tech has the cost the page showed you.

## Features

### In the game
- One multiplier curve across the whole tech tree, from the first research to the last
- Separate multipliers for infinite research and for research time
- Techs are placed by the science spent to reach them, so a new mod's techs land where their cost puts them
- Techs that opt out of cost multipliers, and trigger techs, are left alone
- `/rcs-check` reports any tech a later mod or the map's price multiplier changed after the curve was applied

### On the companion page
- Drag control points on a log-scale curve, with a marker where each science pack unlocks
- The whole tech tree, coloured by new cost: click a tech to see what it takes to reach it
- Totals per science pack set and hours at your SPM, so a weekly server can plan its week
- Save runs in your browser, or share one with a short link that shows the modpack and curve

## Compatibility

Works with any mod that adds technologies, in Factorio 2.0 and 2.1, with or without Space Age. Do not combine it with another research cost mod such as Technology Overload: the multipliers stack. Leave the map's technology price multiplier at 1 and do the shaping here; `/rcs-check` tells you if something else is changing costs.

## Works with

Part of the MTS family. Research Cost Shaper is fully standalone and needs nothing else installed, but it sits well beside:

- [Multi-Team Support](https://mods.factorio.com/mod/multi-team-support) gives every team its own copy of the map. Every team researches against the same curve, so races stay fair.
- [Open Discord Bridge](https://mods.factorio.com/mod/open-discord-bridge) relays research and chat to Discord. Post the week's share link there and players see the costs before they join.

## Credits

Research Cost Shaper grew out of many weekly runs with [Technology Overload](https://mods.factorio.com/mod/technology-overload) by RedRafe, which showed that research cost can be shaped across the tech tree instead of multiplied flat. This mod lets you draw that shape yourself. It is a separate mod with its own code.

## Links

- [Companion page](https://bits-orio.github.io/research-cost-shaper/)
- [GitHub](https://github.com/bits-orio/research-cost-shaper)
- [Discord](https://discord.gg/tWz4FT74pH)

## Development

Developed with AI coding assistants alongside human review and in-game testing. Issues and pull requests are welcome on [GitHub](https://github.com/bits-orio/research-cost-shaper).

License: MIT
