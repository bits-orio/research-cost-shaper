// Tests for site/curve.js against the shared cases. Run: node --test tests/
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const cases = require(path.join(__dirname, "..", "spec", "curve-cases.json"));
const { parse, build } = require(path.join(__dirname, "..", "site", "curve.js"));

const close = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));

test("parses valid curves", () => {
  for (const c of cases.parse_ok) {
    const [spec, err] = parse(c.input);
    assert.equal(err, null, c.input);
    assert.deepEqual(spec.points.map((p) => [p.x, p.m]), c.points, c.input);
    assert.equal(spec.inf ?? null, c.inf, c.input);
    assert.equal(spec.time, c.time, c.input);
  }
});

test("rejects invalid curves with a message", () => {
  for (const input of cases.parse_error) {
    const [spec, err] = parse(input);
    assert.equal(spec, null, `accepted: ${JSON.stringify(input)}`);
    assert.equal(typeof err, "string");
  }
});

test("evaluates to hand-derived values", () => {
  for (const c of cases.eval) {
    const got = build(parse(c.curve)[0])(c.x);
    assert.ok(close(got, c.expect), `${c.curve} @ ${c.x}: got ${got}, want ${c.expect}`);
  }
});

test("never overshoots its neighbouring points", () => {
  const curves = ["v1;pts=0:5,0.25:6,0.75:80,1:100", "v1;pts=0:20,0.4:4,1:60", "v1;pts=0:1,0.1:50,0.2:2,1:3"];
  for (const s of curves) {
    const spec = parse(s)[0];
    const f = build(spec);
    const pts = spec.points;
    for (let i = 0; i <= 1000; i++) {
      const x = i / 1000;
      let k = 0;
      while (k < pts.length - 2 && x > pts[k + 1].x) k++;
      const lo = Math.min(pts[k].m, pts[k + 1].m);
      const hi = Math.max(pts[k].m, pts[k + 1].m);
      const v = f(x);
      assert.ok(v >= lo * (1 - 1e-12) && v <= hi * (1 + 1e-12), `${s} @ ${x}: ${v} outside [${lo}, ${hi}]`);
    }
  }
});
