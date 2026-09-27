#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFO="$SCRIPT_DIR/info.json"

NAME=$(grep -o '"name": *"[^"]*"' "$INFO" | head -1 | sed 's/.*"\([^"]*\)"/\1/')
# Unversioned folder name: Factorio accepts either "<name>" or
# "<name>_<version>" for an unpacked mod, and refuses "<name>_<version>" when
# the version differs from info.json. With two release lines (master at 0.6.x,
# factorio-2.1 at 0.7.x) sharing one working tree, only the unversioned name
# survives a branch switch.
LINK_NAME="${NAME}"

MOD_DIRS=(
    "$HOME/factorio/mods"
    "$HOME/.factorio/mods"
    "$HOME/factorio2/mods"
    "$HOME/factorio-2.1/mods"
)

for dir in "${MOD_DIRS[@]}"; do
    if [[ ! -d "$dir" ]]; then
        echo "Skipping $dir (not found)"
        continue
    fi

    # Remove old symlinks pointing to this mod (versioned names from before,
    # and any stale unversioned one)
    for link in "$dir/${NAME}_"* "$dir/${NAME}"; do
        if [[ -L "$link" ]]; then
            echo "Removing old link: $link"
            rm "$link"
        fi
    done

    # Remove old packaged zips of this mod
    for zip in "$dir/${NAME}_"*.zip; do
        if [[ -f "$zip" ]]; then
            echo "Removing old zip: $zip"
            rm "$zip"
        fi
    done

    ln -s "$SCRIPT_DIR" "$dir/$LINK_NAME"
    echo "Created: $dir/$LINK_NAME -> $SCRIPT_DIR"
done
