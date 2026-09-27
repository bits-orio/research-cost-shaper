// Tech tree view: techs in columns by prerequisite depth, each node showing
// its cost before and after the curve. Click a tech to light up everything
// needed to reach it and everything it leads to.

const NS = "http://www.w3.org/2000/svg";
const NODE_W = 184;
const NODE_H = 44;
const COL_W = NODE_W + 64;
const ROW_H = NODE_H + 12;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

const short = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// Sequential scale, cheap -> expensive. Readable on light and dark pages; the
// label colour flips on the darker half (see inkFor).
export const HEAT_STOPS = ["#fdf3d0", "#fcd07e", "#f7994a", "#e0603a", "#b3304a", "#6a1f55"];

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function heatColor(t) {
  const x = Math.min(1, Math.max(0, t)) * (HEAT_STOPS.length - 1);
  const i = Math.min(HEAT_STOPS.length - 2, Math.floor(x));
  const a = hexToRgb(HEAT_STOPS[i]), b = hexToRgb(HEAT_STOPS[i + 1]);
  const f = x - i;
  return `rgb(${a.map((v, k) => Math.round(v + (b[k] - v) * f)).join(" ")})`;
}
// True when white text reads better than dark on this fill.
function darkFill(rgb) {
  const [r, g, b] = rgb.match(/\d+/g).map(Number);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
}

/** Column = longest prerequisite chain; rows ordered by barycentre sweeps. */
export function layout(rows) {
  const byName = new Map(rows.map((r) => [r.name, r]));
  const depth = new Map();
  const visiting = new Set();
  function depthOf(name) {
    if (depth.has(name)) return depth.get(name);
    if (visiting.has(name)) return 0;
    visiting.add(name);
    let d = 0;
    for (const p of byName.get(name).prerequisites) if (byName.has(p)) d = Math.max(d, depthOf(p) + 1);
    visiting.delete(name);
    depth.set(name, d);
    return d;
  }
  rows.forEach((r) => depthOf(r.name));

  const cols = [];
  for (const r of [...rows].sort((a, b) => a.x - b.x || (a.name < b.name ? -1 : 1))) {
    const d = depth.get(r.name);
    (cols[d] ||= []).push(r.name);
  }
  const children = new Map();
  for (const r of rows) for (const p of r.prerequisites) if (byName.has(p)) (children.get(p) || children.set(p, []).get(p)).push(r.name);

  const y = new Map();
  const place = () => cols.forEach((col) => col.forEach((n, i) => y.set(n, (i - (col.length - 1) / 2) * ROW_H)));
  const mean = (names, fallback) => {
    const ys = names.filter((n) => y.has(n)).map((n) => y.get(n));
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : fallback;
  };
  place();
  for (let pass = 0; pass < 6; pass++) {
    for (let c = 1; c < cols.length; c++) {
      cols[c].sort((a, b) => mean(byName.get(a).prerequisites, y.get(a)) - mean(byName.get(b).prerequisites, y.get(b)));
      cols[c].forEach((n, i) => y.set(n, (i - (cols[c].length - 1) / 2) * ROW_H));
    }
    for (let c = cols.length - 2; c >= 0; c--) {
      cols[c].sort((a, b) => mean(children.get(a) || [], y.get(a)) - mean(children.get(b) || [], y.get(b)));
      cols[c].forEach((n, i) => y.set(n, (i - (cols[c].length - 1) / 2) * ROW_H));
    }
  }
  const pos = new Map();
  cols.forEach((col, c) => col.forEach((n) => pos.set(n, { x: c * COL_W, y: y.get(n) })));
  return { pos, children, columns: cols.length };
}

export function createTree(container, { packColor, fmt, onSelect }) {
  const svg = el("svg", { class: "tree-svg" }, container);
  const view = el("g", {}, svg);
  const edgeLayer = el("g", { class: "edges" }, view);
  const nodeLayer = el("g", { class: "nodes" }, view);
  let state = { k: 0.7, tx: 40, ty: 0 };
  let current = null; // { key, lay, nodes: Map, edges: [] }
  let selected = null;
  let colorMode = "cost";
  let legend = null; // { mode, lo, hi } or { mode: "pack", packs }

  const apply = () => view.setAttribute("transform", `translate(${state.tx},${state.ty}) scale(${state.k})`);

  // Pan and zoom.
  let pan = null;
  svg.addEventListener("pointerdown", (e) => {
    pan = { x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty, moved: false };
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener("pointermove", (e) => {
    if (!pan) return;
    const dx = e.clientX - pan.x, dy = e.clientY - pan.y;
    if (Math.abs(dx) + Math.abs(dy) > 3) pan.moved = true;
    state.tx = pan.tx + dx;
    state.ty = pan.ty + dy;
    apply();
  });
  svg.addEventListener("pointerup", (e) => {
    if (pan && !pan.moved) {
      const node = document.elementsFromPoint(e.clientX, e.clientY).find((n) => n.dataset && n.dataset.tech);
      select(node ? node.dataset.tech : null);
    }
    pan = null;
  });
  svg.addEventListener("wheel", (e) => {
    e.preventDefault();
    const box = svg.getBoundingClientRect();
    const px = e.clientX - box.left, py = e.clientY - box.top;
    const k = Math.min(2.5, Math.max(0.08, state.k * Math.exp(-e.deltaY * 0.0015)));
    state.tx = px - ((px - state.tx) * k) / state.k;
    state.ty = py - ((py - state.ty) * k) / state.k;
    state.k = k;
    apply();
  }, { passive: false });

  function build(rows) {
    const lay = layout(rows);
    edgeLayer.textContent = "";
    nodeLayer.textContent = "";
    const nodes = new Map();
    const edges = [];
    for (const r of rows) {
      const p = lay.pos.get(r.name);
      for (const pre of r.prerequisites) {
        const q = lay.pos.get(pre);
        if (!q) continue;
        const x1 = q.x + NODE_W, y1 = q.y + NODE_H / 2, x2 = p.x, y2 = p.y + NODE_H / 2;
        const mid = (x1 + x2) / 2;
        edges.push({ from: pre, to: r.name, path: el("path", { d: `M${x1},${y1} C${mid},${y1} ${mid},${y2} ${x2},${y2}` }, edgeLayer) });
      }
      const g = el("g", { class: "node", transform: `translate(${p.x},${p.y})`, "data-tech": r.name }, nodeLayer);
      const box = el("rect", { class: "box", width: NODE_W, height: NODE_H, rx: 6, "data-tech": r.name }, g);
      const packs = el("g", { class: "packs" }, g);
      const name = el("text", { x: 8, y: 17, class: "node-name", "data-tech": r.name }, g);
      const cost = el("text", { x: 8, y: 34, class: "node-cost", "data-tech": r.name }, g);
      const title = el("title", {}, g);
      name.textContent = short(r.name, 26);
      nodes.set(r.name, { g, box, packs, cost, title });
    }
    current = { lay, nodes, edges };
  }

  // Log scale over the values shown, so cheap and expensive techs both get range.
  function heat(values) {
    const logs = values.filter((v) => v != null && v > 0).map(Math.log);
    const lo = Math.min(...logs), hi = Math.max(...logs);
    const t = (v) => (v == null || v <= 0 ? null : hi === lo ? 0.5 : (Math.log(v) - lo) / (hi - lo));
    return { t, lo: Math.exp(lo), hi: Math.exp(hi) };
  }

  const newestPack = (r) => r.ingredients.map((i) => i[0]).sort((a, b) => r.rank.get(b) - r.rank.get(a))[0];

  function paint(rows) {
    const valueOf = (r) => (r.skipped || r.kind === "trigger" ? null : colorMode === "multiplier" ? r.now.multiplier : r.kind === "count" ? r.now.count : null);
    const scale = heat(rows.map(valueOf));
    const packs = new Set();
    for (const r of rows) {
      const n = current.nodes.get(r.name);
      n.cost.textContent =
        r.kind === "trigger" ? "trigger (no packs)"
        : r.skipped ? `${fmt(r.count)} · unchanged`
        : r.kind === "formula" ? `infinite · ×${fmt(r.now.multiplier, 2)}`
        : `${fmt(r.count)} → ${fmt(r.now.count)}  ×${fmt(r.now.multiplier, 2)}`;
      n.title.textContent = `${r.name}\nx ${r.x.toFixed(3)} · ${r.kind === "formula" ? r.now.formula : r.kind === "trigger" ? "trigger" : `${fmt(r.count)} → ${fmt(r.now.count)} units`}`;
      n.packs.textContent = "";
      r.ingredients.forEach(([pack], i) => el("rect", { x: NODE_W - 10 - i * 8, y: 6, width: 6, height: 6, rx: 1, fill: packColor(pack) }, n.packs));
      let fill = "";
      if (colorMode === "pack") {
        const newest = newestPack(r);
        if (newest) { fill = `color-mix(in oklab, ${packColor(newest)} 62%, var(--surface))`; packs.add(newest); }
      } else {
        const t = scale.t(valueOf(r));
        if (t != null) fill = heatColor(t);
      }
      n.box.style.fill = fill;
      n.g.classList.toggle("hot", colorMode !== "pack" && !!fill && darkFill(fill));
      n.g.classList.toggle("muted-node", !fill);
    }
    legend = colorMode === "pack"
      ? { mode: "pack", packs: [...packs].sort((a, b) => rows[0].rank.get(a) - rows[0].rank.get(b)) }
      : { mode: colorMode, lo: scale.lo, hi: scale.hi };
  }

  function highlight() {
    const has = selected && current.nodes.has(selected);
    svg.classList.toggle("has-selection", !!has);
    const anc = has ? current.ancestors : new Set();
    const desc = has ? current.descendants : new Set();
    for (const [name, n] of current.nodes) {
      n.g.classList.toggle("sel", name === selected);
      n.g.classList.toggle("anc", anc.has(name));
      n.g.classList.toggle("desc", desc.has(name));
    }
    for (const e of current.edges) {
      const up = (e.to === selected || anc.has(e.to)) && anc.has(e.from);
      const down = (e.from === selected || desc.has(e.from)) && desc.has(e.to);
      e.path.setAttribute("class", up ? "up" : down ? "down" : "");
    }
  }

  function select(name) {
    selected = name;
    onSelect(name);
  }

  function centerOn(name) {
    const p = current && current.lay.pos.get(name);
    if (!p) return;
    const box = svg.getBoundingClientRect();
    state.k = Math.max(state.k, 0.6);
    state.tx = box.width / 2 - (p.x + NODE_W / 2) * state.k;
    state.ty = box.height / 2 - (p.y + NODE_H / 2) * state.k;
    apply();
  }

  function fit() {
    const b = view.getBBox();
    const box = svg.getBoundingClientRect();
    if (!b.width || !box.width) return;
    state.k = Math.min(box.width / (b.width + 40), box.height / (b.height + 40));
    state.tx = (box.width - b.width * state.k) / 2 - b.x * state.k;
    state.ty = (box.height - b.height * state.k) / 2 - b.y * state.k;
    apply();
  }

  return {
    /** rows: predicted rows; key changes when a new export is loaded. */
    update(rows, key, { ancestors, descendants }) {
      if (!current || current.key !== key) {
        build(rows);
        current.key = key;
        selected = null;
        requestAnimationFrame(() => {
          const box = svg.getBoundingClientRect();
          state = { k: 0.7, tx: 40, ty: box.height / 2 };
          apply();
        });
      }
      current.ancestors = ancestors;
      current.descendants = descendants;
      paint(rows);
      highlight();
    },
    setColorMode(mode, rows) { colorMode = mode; paint(rows); },
    legend: () => legend,
    select(name) { select(name); centerOn(name); },
    selected: () => selected,
    fit,
    zoom(f) {
      const box = svg.getBoundingClientRect();
      const px = box.width / 2, py = box.height / 2;
      const k = Math.min(2.5, Math.max(0.08, state.k * f));
      state.tx = px - ((px - state.tx) * k) / state.k;
      state.ty = py - ((py - state.ty) * k) / state.k;
      state.k = k;
      apply();
    },
  };
}
