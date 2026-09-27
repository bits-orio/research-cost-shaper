// Curve editor: log-scale multiplier over progress x, with draggable control
// points, science-pack milestones, and a rug of every tech's position.

const NS = "http://www.w3.org/2000/svg";
const W = 960;
const H = 380;
const M = { l: 52, r: 18, t: 18, b: 58 };
const PW = W - M.l - M.r;
const PH = H - M.t - M.b;

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

// 2.50 -> "2.5", 10.0 -> "10", 100 -> "100"
const fmtMult = (m) => (m >= 100 ? Math.round(m).toLocaleString() : m >= 10 ? m.toFixed(1) : m.toFixed(2)).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

// Nearest 1-2-5 step at or below (dir -1) or above (dir 1) v.
function niceStep(v, dir) {
  const e = Math.floor(Math.log10(v));
  const steps = [];
  for (const d of [e - 1, e, e + 1]) for (const k of [1, 2, 5]) steps.push(k * 10 ** d);
  return dir < 0 ? Math.max(...steps.filter((s) => s <= v * (1 + 1e-9))) : Math.min(...steps.filter((s) => s >= v * (1 - 1e-9)));
}

export function createChart(svg, tooltip, { onChange, onPreview, packColor, packLabel }) {
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  let spec = null;
  let rows = [];
  let range = { lo: 0.1, hi: 100 };
  let dragging = null;
  let moved = false;

  const X = (x) => M.l + x * PW;
  const Y = (m) => M.t + PH - ((Math.log10(m) - Math.log10(range.lo)) / (Math.log10(range.hi) - Math.log10(range.lo))) * PH;
  const invX = (px) => (px - M.l) / PW;
  const invY = (py) => 10 ** (Math.log10(range.lo) + ((M.t + PH - py) / PH) * (Math.log10(range.hi) - Math.log10(range.lo)));

  function fitRange() {
    const f = window.RcsCurve.build(spec);
    let lo = Infinity, hi = -Infinity;
    for (const p of spec.points) { lo = Math.min(lo, p.m); hi = Math.max(hi, p.m); }
    for (let i = 0; i <= 50; i++) { const v = f(i / 50); lo = Math.min(lo, v); hi = Math.max(hi, v); }
    if (spec.inf) { lo = Math.min(lo, spec.inf); hi = Math.max(hi, spec.inf); }
    lo = Math.min(lo, 1);
    range = { lo: niceStep(lo / 1.25, -1), hi: niceStep(hi * 1.25, 1) };
  }

  function point(evt) {
    const pt = svg.createSVGPoint();
    pt.x = evt.clientX;
    pt.y = evt.clientY;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  const round = (m) => Number(m.toPrecision(m < 10 ? 2 : 3));
  const roundX = (x) => Math.round(x * 100) / 100;

  function emit() { onChange(structuredClone(spec)); }

  function draw() {
    svg.textContent = "";
    const f = window.RcsCurve.build(spec);

    // Grid: decades and 2/5 steps on y, tenths on x.
    const grid = el("g", { class: "grid" }, svg);
    for (let d = Math.floor(Math.log10(range.lo)); d <= Math.ceil(Math.log10(range.hi)); d++) {
      for (const k of [1, 2, 5]) {
        const m = 10 ** d * k;
        if (m < range.lo * (1 - 1e-9) || m > range.hi * (1 + 1e-9)) continue;
        el("line", { x1: M.l, x2: M.l + PW, y1: Y(m), y2: Y(m), class: k === 1 ? "major" : "minor" }, grid);
        el("text", { x: M.l - 8, y: Y(m) + 4, class: "tick y" }, grid).textContent = `×${fmtMult(m)}`;
      }
    }
    for (let i = 0; i <= 10; i++) {
      el("line", { x1: X(i / 10), x2: X(i / 10), y1: M.t, y2: M.t + PH, class: "minor" }, grid);
      el("text", { x: X(i / 10), y: M.t + PH + 30, class: "tick x" }, grid).textContent = (i / 10).toString();
    }
    el("line", { x1: M.l, x2: M.l + PW, y1: Y(1), y2: Y(1), class: "unity" }, grid);
    el("text", { x: M.l + PW / 2, y: H - 6, class: "axis-label" }, grid).textContent = "progress through the tech tree (log of science spent to reach a tech) →";

    // Milestones: techs that unlock a science pack.
    const milestones = rows.filter((r) => /-science-pack$/.test(r.name)).sort((a, b) => a.x - b.x);
    const lanes = [];
    const ms = el("g", { class: "milestones" }, svg);
    for (const r of milestones) {
      const label = packLabel(r.name);
      const width = label.length * 6.4 + 8;
      let lane = lanes.findIndex((end) => end < X(r.x));
      if (lane === -1) { lane = lanes.length; lanes.push(0); }
      lanes[lane] = X(r.x) + width;
      el("line", { x1: X(r.x), x2: X(r.x), y1: M.t + lane * 14 + 4, y2: M.t + PH, class: "milestone", stroke: packColor(r.name) }, ms);
      const flip = X(r.x) + width > W - M.r;
      el("text", { x: X(r.x) + (flip ? -3 : 3), y: M.t + lane * 14 + 11, class: "milestone-label", "text-anchor": flip ? "end" : "start" }, ms).textContent = label;
    }

    // Rug: one tick per costed tech, coloured by its newest pack.
    const rug = el("g", { class: "rug" }, svg);
    for (const r of rows) {
      if (r.kind === "trigger" || !r.ingredients.length) continue;
      const pack = r.ingredients.map((i) => i[0]).sort((a, b) => r.rank.get(b) - r.rank.get(a))[0];
      el("line", { x1: X(r.x), x2: X(r.x), y1: M.t + PH + 4, y2: M.t + PH + 16, stroke: packColor(pack) }, rug);
    }

    // Infinite-tech multiplier, if set separately.
    if (spec.inf) {
      el("line", { x1: X(0.9), x2: X(1), y1: Y(spec.inf), y2: Y(spec.inf), class: "inf-line" }, svg);
      el("text", { x: X(0.9) - 4, y: Y(spec.inf) + 4, class: "inf-label" }, svg).textContent = `infinite ×${fmtMult(spec.inf)}`;
    }

    // The curve.
    let d = "";
    for (let i = 0; i <= 240; i++) {
      const x = i / 240;
      d += `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(f(x)).toFixed(1)}`;
    }
    el("path", { d, class: "curve" }, svg);

    // Hover layer.
    const hover = el("rect", { x: M.l, y: M.t, width: PW, height: PH + 18, class: "hover-layer" }, svg);
    const cursor = el("line", { y1: M.t, y2: M.t + PH, class: "cursor", visibility: "hidden" }, svg);
    hover.addEventListener("pointermove", (e) => {
      if (dragging) return;
      const p = point(e);
      const x = Math.min(1, Math.max(0, invX(p.x)));
      cursor.setAttribute("x1", X(x));
      cursor.setAttribute("x2", X(x));
      cursor.setAttribute("visibility", "visible");
      const near = rows.filter((r) => r.kind !== "trigger").sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x)).slice(0, 3);
      showTip(e, `<b>x ${x.toFixed(2)}</b> · ×${fmtMult(f(x))}<br>${near.map((r) => `${r.name} <span class="muted">(${r.x.toFixed(2)})</span>`).join("<br>")}`);
    });
    hover.addEventListener("pointerleave", () => { cursor.setAttribute("visibility", "hidden"); hideTip(); });
    hover.addEventListener("dblclick", (e) => {
      const p = point(e);
      const x = roundX(Math.min(1, Math.max(0, invX(p.x))));
      if (spec.points.some((q) => Math.abs(q.x - x) < 0.005)) return;
      spec.points.push({ x, m: round(invY(p.y)) });
      spec.points.sort((a, b) => a.x - b.x);
      fitRange();
      draw();
      emit();
    });

    // Control points.
    spec.points.forEach((p, i) => {
      const g = el("g", { class: "handle", tabindex: 0 }, svg);
      el("circle", { cx: X(p.x), cy: Y(p.m), r: 14, class: "hit" }, g);
      el("circle", { cx: X(p.x), cy: Y(p.m), r: 6, class: "dot" }, g);
      const edge = X(p.x) < M.l + 40 ? "start" : X(p.x) > W - M.r - 40 ? "end" : "middle";
      const dx = edge === "start" ? 8 : edge === "end" ? -8 : 0;
      el("text", { x: X(p.x) + dx, y: Y(p.m) - 12, class: "handle-label", "text-anchor": edge }, g).textContent = `${p.x}: ×${fmtMult(p.m)}`;
      g.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        dragging = i;
        moved = false;
        hideTip();
      });
      g.addEventListener("dblclick", (e) => {
        e.stopPropagation();
        if (spec.points.length === 1) return;
        spec.points.splice(i, 1);
        fitRange();
        draw();
        emit();
      });
    });

    if (dragging !== null) svg.querySelectorAll(".handle")[dragging]?.classList.add("active");
  }

  // Drags are tracked on the window: every move redraws, replacing the handle.
  window.addEventListener("pointermove", (e) => {
    if (dragging === null) return;
    moved = true;
    const p = spec.points[dragging];
    const q = point(e);
    const left = dragging > 0 ? spec.points[dragging - 1].x + 0.01 : 0;
    const right = dragging < spec.points.length - 1 ? spec.points[dragging + 1].x - 0.01 : 1;
    p.x = roundX(Math.min(right, Math.max(left, invX(q.x))));
    p.m = round(Math.min(range.hi, Math.max(range.lo, invY(q.y))));
    // Only the chart redraws while dragging; costs are recalculated on release.
    draw();
    onPreview?.(structuredClone(spec));
  });
  window.addEventListener("pointerup", () => {
    if (dragging === null) return;
    dragging = null;
    if (!moved) return; // a plain click; keep the element so dblclick can land
    fitRange();
    draw();
    emit();
  });

  function showTip(e, html) {
    tooltip.innerHTML = html;
    tooltip.hidden = false;
    const box = svg.parentElement.getBoundingClientRect();
    const left = Math.min(e.clientX - box.left + 14, box.width - tooltip.offsetWidth - 4);
    tooltip.style.left = `${Math.max(4, left)}px`;
    tooltip.style.top = `${e.clientY - box.top + 14}px`;
  }
  function hideTip() { tooltip.hidden = true; }

  return {
    update(nextSpec, nextRows, { refit = true } = {}) {
      spec = structuredClone(nextSpec);
      rows = nextRows;
      if (refit && dragging === null) fitRange();
      if (dragging === null) draw();
    },
  };
}
