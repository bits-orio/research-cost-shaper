// The run's mod list: portal mods first, each with its thumbnail and title
// and a preview card on hover, then the ones that ship with the game.
// Portal details come through the share worker (the portal's API sends no
// CORS headers), fetched the first time a list is hovered or opened.

// Mods that ship with the game have no portal page.
const BUILT_IN = new Set(["base", "core", "space-age", "quality", "elevated-rails", "recycler"]);
const BATCH = 40; // the worker's per-request cap

let api = "";
const info = new Map(); // name -> { title, owner, summary, downloads, thumbnail } | null (not on the portal)
const pending = new Set();
const failed = new Set();
let card = null;
let cardFor = null; // the <li> the card describes

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const portalUrl = (n) => `https://mods.factorio.com/mod/${encodeURIComponent(n)}`;
const thumb = (m, cls) => (m?.thumbnail ? `<img class="${cls}" src="${esc(m.thumbnail)}" alt="" loading="lazy">` : `<span class="${cls} blank"></span>`);

function row(name, version) {
  const m = info.get(name);
  const data = `data-mod="${esc(name)}" data-version="${esc(version)}"`;
  if (m === null) return `<li ${data} class="unlisted">${thumb(m, "mod-thumb")}<span class="mod-name">${esc(name)}</span> <span class="muted">${esc(version)}</span></li>`;
  return `<li ${data}><a href="${portalUrl(name)}" target="_blank" rel="noopener">${thumb(m, "mod-thumb")}<span class="mod-name">${esc(m?.title ?? name)}</span><svg class="icon ext"><use href="#i-external"/></svg></a> <span class="muted">${esc(version)}</span></li>`;
}

export function modList(mods) {
  const portal = mods.filter(([n]) => !BUILT_IN.has(n));
  const builtIn = mods.filter(([n]) => BUILT_IN.has(n));
  const items = [
    ...portal.map(([n, v]) => row(n, v)),
    ...builtIn.map(([n, v], i) => `<li class="built-in${i === 0 && portal.length ? " first" : ""}">${esc(n)} <span class="muted">${esc(v)} · built in</span></li>`),
  ];
  return `<details class="mods"><summary>${mods.length} mod${mods.length === 1 ? "" : "s"}</summary><ul>${items.join("")}</ul></details>`;
}

// ---------------------------------------------------------------- portal details

async function load(details) {
  const names = [...details.querySelectorAll("li[data-mod]")].map((li) => li.dataset.mod).filter((n) => !info.has(n) && !pending.has(n));
  if (!names.length) return;
  for (const n of names) { pending.add(n); failed.delete(n); }
  const batches = [];
  for (let i = 0; i < names.length; i += BATCH) batches.push(names.slice(i, i + BATCH));
  await Promise.all(batches.map(async (batch) => {
    try {
      const res = await fetch(`${api}/api/mods?${batch.map((n) => `name=${encodeURIComponent(n)}`).join("&")}`);
      if (!res.ok) throw new Error(res.status);
      const { mods } = await res.json();
      for (const [n, m] of Object.entries(mods)) info.set(n, m);
    } catch { /* offline or worker down: the list stays plain */ }
    for (const n of batch) { pending.delete(n); if (!info.has(n)) failed.add(n); }
  }));
  refresh(names);
}

// Swap in the rows that just learned their details, keeping focus and the card.
function refresh(names) {
  const changed = new Set(names);
  for (const li of document.querySelectorAll("details.mods li[data-mod]")) {
    if (!changed.has(li.dataset.mod)) continue;
    const fresh = document.createRange().createContextualFragment(row(li.dataset.mod, li.dataset.version)).firstElementChild;
    const focused = li.contains(document.activeElement);
    li.replaceWith(fresh);
    if (focused) (fresh.querySelector("a") ?? fresh).focus?.();
    if (cardFor === li) show(fresh);
  }
}

// ---------------------------------------------------------------- preview card

function cardBody(name, version) {
  const m = info.get(name);
  const foot = `<p class="mod-card-foot"><code>${esc(name)}</code> ${esc(version)}</p>`;
  if (m === null) return `<p class="mod-card-note">Not on the mod portal. It may be private or installed locally.</p>${foot}`;
  if (!m) {
    const note = failed.has(name) ? "Couldn't reach the mod portal for details." : "Loading details from the mod portal…";
    return `<p class="mod-card-title">${esc(name)}</p><p class="mod-card-note">${note}</p>${foot}`;
  }
  const by = [m.owner ? `by ${esc(m.owner)}` : "", m.downloads != null ? `${m.downloads.toLocaleString()} downloads` : ""].filter(Boolean).join(" · ");
  return `<div class="mod-card-head">${thumb(m, "mod-card-thumb")}<div><p class="mod-card-title">${esc(m.title)}</p>${by ? `<p class="mod-card-by">${by}</p>` : ""}</div></div>` +
    (m.summary ? `<p class="mod-card-summary">${esc(m.summary)}</p>` : "") + foot;
}

// Beside the open list, never over it, so it can't hide the row you're
// about to click. Right, then left, then below, then above; with no room
// anywhere it stays hidden.
function place(li) {
  const list = li.closest("ul").getBoundingClientRect();
  const r = li.getBoundingClientRect();
  const gap = 8, edge = 8;
  const w = card.offsetWidth, h = card.offsetHeight;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  let left, top;
  if (list.right + gap + w <= innerWidth - edge) left = list.right + gap;
  else if (list.left - gap - w >= edge) left = list.left - gap - w;
  if (left !== undefined) {
    top = clamp(r.top - 10, edge, innerHeight - h - edge);
  } else {
    left = clamp(list.left, edge, innerWidth - w - edge);
    if (list.bottom + gap + h <= innerHeight - edge) top = list.bottom + gap;
    else if (list.top - gap - h >= edge) top = list.top - gap - h;
    else return false;
  }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
  return true;
}

function show(li) {
  if (!card) {
    card = document.createElement("div");
    card.id = "mod-card";
    card.className = "mod-card";
    card.setAttribute("role", "tooltip");
    document.body.append(card);
  }
  cardFor = li;
  card.innerHTML = cardBody(li.dataset.mod, li.dataset.version);
  card.hidden = false;
  card.style.visibility = "hidden"; // measure before placing
  const ok = place(li);
  card.style.visibility = "";
  card.hidden = !ok;
  if (ok) li.querySelector("a")?.setAttribute("aria-describedby", "mod-card");
}

function hide() {
  if (!cardFor) return;
  card.hidden = true;
  cardFor.querySelector("a")?.removeAttribute("aria-describedby");
  cardFor = null;
}

// The list hangs off the summary's left edge; nudge it left when that
// would run it past the window.
function fit(details) {
  const ul = details.querySelector("ul");
  ul.style.left = "";
  const over = ul.getBoundingClientRect().right - (innerWidth - 8);
  if (over > 0) ul.style.left = `${-over}px`;
}

export function initModLists(shareApi) {
  api = shareApi;
  // Hovering the "N mods" summary starts the fetch, so the list is usually
  // filled in by the time it opens.
  document.addEventListener("pointerover", (e) => {
    const summary = e.target.closest?.("details.mods > summary");
    if (summary) load(summary.parentElement);
    const li = e.target.closest?.("details.mods[open] li[data-mod]");
    if (li && e.pointerType !== "touch") { if (li !== cardFor) show(li); } else hide();
  });
  document.documentElement.addEventListener("pointerleave", hide);
  document.addEventListener("focusin", (e) => {
    const li = e.target.closest?.("details.mods li[data-mod]");
    if (li) show(li);
  });
  document.addEventListener("focusout", hide);
  // toggle doesn't bubble, so listen while it captures.
  document.addEventListener("toggle", (e) => {
    if (!e.target.matches?.("details.mods")) return;
    if (e.target.open) { fit(e.target); load(e.target); } else hide();
  }, true);
  document.addEventListener("scroll", hide, true);
}
