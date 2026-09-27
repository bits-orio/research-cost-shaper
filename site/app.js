import { createChart } from "./chart.js";
import { createTree } from "./tree.js";

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
const packChips = (packs) =>
  `<span class="chips">${packs.map((p) => `<i style="background:${packColor(p)}" title="${packLabel(p)}"></i>`).join("")}</span>`;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

// ---------------------------------------------------------------- storage

const store = {
  get(k) { try { return localStorage.getItem(`rcs.${k}`); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(`rcs.${k}`, v); } catch { /* private mode etc. */ } },
};

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

async function loadText(text, source, { remember = true } = {}) {
  const exp = await decode(text);
  state.exp = exp;
  state.techs = Model.techsOf(exp);
  state.rank = Model.packRanks(state.techs);
  for (const t of state.techs) t.rank = state.rank;
  state.byName = new Map(state.techs.map((t) => [t.name, t]));
  state.children = new Map();
  for (const t of state.techs) for (const p of t.prerequisites) (state.children.get(p) || state.children.set(p, []).get(p)).push(t.name);
  state.key = `${source}:${text.length}:${Date.now()}`;
  state.source = source;
  if (remember) { store.set("export", text); store.set("source", source); }
  renderSource();
  const fromHash = curveFromHash();
  setSpec(fromHash || Curve.parse(exp.curve)[0], { writeInput: true });
}

async function loadSample(name, label) {
  const res = await fetch(`samples/${name}.txt`);
  await loadText(await res.text(), `Sample: ${label}`, { remember: false });
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

function setSpec(spec, { writeInput = false, refit = true } = {}) {
  state.spec = spec;
  state.rows = Model.predict(state.techs, spec);
  const text = serialize(spec);
  if (writeInput) $("#curve-input").value = text;
  $("#curve-error").hidden = true;
  $("#inf-input").value = spec.inf ?? "";
  $("#inf-input").placeholder = `end of curve (×${fmt(Curve.build(spec)(1), 2)})`;
  $("#time-input").value = spec.time;
  history.replaceState(null, "", `#curve=${encodeURIComponent(text)}`);
  render({ refit });
}

// ---------------------------------------------------------------- render

function render({ refit = true } = {}) {
  chart.update(state.spec, state.rows, { refit });
  renderStats();
  renderSelection();
  renderTable();
  renderSets();
}

function renderSource() {
  const exp = state.exp;
  const sample = state.source.startsWith("Sample");
  $("#sample-banner").hidden = !sample;
  $("#sample-name").textContent = sample ? `the ${state.source.replace(/^Sample: /, "")} sample` : "";
  const mods = exp.mods.filter(([n]) => n !== "research-cost-shaper");
  $("#source").innerHTML =
    (sample ? `<span class="sample-pill">Sample data</span> ` : "") +
    `<strong>${esc(state.source)}</strong> · ${state.techs.length} techs · ` +
    `<details><summary>${mods.length} mod${mods.length === 1 ? "" : "s"}</summary><ul>${mods.map(([n, v]) => `<li>${esc(n)} <span class="muted">${esc(v)}</span></li>`).join("")}</ul></details>`;
  $("#tech-search-list").innerHTML = state.techs.map((t) => `<option value="${esc(t.name)}">`).join("");
}

function renderStats() {
  const counted = state.rows.filter((r) => r.kind === "count" && !r.skipped);
  const before = counted.reduce((a, r) => a + r.count, 0);
  const after = counted.reduce((a, r) => a + r.now.count, 0);
  const formula = state.rows.filter((r) => r.kind === "formula" && !r.skipped);
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
    <div class="stat"><span>Research, all finite techs</span><b>${fmt(before)} → ${fmt(after)}</b><small>units · ×${fmt(after / before, 2)} overall</small></div>
    <div class="stat"><span>At ${fmt(state.spm)} SPM</span><b>${fmtHours(before / state.spm / 60)} → ${fmtHours(after / state.spm / 60)}</b><small>to research everything once</small></div>
    <div class="stat"><span>Infinite techs</span><b>${formula.length}</b><small>×${fmt(formula[0]?.now.multiplier ?? 1, 2)} on their formulas</small></div>
    ${match}`;
  $("#reset-curve")?.addEventListener("click", () => setSpec(exportSpec, { writeInput: true }));
}

function renderSelection() {
  const name = tree.selected();
  const t = name && state.rows.find((r) => r.name === name);
  const anc = t ? Model.ancestors(state.byName, name) : new Set();
  const desc = t ? Model.descendants(state.children, name) : new Set();
  tree.update(state.rows, state.key, { ancestors: anc, descendants: desc });
  const panel = $("#tree-panel");
  if (!t) {
    panel.innerHTML = `<p class="muted">Click a tech to see what it takes to reach it. Drag to pan, scroll to zoom.</p>`;
    return;
  }
  const branch = state.rows.filter((r) => (anc.has(r.name) || r.name === name) && r.kind === "count" && !r.skipped);
  const before = branch.reduce((a, r) => a + r.count, 0);
  const after = branch.reduce((a, r) => a + r.now.count, 0);
  const own = t.kind === "formula" ? `<code>${esc(t.now.formula)}</code>` : t.kind === "trigger" ? "trigger, no packs" : `${fmt(t.count)} → <b>${fmt(t.now.count)}</b> units`;
  panel.innerHTML = `
    <h3>${esc(name)} <button class="link" id="clear-sel" title="Clear selection">✕</button></h3>
    <p>${packChips(Model.sortPacks(t.ingredients.map((i) => i[0]), state.rank))} x ${t.x.toFixed(3)} · ×${fmt(t.now.multiplier, 2)}</p>
    <p>${own}${t.time ? ` · ${fmt(t.now.time, 2)} s each` : ""}</p>
    <h4>To reach it</h4>
    <p><b class="anc-key">${anc.size}</b> earlier techs · ${fmt(before)} → <b>${fmt(after)}</b> units, itself included<br>
    ${fmtHours(before / state.spm / 60)} → <b>${fmtHours(after / state.spm / 60)}</b> at ${fmt(state.spm)} SPM</p>
    <h4>Leads to</h4>
    <p><b class="desc-key">${desc.size}</b> later techs</p>`;
  $("#clear-sel").addEventListener("click", () => { tree.select(null); });
}

const COLUMNS = [
  { id: "name", label: "Technology", get: (r) => r.name },
  { id: "x", label: "x", get: (r) => r.x },
  { id: "packs", label: "Packs", get: (r) => r.ingredients.length },
  { id: "before", label: "Before", get: (r) => r.count ?? -1 },
  { id: "after", label: "After", get: (r) => (r.kind === "count" ? r.now.count : -1) },
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
    if (r.kind === "trigger") { before = `<span class="muted">trigger</span>`; after = ""; }
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
  onChange: (spec) => setSpec(spec, { writeInput: true, refit: false }),
  onPreview: (spec) => { $("#curve-input").value = serialize(spec); },
});

const tree = createTree($("#tree"), {
  packColor,
  fmt,
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
});

$("#inf-input").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  const spec = structuredClone(state.spec);
  if (e.target.value.trim() === "" || !(v > 0)) delete spec.inf;
  else spec.inf = v;
  setSpec(spec, { writeInput: true });
});
$("#time-input").addEventListener("change", (e) => {
  const v = Number(e.target.value);
  const spec = structuredClone(state.spec);
  spec.time = v > 0 ? v : 1;
  setSpec(spec, { writeInput: true });
});

$("#copy-curve").addEventListener("click", async () => {
  const text = serialize(state.spec);
  try {
    await navigator.clipboard.writeText(text);
    $("#copy-curve").textContent = "Copied";
  } catch {
    $("#curve-input").select();
    $("#copy-curve").textContent = "Press Ctrl+C";
  }
  setTimeout(() => ($("#copy-curve").textContent = "Copy for mod settings"), 1800);
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

$("#tree-search").addEventListener("change", (e) => {
  if (state.byName.has(e.target.value)) tree.select(e.target.value);
});
$("#tree-color").addEventListener("change", (e) => tree.setColorMode(e.target.value, state.rows));
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
  try { await loadText(await file.text(), file.name); }
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
    await loadText($("#paste-text").value, "Pasted export");
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
  if (opt.value) await loadSample(opt.value, opt.textContent);
  e.target.value = "";
});

// Start: last export, else the Space Age sample.
showTab(store.get("tab") || "tree");
(async () => {
  const saved = store.get("export");
  try {
    if (saved) await loadText(saved, store.get("source") || "Your export", { remember: false });
    else await loadSample("space-age-2.0", "Space Age (2.0)");
  } catch (err) {
    showError(err.message);
    await loadSample("space-age-2.0", "Space Age (2.0)");
  }
})();
