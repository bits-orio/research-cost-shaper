import { createChart } from "./chart.js";
import { createTree, HEAT_STOPS } from "./tree.js";
import { play, setSound, soundEnabled } from "./sound.js";
import { addRecent, listRecent, removeRecent, savedExport } from "./recent.js";

const SHARE_API = "https://rcs-share.bits-orio.workers.dev";
const Curve = window.RcsCurve;
const Model = window.RcsModel;
const $ = (sel) => document.querySelector(sel);

// ---------------------------------------------------------------- formatting

const PACK_COLORS = {
  "automation-science-pack": "#d8413a",
  "logistic-science-pack": "#3da94a",
  "military-science-pack": "#7a7f87",
  "chemical-science-pack": "#3a8ad6",
  "production-science-pack": "#9a4fc0",
  "utility-science-pack": "#e0b92a",
  "space-science-pack": "#b9c4cf",
  "metallurgic-science-pack": "#e5822a",
  "electromagnetic-science-pack": "#d24aa8",
  "agricultural-science-pack": "#93c23a",
  "cryogenic-science-pack": "#3e5fd9",
  "promethium-science-pack": "#5b3f8c",
};
function packColor(name) {
  if (PACK_COLORS[name]) return PACK_COLORS[name];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return `hsl(${h % 360} 55% 52%)`;
}
const packLabel = (name) => name.replace(/-science-pack$/, "").replace(/-/g, " ");

function fmt(n, digits) {
  if (n == null) return "–";
  if (digits != null) return Number(n.toPrecision(n >= 100 ? 3 : digits + 1)).toLocaleString();
  if (Math.abs(n) >= 1e9) return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 2 }).format(n);
  return Math.round(n).toLocaleString();
}
function fmtHours(h) {
  if (!isFinite(h)) return "–";
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0)} h`;
  return `${(h / 24).toFixed(1)} days`;
}
const icon = (id) => `<svg class="icon"><use href="#i-${id}"/></svg>`;
const packChips = (packs) =>
  `<span class="chips">${packs.map((p) => `<i style="background:${packColor(p)}" title="${packLabel(p)}"></i>`).join("")}</span>`;
// Mods that ship with the game have no portal page.
const BUILT_IN = new Set(["base", "core", "space-age", "quality", "elevated-rails", "recycler"]);
// Portal mods first (linked), then the ones that ship with the game.
function modList(mods) {
  const portal = mods.filter(([n]) => !BUILT_IN.has(n));
  const builtIn = mods.filter(([n]) => BUILT_IN.has(n));
  const items = [
    ...portal.map(([n, v]) => `<li><a href="https://mods.factorio.com/mod/${encodeURIComponent(n)}" target="_blank" rel="noopener" title="Open ${esc(n)} on the mod portal">${esc(n)}<svg class="icon ext"><use href="#i-external"/></svg></a> <span class="muted">${esc(v)}</span></li>`),
    ...builtIn.map(([n, v], i) => `<li class="built-in${i === 0 && portal.length ? " first" : ""}">${esc(n)} <span class="muted">${esc(v)} · built in</span></li>`),
  ];
  return `<details class="mods"><summary>${mods.length} mod${mods.length === 1 ? "" : "s"}</summary><ul>${items.join("")}</ul></details>`;
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- storage

const store = {
  get(k) { try { return localStorage.getItem(`rcs.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`rcs.${k}`, v); } catch { /* private mode etc. */ } },
};

// The export you're working on survives a reload of this tab, but a new
// visit starts from scratch; runs you want back live under Recent.
const working = {
  get(k) { try { return sessionStorage.getItem(`rcs.${k}`); } catch { return null; } },
  set(k, v) { try { sessionStorage.setItem(`rcs.${k}`, v); } catch { /* private mode etc. */ } },
};
try { localStorage.removeItem("rcs.export"); localStorage.removeItem("rcs.source"); } catch { /* older versions kept these */ }

// ---------------------------------------------------------------- state

const state = {
  exp: null, techs: [], rank: new Map(), key: "", source: "",
  spec: null, rows: [], byName: new Map(), children: new Map(),
  spm: Number(store.get("spm")) || 300,
  sort: { col: "x", dir: 1 }, filter: "",
};

function serialize(spec) {
  const n = (v) => String(Number(v.toPrecision(6)));
  let s = `v1; pts=${spec.points.map((p) => `${n(p.x)}:${n(p.m)}`).join(", ")}`;
  if (spec.inf) s += `; inf=${n(spec.inf)}`;
  if (spec.time !== 1) s += `; time=${n(spec.time)}`;
  return s;
}

async function decode(text) {
  const t = text.trim().replace(/\s+/g, "");
  if (!t.startsWith(Model.PREFIX)) throw new Error("This isn't a Research Cost Shaper export. It should start with RCS1:");
  let bytes;
  try { bytes = Uint8Array.from(atob(t.slice(Model.PREFIX.length)), (c) => c.charCodeAt(0)); }
  catch { throw new Error("The export is damaged (not valid base64). Copy it again, all of it."); }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const exp = JSON.parse(await new Response(stream).text());
    if (exp.format !== 1 || !exp.techs) throw new Error();
    return exp;
  } catch { throw new Error("The export is incomplete or damaged. Copy it again, all of it."); }
}

// ---------------------------------------------------------------- loading

// Which curve a load shows, in order: the page address when reopening a page
// you were editing (preferHash), the run's own curve (shares, saved runs), the
// curve you are working on (importing a new export keeps it), the address,
// and finally the curve the export was made with.
async function loadText(text, source, { remember = true, shared = null, curve = null, keepCurve = false, preferHash = false } = {}) {
  const current = keepCurve ? state.spec : null;
  const exp = await decode(text);
  state.exp = exp;
  state.exportText = text.trim();
  state.shared = shared;
  // Loading anything else leaves the shared run behind, so drop ?s= from the address.
  if (!shared && new URLSearchParams(location.search).has("s")) history.replaceState(null, "", location.pathname + location.hash);
  state.techs = Model.techsOf(exp);
  state.rank = Model.packRanks(state.techs);
  for (const t of state.techs) t.rank = state.rank;
  state.byName = new Map(state.techs.map((t) => [t.name, t]));
  state.children = new Map();
  for (const t of state.techs) for (const p of t.prerequisites) (state.children.get(p) || state.children.set(p, []).get(p)).push(t.name);
  state.key = `${source}:${text.length}:${Date.now()}`;
  state.source = source;
  if (remember) { working.set("export", text); working.set("source", source); }
  renderSource();
  const fromRun = curve ? Curve.parse(curve)[0] : null;
  setSpec((preferHash && curveFromHash()) || fromRun || current || curveFromHash() || Curve.parse(exp.curve)[0], { writeInput: true });
}

const summaryOf = () => ({
  mods: state.exp.mods.filter(([n]) => n !== "research-cost-shaper").length,
  techs: state.techs.length,
  spaceAge: state.exp.mods.some(([n]) => n === "space-age"),
});

/** Loads a run shared through the share service (?s=<id>). */
async function loadShare(id, { preferHash = false } = {}) {
  let res;
  try { res = await fetch(`${SHARE_API}/api/share/${encodeURIComponent(id)}`); }
  catch { throw new Error("Couldn't reach the share service. Check your connection and reload."); }
  if (res.status === 404) throw new Error("That share link doesn't exist. Check that you copied all of it.");
  if (!res.ok) throw new Error("The share service had a problem. Try again in a moment.");
  const rec = await res.json();
  await loadText(rec.export, rec.title ? `Shared: ${rec.title}` : "Shared run", {
    remember: false, shared: { id, title: rec.title, created: rec.created }, curve: rec.curve, preferHash,
  });
  if (new URLSearchParams(location.search).get("s") !== id) history.replaceState(null, "", `?s=${id}${location.hash}`);
  addRecent({ kind: "opened", shareId: id, title: rec.title || "", curve: rec.curve, summary: summaryOf() });
}

async function loadSample(name, label) {
  const res = await fetch(`samples/${name}.txt`);
  await loadText(await res.text(), `Sample: ${label}`, { remember: false, keepCurve: true });
}

function curveFromHash() {
  const m = location.hash.match(/curve=([^&]+)/);
  if (!m) return null;
  const [spec] = Curve.parse(decodeURIComponent(m[1]));
  return spec;
}

function showError(msg) {
  const box = $("#load-error");
  box.textContent = msg;
  box.hidden = !msg;
}

// ---------------------------------------------------------------- curve

function setSpec(spec, { writeInput = false, refit = true, flash = false } = {}) {
  // Predict from exactly what "Copy for mod settings" hands the game: the
  // serialized string, parsed back (serialize keeps 6 significant digits).
  spec = Curve.parse(serialize(spec))[0];
  state.spec = spec;
  state.rows = Model.predict(state.techs, spec);
  const text = serialize(spec);
  if (writeInput) $("#curve-input").value = text;
  $("#curve-error").hidden = true;
  $("#inf-input").value = spec.inf ?? "";
  $("#inf-input").placeholder = `end of curve (×${fmt(Curve.build(spec)(1), 2)})`;
  $("#time-input").value = spec.time;
  history.replaceState(null, "", `#curve=${encodeURIComponent(text)}`);
  render({ refit, flash });
}

// A deliberate change: re-render, then confirm it with a tick and a brief
// highlight of what moved, since the tables are usually off screen.
function commit(spec, kind = "change", opts = {}) {
  const before = state.totalAfter;
  setSpec(spec, { writeInput: true, flash: true, ...opts });
  play(kind);
  showDelta(before, state.totalAfter);
}

function showDelta(before, after) {
  const stats = $("#stats");
  stats.classList.remove("flash");
  void stats.offsetWidth; // restart the animation
  stats.classList.add("flash");
  const badge = $("#delta");
  if (!badge || !before || before === after) return;
  const pct = (after / before - 1) * 100;
  badge.textContent = `${pct > 0 ? "+" : "−"}${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`;
  badge.className = `delta ${pct > 0 ? "up" : "down"}`;
}

// ---------------------------------------------------------------- render

function render({ refit = true, flash = false } = {}) {
  chart.update(state.spec, state.rows, { refit, flash });
  renderStats();
  renderSelection();
  renderTable();
  renderSets();
}

function renderSource() {
  const exp = state.exp;
  const sample = state.source.startsWith("Sample");
  const mods = exp.mods.filter(([n]) => n !== "research-cost-shaper");
  $("#sample-banner").hidden = !sample || store.get("sampleDismissed") === "1";
  $("#sample-name").textContent = sample ? `the ${state.source.replace(/^Sample: /, "")} sample` : "";

  // A shared run is a showcase: its title leads the page.
  const shared = state.shared;
  $("#shared-hero").hidden = !shared;
  $("#source").hidden = !!shared;
  document.title = shared?.title ? `${shared.title} · Research Cost Shaper` : "Research Cost Shaper";
  if (shared) {
    const when = shared.created ? new Date(shared.created).toLocaleDateString(undefined, { dateStyle: "medium" }) : "";
    const spaceAge = exp.mods.some(([n]) => n === "space-age");
    $("#hero-title").textContent = shared.title || "Untitled run";
    $("#hero-meta").innerHTML = [modList(mods), `${state.techs.length} techs`, spaceAge ? "Space Age" : "", when ? `shared ${esc(when)}` : ""]
      .filter(Boolean).join(" · ");
  } else {
    $("#source").innerHTML = sample
      ? `<span class="sample-pill">Sample data</span> Exploring the <strong>${esc(state.source.replace(/^Sample: /, ""))}</strong> sample · ${state.techs.length} techs · ${modList(mods)}` +
        ($("#sample-banner").hidden ? ` · <button class="link" id="sample-help">${icon("help")}Load your own modpack</button>` : "")
      : `<strong>${esc(state.source)}</strong> · ${state.techs.length} techs · ${modList(mods)}`;
    $("#sample-help")?.addEventListener("click", () => { store.set("sampleDismissed", "0"); renderSource(); });
  }
  $("#tech-search-list").innerHTML = state.techs.map((t) => `<option value="${esc(t.name)}">`).join("");
}

function renderStats() {
  const counted = state.rows.filter((r) => r.kind === "count" && !r.skipped);
  const before = counted.reduce((a, r) => a + r.count, 0);
  const after = counted.reduce((a, r) => a + r.now.count, 0);
  const formula = state.rows.filter((r) => r.kind === "formula" && !r.skipped);
  state.totalAfter = after;
  const [exportSpec] = Curve.parse(state.exp.curve);
  let match;
  if (Model.sameSpec(exportSpec, state.spec)) {
    const bad = Model.mismatches(state.rows);
    match = bad.length
      ? `<p class="warn">${bad.length} techs differ from what the game applied: ${bad.slice(0, 5).map((r) => esc(r.name)).join(", ")}. Please report this.</p>`
      : `<p class="ok">Matches the costs the game applied, for all ${state.rows.length} techs.</p>`;
  } else {
    match = `<p class="muted">Preview. The export was made with <code>${esc(state.exp.curve)}</code>. <button class="link" id="reset-curve">Reset to it</button></p>`;
  }
  $("#stats").innerHTML = `
    <div class="stat"><span>Research, all finite techs <em id="delta" class="delta"></em></span><b>${fmt(before)} → ${fmt(after)}</b><small>units · ×${fmt(after / before, 2)} overall</small></div>
    <div class="stat"><span>At ${fmt(state.spm)} SPM</span><b>${fmtHours(before / state.spm / 60)} → ${fmtHours(after / state.spm / 60)}</b><small>to research everything once</small></div>
    <div class="stat"><span>Infinite techs</span><b>${formula.length}</b><small>×${fmt(formula[0]?.now.multiplier ?? 1, 2)} on their formulas</small></div>
    ${match}`;
  $("#reset-curve")?.addEventListener("click", () => commit(exportSpec));
}

function renderSelection() {
  const name = tree.selected();
  const t = name && state.rows.find((r) => r.name === name);
  const anc = t ? Model.ancestors(state.byName, name) : new Set();
  const desc = t ? Model.descendants(state.children, name) : new Set();
  tree.update(state.rows, state.key, { ancestors: anc, descendants: desc });
  renderLegend();
  const panel = $("#tree-panel");
  if (!t) {
    panel.innerHTML = `<p class="muted">Click a tech to see what it takes to reach it. Drag to pan, scroll to zoom.</p>`;
    return;
  }
  const branch = state.rows.filter((r) => (anc.has(r.name) || r.name === name) && r.kind === "count" && !r.skipped);
  const before = branch.reduce((a, r) => a + r.count, 0);
  const after = branch.reduce((a, r) => a + r.now.count, 0);
  panel.innerHTML = `
    <h3>${esc(name)} <button class="link" id="clear-sel" title="Clear selection">${icon("x")}</button></h3>
    <h4>Its own cost</h4>
    ${ownCost(t)}
    <h4>To reach it</h4>
    <p><b class="anc-key">${anc.size}</b> earlier techs · ${fmt(before)} → <b>${fmt(after)}</b> units, itself included<br>
    ${fmtHours(before / state.spm / 60)} → <b>${fmtHours(after / state.spm / 60)}</b> at ${fmt(state.spm)} SPM</p>
    <h4>Leads to</h4>
    <p><b class="desc-key">${desc.size}</b> later techs</p>`;
  $("#clear-sel").addEventListener("click", () => { tree.select(null); });
}

// The selected tech's own research: what it costs before and after the curve,
// or what unlocks it when science packs don't.
function ownCost(t) {
  const packs = packChips(Model.sortPacks(t.ingredients.map((i) => i[0]), state.rank));
  const where = `<p class="muted small">Curve position ${t.x.toFixed(3)}</p>`;
  if (t.kind === "trigger") {
    return `<p class="own-big">No science cost</p>
      <p>Unlocked by an action instead: <b>${esc(Model.describeTrigger(t.trigger))}</b>. The curve doesn't change triggers.</p>${where}`;
  }
  const each = t.time ? ` · ${fmt(t.now.time, 2)} s per unit` : "";
  const packsLine = `<p>${packs} ${t.ingredients.length} pack${t.ingredients.length === 1 ? "" : "s"} per unit${each}</p>`;
  if (t.skipped) {
    return `<p class="own-big">${fmt(t.count)} units</p><p class="muted">Unchanged: this tech opts out of cost multipliers.</p>${packsLine}${where}`;
  }
  if (t.kind === "formula") {
    const lvl = t.maxLevel === "infinite" ? `level ${t.level}, then every level after it` : `level ${t.level}${t.maxLevel ? ` of ${t.maxLevel}` : ""}`;
    const numbers = t.levelCost != null
      ? `<p class="own-big">${fmt(t.levelCost)} → <b>${fmt(t.now.levelCost)}</b> units <span class="muted">×${fmt(t.now.multiplier, 2)}</span></p>`
      : `<p class="own-big"><code>${esc(t.now.formula)}</code></p>`;
    return `${numbers}<p class="muted">Cost of ${lvl}; each level follows <code>${esc(t.now.formula)}</code>.</p>${packsLine}
      <p>${fmtHours((t.now.levelCost ?? 0) / state.spm / 60)} for this level at ${fmt(state.spm)} SPM</p>${where}`;
  }
  return `<p class="own-big">${fmt(t.count)} → <b>${fmt(t.now.count)}</b> units <span class="muted">×${fmt(t.now.multiplier, 2)}</span></p>
    ${packsLine}<p>${fmtHours(t.count / state.spm / 60)} → <b>${fmtHours(t.now.count / state.spm / 60)}</b> at ${fmt(state.spm)} SPM</p>${where}`;
}

// Cost shown in the tables and tree: count techs by count, formula techs by
// the level they start at.
const costBefore = (r) => (r.kind === "formula" ? r.levelCost : r.count);
const costAfter = (r) => (r.kind === "formula" ? r.now.levelCost : r.kind === "count" ? r.now.count : null);

const COLUMNS = [
  { id: "name", label: "Technology", get: (r) => r.name },
  { id: "x", label: "x", get: (r) => r.x },
  { id: "packs", label: "Packs", get: (r) => r.ingredients.length },
  { id: "before", label: "Before", get: (r) => costBefore(r) ?? -1 },
  { id: "after", label: "After", get: (r) => costAfter(r) ?? -1 },
  { id: "mult", label: "×", get: (r) => r.now.multiplier },
  { id: "time", label: "Time each", get: (r) => r.now.time ?? -1 },
];

function renderTable() {
  const col = COLUMNS.find((c) => c.id === state.sort.col);
  const q = state.filter.toLowerCase();
  const rows = state.rows
    .filter((r) => !q || r.name.includes(q))
    .sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      return (va < vb ? -1 : va > vb ? 1 : a.name < b.name ? -1 : 1) * state.sort.dir;
    });
  const gameDiffers = Model.sameSpec(Curve.parse(state.exp.curve)[0], state.spec) ? new Set(Model.mismatches(state.rows).map((r) => r.name)) : new Set();
  $("#tech-table thead").innerHTML = `<tr>${COLUMNS.map((c) => `<th data-col="${c.id}" class="${c.id === state.sort.col ? (state.sort.dir > 0 ? "asc" : "desc") : ""}">${c.label}</th>`).join("")}</tr>`;
  $("#tech-table tbody").innerHTML = rows.map((r) => {
    const packs = packChips(Model.sortPacks(r.ingredients.map((i) => i[0]), state.rank));
    let before, after;
    if (r.kind === "trigger") { before = `<span class="muted">${esc(Model.describeTrigger(r.trigger))}</span>`; after = `<span class="muted">no packs</span>`; }
    else if (r.kind === "formula" && r.levelCost != null) {
      const lvl = `<small class="lvl" title="${esc(r.now.formula)}">lvl ${r.level}${r.maxLevel === "infinite" ? "+" : ""}</small>`;
      before = `${fmt(r.levelCost)} ${lvl}`;
      after = r.skipped ? `<span class="muted">unchanged</span>` : `${fmt(r.now.levelCost)} ${lvl}`;
    }
    else if (r.kind === "formula") { before = `<code>${esc(r.formula)}</code>`; after = `<code>${esc(r.now.formula)}</code>`; }
    else { before = fmt(r.count); after = r.skipped ? `<span class="muted">unchanged</span>` : fmt(r.now.count); }
    return `<tr data-tech="${esc(r.name)}" class="${gameDiffers.has(r.name) ? "differs" : ""}">
      <td>${esc(r.name)}</td><td class="num">${r.x.toFixed(3)}</td><td>${packs}</td>
      <td class="num">${before}</td><td class="num">${after}</td>
      <td class="num">${r.skipped || r.kind === "trigger" ? "" : fmt(r.now.multiplier, 2)}</td>
      <td class="num">${r.now.time != null ? `${fmt(r.now.time, 2)} s` : ""}</td></tr>`;
  }).join("");
  $("#tech-count").textContent = `${rows.length} of ${state.rows.length}`;
}

function renderSets() {
  const sets = Model.packSets(state.rows.filter((r) => !r.skipped), state.rank);
  let cumBefore = 0, cumAfter = 0;
  const hours = (u) => fmtHours(u / state.spm / 60);
  $("#sets-table tbody").innerHTML = sets.map((g) => {
    cumBefore += g.unitsBefore;
    cumAfter += g.unitsAfter;
    return `<tr><td>${packChips(g.packs)} <span class="set-name">${esc(g.packs.map(packLabel).join(" + "))}</span></td>
      <td class="num">${g.techs}</td><td class="num">${fmt(g.unitsBefore)}</td><td class="num"><b>${fmt(g.unitsAfter)}</b></td>
      <td class="num">×${fmt(g.unitsAfter / g.unitsBefore, 2)}</td><td class="num">${hours(g.unitsAfter)}</td>
      <td class="num">${hours(cumBefore)} → <b>${hours(cumAfter)}</b></td></tr>`;
  }).join("");
  $("#sets-spm").textContent = fmt(state.spm);
}

// ---------------------------------------------------------------- wiring

const chart = createChart($("#chart"), $("#chart-tip"), {
  packColor,
  packLabel,
  onChange: (spec, kind) => commit(spec, kind, { refit: false }),
  onPreview: (spec) => { $("#curve-input").value = serialize(spec); },
});

const tree = createTree($("#tree"), {
  packColor,
  fmt,
  describeTrigger: Model.describeTrigger,
  onSelect: () => renderSelection(),
});

$("#curve-input").addEventListener("input", (e) => {
  const [spec, err] = Curve.parse(e.target.value);
  if (!spec) {
    $("#curve-error").textContent = err;
    $("#curve-error").hidden = false;
    return;
  }
  setSpec(spec);
  clearTimeout(typingTimer);
  typingTimer = setTimeout(() => showDelta(null, null), 450);
});
let typingTimer = null;

$("#inf-input").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  const spec = structuredClone(state.spec);
  if (e.target.value.trim() === "" || !(v > 0)) delete spec.inf;
  else spec.inf = v;
  commit(spec);
});
$("#time-input").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  const spec = structuredClone(state.spec);
  spec.time = v > 0 ? v : 1;
  commit(spec);
});

$("#copy-curve").addEventListener("click", async () => {
  const text = serialize(state.spec);
  try {
    await navigator.clipboard.writeText(text);
    $("#copy-curve span").textContent = "Copied";
    play("success");
  } catch {
    $("#curve-input").select();
    $("#copy-curve span").textContent = "Press Ctrl+C";
  }
  setTimeout(() => ($("#copy-curve span").textContent = "Copy for mod settings"), 1800);
});

$("#spm-input").value = state.spm;
$("#spm-input").addEventListener("input", (e) => {
  const v = Number(e.target.value);
  if (!(v > 0)) return;
  state.spm = v;
  store.set("spm", String(v));
  renderStats();
  renderSelection();
  renderSets();
});

$("#tech-filter").addEventListener("input", (e) => { state.filter = e.target.value.trim(); renderTable(); });
$("#tech-table thead").addEventListener("click", (e) => {
  const col = e.target.closest("th")?.dataset.col;
  if (!col) return;
  state.sort = { col, dir: state.sort.col === col ? -state.sort.dir : 1 };
  renderTable();
});
$("#tech-table tbody").addEventListener("click", (e) => {
  const name = e.target.closest("tr")?.dataset.tech;
  if (!name) return;
  showTab("tree");
  tree.select(name);
});

// "input" fires as soon as a suggestion is picked; "change" only on blur.
for (const ev of ["input", "change"]) {
  $("#tree-search").addEventListener(ev, (e) => {
    const name = e.target.value.trim();
    if (state.byName.has(name) && tree.selected() !== name) tree.select(name);
  });
}
for (const b of document.querySelectorAll("[data-color]")) {
  b.addEventListener("click", () => {
    for (const o of document.querySelectorAll("[data-color]")) o.setAttribute("aria-checked", o === b);
    tree.setColorMode(b.dataset.color, state.rows);
    renderLegend();
  });
}

function renderLegend() {
  const l = tree.legend();
  if (!l) return;
  if (l.mode === "pack") {
    $("#tree-legend").innerHTML = `<span class="legend-what">Each tech is coloured by the newest science pack it needs:</span>
      ${l.packs.map((p) => `<span class="legend-pack"><i style="background:${packColor(p)}"></i>${esc(packLabel(p))}</span>`).join("")}`;
    return;
  }
  const what = l.mode === "cost" ? "its research cost after the curve" : "how much the curve multiplied its cost";
  const lo = l.mode === "cost" ? `${fmt(l.lo)} units` : `×${fmt(l.lo, 2)}`;
  const hi = l.mode === "cost" ? `${fmt(l.hi)} units` : `×${fmt(l.hi, 2)}`;
  $("#tree-legend").innerHTML = `<span class="legend-what">Each tech is coloured by ${what}:</span>
    <span class="legend-scale"><span>${lo}</span><i style="background:linear-gradient(90deg, ${HEAT_STOPS.join(", ")})"></i><span>${hi}</span></span>
    <span class="muted">Grey: unchanged or trigger techs.</span>`;
}
$("#tree-fit").addEventListener("click", () => tree.fit());
$("#tree-in").addEventListener("click", () => tree.zoom(1.25));
$("#tree-out").addEventListener("click", () => tree.zoom(0.8));

function showTab(id) {
  for (const b of document.querySelectorAll(".tabs [data-tab]")) b.setAttribute("aria-selected", b.dataset.tab === id);
  for (const v of document.querySelectorAll(".view")) v.hidden = v.id !== `view-${id}`;
  store.set("tab", id);
}
for (const b of document.querySelectorAll(".tabs [data-tab]")) b.addEventListener("click", () => showTab(b.dataset.tab));

// Loading: file picker, drag and drop, paste, samples.
async function loadFile(file) {
  showError("");
  try { await loadText(await file.text(), file.name, { keepCurve: true }); }
  catch (err) { showError(err.message); }
}
for (const input of document.querySelectorAll(".file-input")) {
  input.addEventListener("change", (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); e.target.value = ""; });
}
document.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("dropping"); });
document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("dropping"); });
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dropping");
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});
for (const b of document.querySelectorAll(".paste-open")) {
  b.addEventListener("click", () => { $("#paste-error").hidden = true; $("#paste-dialog").showModal(); $("#paste-text").focus(); });
}
$("#paste-cancel").addEventListener("click", () => $("#paste-dialog").close());
$("#paste-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await loadText($("#paste-text").value, "Pasted export", { keepCurve: true });
    $("#paste-text").value = "";
    $("#paste-dialog").close();
    showError("");
  } catch (err) {
    $("#paste-error").textContent = err.message;
    $("#paste-error").hidden = false;
  }
});
$("#sample-select").addEventListener("change", async (e) => {
  const opt = e.target.selectedOptions[0];
  if (opt.value) {
    store.set("sampleDismissed", "1"); // picking a sample on purpose means you know it's a sample
    await loadSample(opt.value, opt.textContent);
  }
  e.target.value = "";
});

// Theme: auto follows the system; light and dark are remembered.
const THEMES = ["dark", "light", "auto"];
const THEME_ICON = { dark: "moon", light: "sun", auto: "auto" };
function applyTheme(t) {
  if (t === "auto") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = t;
  $("#theme-toggle").innerHTML = icon(THEME_ICON[t]);
  $("#theme-toggle").title = `Theme: ${t} (click to change)`;
}
applyTheme(store.get("theme") || "dark");
$("#theme-toggle").addEventListener("click", () => {
  const next = THEMES[(THEMES.indexOf(store.get("theme") || "dark") + 1) % THEMES.length];
  store.set("theme", next);
  applyTheme(next);
});

function showSound() {
  $("#sound-toggle").innerHTML = icon(soundEnabled() ? "volume" : "mute");
  $("#sound-toggle").title = `Sound ${soundEnabled() ? "on" : "off"} (click to change)`;
}
showSound();
$("#sound-toggle").addEventListener("click", () => { setSound(!soundEnabled()); showSound(); play("change"); });

for (const id of ["#sample-dismiss", "#sample-dismiss-x"]) {
  $(id).addEventListener("click", () => { store.set("sampleDismissed", "1"); renderSource(); });
}

// Mod lists close when you click anywhere else, or press Escape.
document.addEventListener("click", (e) => {
  for (const d of document.querySelectorAll("details.mods[open]")) if (!d.contains(e.target)) d.open = false;
  if (!$("#recent-panel").hidden && !e.target.closest(".recent-wrap")) toggleRecent(false);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    for (const d of document.querySelectorAll("details.mods[open]")) d.open = false;
    toggleRecent(false);
  }
});

// Save and share. Both record the run under Recent; share also uploads it.
let lastShare = null; // { key, url }
const dialogTitle = () => $("#share-title").value.trim();
function shareKey() { return `${state.exportText.length}:${serialize(state.spec)}:${dialogTitle()}`; }
function resetShareResult() {
  $("#share-result").hidden = true;
  $("#share-error").hidden = true;
  $("#share-status").hidden = true;
  $("#share-submit span").textContent = "Create share link";
}
function openSaveDialog(focus) {
  if (!lastShare || lastShare.key !== shareKey()) resetShareResult();
  if (!dialogTitle() && state.shared?.title) $("#share-title").value = state.shared.title;
  $("#share-sample-note").hidden = !state.source.startsWith("Sample");
  $("#share-dialog").showModal();
  $(focus).focus();
}
$("#share-open").addEventListener("click", () => openSaveDialog("#share-title"));
for (const b of document.querySelectorAll(".save-open")) b.addEventListener("click", () => openSaveDialog("#share-title"));
$("#share-cancel").addEventListener("click", () => $("#share-dialog").close());
$("#share-title").addEventListener("input", resetShareResult);

function status(msg) {
  $("#share-status").textContent = msg;
  $("#share-status").hidden = false;
}

$("#save-submit").addEventListener("click", () => {
  const ok = addRecent({ kind: "saved", title: dialogTitle(), curve: serialize(state.spec), summary: summaryOf() }, state.exportText);
  if (!ok) {
    $("#share-error").textContent = "This browser wouldn't store it (private mode or storage full).";
    $("#share-error").hidden = false;
    return;
  }
  status("Saved. Find it under Recent.");
  play("success");
});

$("#share-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (lastShare && lastShare.key === shareKey() && !$("#share-result").hidden) {
    try { await navigator.clipboard.writeText(lastShare.url); $("#share-submit span").textContent = "Copied"; }
    catch { $("#share-url").select(); $("#share-submit span").textContent = "Press Ctrl+C"; }
    return;
  }
  $("#share-submit").disabled = true;
  $("#share-submit span").textContent = "Creating…";
  $("#share-error").hidden = true;
  try {
    const res = await fetch(`${SHARE_API}/api/share`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ export: state.exportText, curve: serialize(state.spec), title: dialogTitle() || undefined }),
    });
    const out = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(out.error || `The share service said no (${res.status}).`);
    lastShare = { key: shareKey(), url: out.url };
    addRecent({ kind: "shared", shareId: out.id, title: dialogTitle(), curve: serialize(state.spec), summary: summaryOf() });
    $("#share-url").value = out.url;
    $("#share-result").hidden = false;
    $("#share-url").select();
    $("#share-submit span").textContent = "Copy link";
    status("Link created and added to Recent.");
    play("success");
  } catch (err) {
    $("#share-error").textContent = err instanceof TypeError ? "Couldn't reach the share service. Check your connection." : err.message;
    $("#share-error").hidden = false;
    $("#share-submit span").textContent = "Create share link";
  } finally {
    $("#share-submit").disabled = false;
  }
});

// Recent: saved, shared and opened runs, newest first.
const KIND_LABEL = { saved: "Saved", shared: "Shared", opened: "Opened" };
function toggleRecent(open = $("#recent-panel").hidden) {
  $("#recent-panel").hidden = !open;
  $("#recent-open").setAttribute("aria-expanded", open);
  if (open) renderRecent();
}
function renderRecent() {
  const list = listRecent();
  $("#recent-panel").innerHTML = list.length
    ? `<ul>${list.map((e) => {
        const when = new Date(e.when).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
        const s = e.summary || {};
        return `<li data-key="${esc(e.key)}">
          <button class="recent-item" data-key="${esc(e.key)}">
            <span class="recent-top"><span class="kind kind-${e.kind}">${KIND_LABEL[e.kind] || e.kind}</span><b>${esc(e.title || "Untitled run")}</b></span>
            <span class="recent-meta">${esc(when)} · ${s.mods ?? "?"} mods · ${s.techs ?? "?"} techs${s.spaceAge ? " · Space Age" : ""}</span>
            <code class="recent-curve">${esc(e.curve)}</code>
          </button>
          <button class="recent-remove" data-remove="${esc(e.key)}" title="Remove from Recent" aria-label="Remove">${icon("x")}</button>
        </li>`;
      }).join("")}</ul>`
    : `<p class="muted">Nothing here yet. Runs you save, share, or open from a link show up here.</p>`;
}
$("#recent-open").addEventListener("click", () => toggleRecent());
$("#recent-panel").addEventListener("click", async (e) => {
  const remove = e.target.closest("[data-remove]");
  if (remove) { removeRecent(remove.dataset.remove); renderRecent(); return; }
  const item = e.target.closest(".recent-item");
  if (!item) return;
  const entry = listRecent().find((x) => x.key === item.dataset.key);
  if (!entry) return;
  toggleRecent(false);
  showError("");
  try {
    if (entry.shareId) {
      await loadShare(entry.shareId);
    } else {
      const text = savedExport(entry.exportHash);
      if (!text) throw new Error("This saved run's data is no longer in this browser.");
      await loadText(text, entry.title ? `Saved: ${entry.title}` : "Saved run", { remember: true, curve: entry.curve });
    }
    play("success");
  } catch (err) {
    showError(err.message);
  }
});

// Start: a shared link, else (on a reload) this tab's export, else the sample.
showTab(store.get("tab") || "tree");
(async () => {
  const shareId = new URLSearchParams(location.search).get("s");
  const current = working.get("export");
  try {
    if (shareId) await loadShare(shareId, { preferHash: true });
    else if (current) await loadText(current, working.get("source") || "Your export", { remember: false, preferHash: true });
    else await loadSample("space-age-2.0", "Space Age (2.0)");
  } catch (err) {
    showError(err.message);
    await loadSample("space-age-2.0", "Space Age (2.0)");
  }
})();
