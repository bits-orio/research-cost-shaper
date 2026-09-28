#!/usr/bin/env bash
# Launch a graphical client, isolated from the player's own config and saves
# (private write-data under .run/gui), for screenshots and GUI checks.
# Drive it with dev/gui-drive.sh.
#   usage: dev/run-gui.sh menu            start at the main menu
#          dev/run-gui.sh game            create and load a Space Age game
#   RCS_CURVE=<curve>  the Cost curve setting to use (default: the mod's default)
#   RCS_SIZE=<WxH>     window size (default 1600x900)
set -uo pipefail
FACTORIO="${FACTORIO:-$HOME/factorio-2.0/bin/x64/factorio}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN="$REPO/.run/gui"
MODE="${1:-menu}"
rm -rf "$RUN/mods" "$RUN/game.zip"; mkdir -p "$RUN/mods" "$RUN/userdata"
ln -s "$REPO" "$RUN/mods/research-cost-shaper"
cat > "$RUN/mods/mod-list.json" <<JSON
{ "mods": [
  { "name": "base", "enabled": true }, { "name": "elevated-rails", "enabled": true },
  { "name": "quality", "enabled": true }, { "name": "space-age", "enabled": true },
  { "name": "research-cost-shaper", "enabled": true } ] }
JSON
cat > "$RUN/config.ini" <<INI
[path]
read-data=__PATH__executable__/../../data
write-data=$RUN/userdata
[graphics]
full-screen=false
INI
if [[ -n "${RCS_CURVE:-}" ]]; then
  # Startup settings live in mod-settings.dat; the simplest way to set one
  # without the GUI is to change the default the mod declares, in a copy.
  rm "$RUN/mods/research-cost-shaper"
  rsync -a --exclude .git --exclude .run --exclude site --exclude worker "$REPO/" "$RUN/mods/research-cost-shaper/"
  sed -i "s|default_value = \"v1; pts=0:2, 0.5:4, 1:10\"|default_value = \"${RCS_CURVE}\"|" "$RUN/mods/research-cost-shaper/settings.lua"
fi
ARGS=(--config "$RUN/config.ini" --mod-directory "$RUN/mods" --window-size "${RCS_SIZE:-1600x900}")
if [[ "$MODE" == "game" ]]; then
  "$FACTORIO" --config "$RUN/config.ini" --create "$RUN/game.zip" --mod-directory "$RUN/mods" --map-gen-seed 1 > "$RUN/create.log" 2>&1 \
    || { tail -20 "$RUN/create.log"; exit 1; }
  ARGS+=(--load-game "$RUN/game.zip")
fi
nohup "$FACTORIO" "${ARGS[@]}" > "$RUN/client.log" 2>&1 &
echo $! > "$RUN/pid"; echo "pid=$(cat "$RUN/pid")"
