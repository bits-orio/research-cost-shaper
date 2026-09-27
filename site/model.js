// Cost model for the page: reads a decoded export and predicts every tech's
// new cost for a curve. Mirrors lib/shape.lua (rounding rules in
// spec/curve-format.md); tests/model.test.js checks it against real exports.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./curve.js"));
  else root.RcsModel = factory(root.RcsCurve);
})(this, function (RcsCurve) {
  const PREFIX = "RCS1:";
  const MAX_COUNT = 2 ** 53;

  // Lua tables encode as {} when empty; normalise to arrays.
  const list = (v) => (Array.isArray(v) ? v : []);

  function roundCount(v) {
    const n = Math.floor(v + 0.5);
    return n < 1 ? 1 : n > MAX_COUNT ? MAX_COUNT : n;
  }

  // Mirrors formula_number in lib/shape.lua.
  function formulaNumber(m) {
    const s = m.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
    return Number(s) === 0 ? "0.000001" : s;
  }

  /** Turns the export's tech map into an array of plain records. */
  function techsOf(exp) {
    return Object.entries(exp.techs).map(([name, t]) => ({
      name,
      kind: t.kind,
      skipped: t.skipped || null,
      x: t.x,
      spent: t.spent,
      count: t.count ?? null,
      formula: t.formula ?? null,
      time: t.time ?? null,
      ingredients: list(t.ingredients),
      prerequisites: list(t.prerequisites),
      game: { multiplier: t.multiplier, count: t.new_count ?? t.count ?? null, formula: t.new_formula ?? t.formula ?? null, time: t.new_time ?? t.time ?? null },
    }));
  }

  /** Predicts new costs for every tech under `spec` (from RcsCurve.parse). */
  function predict(techs, spec) {
    const f = RcsCurve.build(spec);
    const inf = spec.inf ?? f(1);
    return techs.map((t) => {
      const p = { multiplier: 1, count: t.count, formula: t.formula, time: t.time };
      if (!t.skipped && t.kind !== "trigger") {
        if (t.kind === "count") {
          p.multiplier = f(t.x);
          p.count = roundCount(t.count * p.multiplier);
        } else if (inf !== 1) {
          p.multiplier = inf;
          p.formula = `(${t.formula})*${formulaNumber(inf)}`;
        }
        if (spec.time !== 1 && t.time != null) p.time = t.time * spec.time;
      }
      return { ...t, now: p };
    });
  }

  /** Techs where the prediction disagrees with what the game applied. */
  function mismatches(rows) {
    return rows.filter((r) => {
      const g = r.game, p = r.now;
      if (r.kind === "count" && Math.abs(g.count - p.count) > 1) return true;
      if (r.kind === "formula" && g.formula !== p.formula) return true;
      if (g.time != null && Math.abs(g.time - p.time) > 1e-9 * g.time) return true;
      return false;
    });
  }

  const sameSpec = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  /** Science packs ranked by where they first appear along x. */
  function packRanks(techs) {
    const rank = new Map();
    [...techs].sort((a, b) => a.x - b.x || (a.name < b.name ? -1 : 1)).forEach((t) => {
      for (const [pack] of t.ingredients) if (!rank.has(pack)) rank.set(pack, rank.size);
    });
    return rank;
  }

  const sortPacks = (packs, rank) => [...packs].sort((a, b) => rank.get(a) - rank.get(b) || (a < b ? -1 : 1));

  /** Totals per distinct pack set, in order of first appearance. */
  function packSets(rows, rank) {
    const groups = new Map();
    for (const r of [...rows].sort((a, b) => a.x - b.x)) {
      if (r.kind !== "count") continue;
      const packs = sortPacks(r.ingredients.map((i) => i[0]), rank);
      const key = packs.join("+");
      if (!groups.has(key)) groups.set(key, { key, packs, techs: 0, unitsBefore: 0, unitsAfter: 0, firstX: r.x });
      const g = groups.get(key);
      g.techs += 1;
      g.unitsBefore += r.count;
      g.unitsAfter += r.now.count;
    }
    return [...groups.values()];
  }

  /** Every distinct ancestor of `name`. */
  function ancestors(byName, name) {
    const seen = new Set();
    const stack = [name];
    while (stack.length) {
      const t = byName.get(stack.pop());
      for (const p of t ? t.prerequisites : []) if (!seen.has(p) && p !== name) { seen.add(p); stack.push(p); }
    }
    return seen;
  }

  /** Every distinct descendant of `name`. */
  function descendants(children, name) {
    const seen = new Set();
    const stack = [name];
    while (stack.length) {
      for (const c of children.get(stack.pop()) || []) if (!seen.has(c) && c !== name) { seen.add(c); stack.push(c); }
    }
    return seen;
  }

  return { PREFIX, roundCount, formulaNumber, techsOf, predict, mismatches, sameSpec, packRanks, sortPacks, packSets, ancestors, descendants };
});
