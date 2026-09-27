#!/usr/bin/env bash
# Prints the Research Cost Shaper report for a modpack without opening the game.
#
#   tools/report.sh <2.0|2.1> [mods-dir]
#
# Runs headless Factorio with --dump-data in a throwaway directory. With a
# mods-dir, uses its mods, mod-list.json and mod-settings.dat (so your curve
# setting applies); this working tree replaces any installed copy of the mod.
# Without one, runs vanilla + Space Age with the default curve.
# Nothing in mods-dir or your Factorio user data is modified.
set -euo pipefail

VERSION="${1:?usage: tools/report.sh <2.0|2.1> [mods-dir]}"
MODS_SRC="${2:-}"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
GAME="${FACTORIO_ROOT:-$HOME/factorio-$VERSION}"
NAME="research-cost-shaper"

[[ -x "$GAME/bin/x64/factorio" ]] || { echo "No Factorio at $GAME (set FACTORIO_ROOT)" >&2; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/mods" "$WORK/write"

if [[ -n "$MODS_SRC" ]]; then
    for entry in "$MODS_SRC"/*; do
        base="$(basename "$entry")"
        case "$base" in
            "$NAME" | "$NAME"_*) ;;  # replaced by this working tree
            mod-list.json | mod-settings.dat) cp "$entry" "$WORK/mods/" ;;
            *) ln -s "$(realpath "$entry")" "$WORK/mods/$base" ;;
        esac
    done
else
    printf '%s' '{"mods":[{"name":"base","enabled":true},{"name":"space-age","enabled":true},{"name":"quality","enabled":true},{"name":"elevated-rails","enabled":true}]}' \
        > "$WORK/mods/mod-list.json"
fi

# This working tree, with info.json retargeted to the requested game version.
rsync -a --exclude .git --exclude site --exclude tests --exclude tools "$REPO/" "$WORK/mods/$NAME/"
sed -i -E "s/\"factorio_version\": \"[0-9.]+\"/\"factorio_version\": \"$VERSION\"/; s/\"base >= [0-9.]+\"/\"base >= $VERSION\"/" \
    "$WORK/mods/$NAME/info.json"
python3 - "$WORK/mods/mod-list.json" "$NAME" <<'PY'
import json, sys
path, name = sys.argv[1], sys.argv[2]
data = json.load(open(path))
mods = [m for m in data["mods"] if m["name"] != name] + [{"name": name, "enabled": True}]
json.dump({"mods": mods}, open(path, "w"))
PY

printf '[path]\nread-data=%s/data\nwrite-data=%s/write\n' "$GAME" "$WORK" > "$WORK/config.ini"

if ! "$GAME/bin/x64/factorio" --config "$WORK/config.ini" --mod-directory "$WORK/mods" --dump-data > "$WORK/run.out" 2>&1; then
    grep -iE 'error|failed' "$WORK/write/factorio-current.log" "$WORK/run.out" | head -20 >&2 || tail -20 "$WORK/run.out" >&2
    exit 1
fi

# The report is one log() call; print from its first line to the next log entry.
awk '/Research Cost Shaper report/{on=1} on && /^ *[0-9]+\.[0-9]+ /{if(seen)exit} on{seen=1; print}' \
    "$WORK/write/factorio-current.log"
