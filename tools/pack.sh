#!/usr/bin/env bash
# Build the distributable mod zip: <name>_<version>.zip, containing a single
# top-level <name>_<version>/ folder. That folder name is not cosmetic:
# Factorio refuses to load a mod whose zip root does not match it.
#
# This is the SINGLE source of packaging truth: a release workflow should
# call this script, so a zip built by hand for playtesting is byte-identical
# in content to the one that reaches the mod portal.
#
# Usage:  ./tools/pack.sh            # writes ./<name>_<version>.zip (Factorio 2.0)
#         ./tools/pack.sh 2.1        # the same code for Factorio 2.1
#
# Two release lines from one tree, as MTS numbers them: info.json carries the
# 2.0 line (odd minor: 0.1.x, 0.3.x, ...); the 2.1 zip is the same version with
# the minor bumped by one (0.2.x, 0.4.x, ...), declares factorio_version 2.1
# and base >= 2.1, and its changelog headers are mapped the same way.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

err() { echo "pack.sh: $*" >&2; exit 1; }

command -v rsync >/dev/null || err "rsync required"
command -v zip >/dev/null   || err "zip required"
[[ -f info.json ]]          || err "info.json not found"

# Parsed with grep rather than jq so packaging has no dependency the mod
# itself doesn't (link-mod.sh reads info.json the same way).
NAME=$(grep -o '"name": *"[^"]*"' info.json | head -1 | sed 's/.*"\([^"]*\)"/\1/')
VERSION=$(grep -o '"version": *"[^"]*"' info.json | head -1 | sed 's/.*"\([^"]*\)"/\1/')
[[ -n "$NAME" && -n "$VERSION" ]] || err "could not read name/version from info.json"

TARGET="${1:-2.0}"
bump_minor() { awk -F. '{ printf "%d.%d.%d", $1, $2 + 1, $3 }' <<<"$1"; }
case "$TARGET" in
    2.0) ;;
    2.1) VERSION=$(bump_minor "$VERSION") ;;
    *) err "unknown target '$TARGET' (expected 2.0 or 2.1)" ;;
esac
FOLDER="${NAME}_${VERSION}"

rm -rf "build/${FOLDER}" "${FOLDER}.zip"
mkdir -p "build/${FOLDER}"

# The mod portal rejects any zip containing exe / bat / ps1 / sh / py files.
# Those are stripped by extension rather than by location, so a script added
# outside tools/ later (link-mod.sh already sits at the repo root) cannot
# silently leak into a release.
#
# docs/, site/, spec/, tests/, worker/, dev/ and .run/ are repo-only: the
# portal copy and gallery, the companion web page, the format specs and their
# tests, the share service, the GUI run scripts, and their local artefacts. None of it is of any use inside the shipped mod, and dev/
# and .run/ in particular can hold whole throwaway Factorio saves. The
# ignored local artefacts (build/, .run/, editor workspaces) never exist on
# a CI checkout but do exist locally, so they are excluded explicitly:
# otherwise a hand-built zip would differ from the published one.
# -m prunes empty directories. Git cannot track an empty directory, so one
# that exists in a working tree is absent from a CI checkout. Without this,
# a hand-built zip and the published one differ by exactly those entries.
rsync -am --exclude='.git' \
         --exclude='.github' \
         --exclude='.gitignore' \
         --exclude='.gitattributes' \
         --exclude='.claude' \
         --exclude='.vscode' \
         --exclude='.luarc.json' \
         --exclude='build' \
         --exclude='.run' \
         --exclude='.worktrees' \
         --exclude='dev' \
         --exclude='docs' \
         --exclude='site' \
         --exclude='spec' \
         --exclude='tests' \
         --exclude='worker' \
         --exclude='node_modules' \
         --exclude='__pycache__' \
         --exclude='DESIGN.md' \
         --exclude='CONTEXT.md' \
         --exclude='tools' \
         --exclude='*.code-workspace' \
         --exclude='*.zip' \
         --exclude='*.sh' \
         --exclude='*.py' \
         --exclude='*.bat' \
         --exclude='*.ps1' \
         --exclude='*.exe' \
         ./ "build/${FOLDER}/"

if [[ "$TARGET" == "2.1" ]]; then
    INFO="build/${FOLDER}/info.json"
    sed -i -E "s/\"version\": *\"[^\"]*\"/\"version\": \"${VERSION}\"/; s/\"factorio_version\": *\"[^\"]*\"/\"factorio_version\": \"2.1\"/; s/\"base >= [0-9.]+\"/\"base >= 2.1\"/" "$INFO"
    grep -q "\"version\": \"${VERSION}\"" "$INFO" && grep -q '"factorio_version": "2.1"' "$INFO" \
        || err "could not retarget info.json to 2.1"
    CHANGELOG="build/${FOLDER}/changelog.txt"
    if [[ -f "$CHANGELOG" ]]; then
        awk -F. '/^Version: / { split($0, v, " "); split(v[2], n, "."); printf "Version: %d.%d.%d\n", n[1], n[2] + 1, n[3]; next } { print }' \
            "$CHANGELOG" > "$CHANGELOG.new" && mv "$CHANGELOG.new" "$CHANGELOG"
    fi
fi

( cd build && zip -qr "../${FOLDER}.zip" "${FOLDER}" )

# Fail loudly here rather than at upload time, when the portal's error is
# terse and the tag has already been pushed.
[[ -f "build/${FOLDER}/info.json" ]] || err "packaged tree has no info.json"
[[ -f "build/${FOLDER}/control.lua" ]] || err "packaged tree has no control.lua"

BANNED=$(unzip -Z1 "${FOLDER}.zip" | grep -iE '\.(sh|py|bat|ps1|exe)$' || true)
[[ -z "$BANNED" ]] || err "zip contains portal-rejected files:"$'\n'"$BANNED"

ROOTS=$(unzip -Z1 "${FOLDER}.zip" | cut -d/ -f1 | sort -u)
[[ "$ROOTS" == "$FOLDER" ]] || err "zip root is '${ROOTS}', expected exactly '${FOLDER}'"

rm -rf "build/${FOLDER}"
rmdir build 2>/dev/null || true
echo "built ${REPO_ROOT}/${FOLDER}.zip  ($(du -h "${FOLDER}.zip" | cut -f1), $(unzip -Z1 "${FOLDER}.zip" | wc -l) entries)"
