// Recent runs: the last 20 you saved, shared or opened from a link, kept in
// this browser. Editing the curve is cheap and never recorded; only these
// deliberate actions are.
//
// Shared and opened runs store just their share id (the export is fetched
// again when opened). Saved runs store their export under rcs.exp.<hash>,
// once per distinct export, and unreferenced exports are pruned.

const LIST_KEY = "rcs.recent";
const EXPORT_PREFIX = "rcs.exp.";
const MAX = 20;

function read() {
  try { return JSON.parse(localStorage.getItem(LIST_KEY)) || []; } catch { return []; }
}

// FNV-1a over the text, plus its length: enough to tell exports apart.
export function hashText(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}${text.length.toString(16)}`;
}

function prune(list) {
  const keep = new Set(list.filter((e) => e.exportHash).map((e) => EXPORT_PREFIX + e.exportHash));
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const k = localStorage.key(i);
    if (k && k.startsWith(EXPORT_PREFIX) && !keep.has(k)) localStorage.removeItem(k);
  }
}

// Saves the list, dropping the oldest saved runs if the browser runs out of room.
function write(list) {
  for (;;) {
    try {
      localStorage.setItem(LIST_KEY, JSON.stringify(list));
      prune(list);
      return true;
    } catch {
      const oldest = list.map((e) => e.kind).lastIndexOf("saved");
      if (oldest <= 0) return false;
      list.splice(oldest, 1);
      prune(list);
    }
  }
}

export function listRecent() {
  return read();
}

/**
 * Records a run. entry: { kind: "saved" | "shared" | "opened", title, curve,
 * shareId?, summary }. Saved runs need exportText. Returns false if the
 * browser refused to store it.
 */
export function addRecent(entry, exportText) {
  try {
    const e = { ...entry, when: new Date().toISOString() };
    if (e.kind === "saved") {
      e.exportHash = hashText(exportText);
      localStorage.setItem(EXPORT_PREFIX + e.exportHash, exportText);
      e.key = `saved:${e.exportHash}:${e.curve}:${e.title || ""}`;
    } else {
      e.key = `share:${e.shareId}`;
    }
    const list = read();
    const existing = list.find((x) => x.key === e.key);
    // Opening your own shared link again shouldn't demote it to "opened".
    if (existing?.kind === "shared" && e.kind === "opened") e.kind = "shared";
    return write([e, ...list.filter((x) => x.key !== e.key)].slice(0, MAX));
  } catch {
    return false;
  }
}

export function removeRecent(key) {
  try { write(read().filter((e) => e.key !== key)); } catch { /* storage blocked */ }
}

export function savedExport(hash) {
  try { return localStorage.getItem(EXPORT_PREFIX + hash); } catch { return null; }
}
