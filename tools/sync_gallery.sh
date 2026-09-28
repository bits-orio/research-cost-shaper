#!/usr/bin/env bash
# Deploy the portal gallery from docs/gallery/*.png, in file-name order.
# Images already on the portal (same SHA1, which is the portal's image id)
# are not uploaded again, so re-running only fixes the order.
#
# Usage: tools/sync_gallery.sh [--dry-run]
# Env:   FACTORIO_API_KEY with the "ModPortal: Edit Mods" scope.
# API:   https://wiki.factorio.com/Mod_images_API
set -euo pipefail
cd "$(dirname "$0")/.."
command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }
MOD=$(jq -r .mod tools/portal_meta.json)
shopt -s nullglob
FILES=(docs/gallery/*.png)
[[ ${#FILES[@]} -gt 0 ]] || { echo "no images in docs/gallery" >&2; exit 1; }

LIVE=$(curl -fsSL "https://mods.factorio.com/api/mods/${MOD}/full?_=$(date +%s%N)" | jq -r '.images[]?.id' || true)
IDS=()
for f in "${FILES[@]}"; do
    id=$(sha1sum "$f" | cut -d' ' -f1)
    if grep -qx "$id" <<<"$LIVE"; then
        echo "on portal already: $f"
    elif [[ "${1:-}" == "--dry-run" ]]; then
        echo "would upload: $f"
    else
        : "${FACTORIO_API_KEY:?FACTORIO_API_KEY env var not set}"
        url=$(curl -sS -H "Authorization: Bearer ${FACTORIO_API_KEY}" -F "mod=${MOD}" \
            https://mods.factorio.com/api/v2/mods/images/add | jq -r '.upload_url // empty')
        [[ -n "$url" ]] || { echo "images/add gave no upload_url (needs the Edit Mods scope)" >&2; exit 1; }
        got=$(curl -sS -F "image=@${f}" "$url" | jq -r '.id // empty')
        [[ "$got" == "$id" ]] || { echo "upload of $f failed or returned id '$got'" >&2; exit 1; }
        echo "uploaded: $f"
    fi
    IDS+=("$id")
done

ORDER=$(IFS=,; echo "${IDS[*]}")
if [[ "${1:-}" == "--dry-run" ]]; then echo "would set order: $ORDER"; exit 0; fi
curl -sS -H "Authorization: Bearer ${FACTORIO_API_KEY}" -F "mod=${MOD}" -F "images=${ORDER}" \
    https://mods.factorio.com/api/v2/mods/images/edit | jq -e '.success == true' >/dev/null \
    || { echo "images/edit failed" >&2; exit 1; }
echo "gallery set: ${#IDS[@]} images for ${MOD}"
