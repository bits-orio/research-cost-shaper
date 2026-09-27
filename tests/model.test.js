// site/model.js must reproduce what the game applied, tech for tech, on real
// exports written by the mod (site/samples, tests/fixtures).
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const RcsCurve = require("../site/curve.js");
const M = require("../site/model.js");

function load(file) {
  const text = fs.readFileSync(path.join(__dirname, "..", file), "utf8").trim();
  assert.ok(text.startsWith(M.PREFIX));
  return JSON.parse(zlib.inflateSync(Buffer.from(text.slice(M.PREFIX.length), "base64")).toString());
}

for (const file of ["site/samples/vanilla-2.0.txt", "site/samples/space-age-2.0.txt", "tests/fixtures/space-age-2.1-custom.txt"]) {
  test(`reproduces the game's costs: ${file}`, () => {
    const exp = load(file);
    const [spec, err] = RcsCurve.parse(exp.curve);
    assert.equal(err, null);
    const rows = M.predict(M.techsOf(exp), spec);
    assert.ok(rows.length > 150);
    assert.deepEqual(M.mismatches(rows).map((r) => r.name), []);
  });
}

test("the custom fixture exercises formula and time changes", () => {
  const rows = M.predict(M.techsOf(load("tests/fixtures/space-age-2.1-custom.txt")), RcsCurve.parse("v1;pts=0:1")[0]);
  const game = M.techsOf(load("tests/fixtures/space-age-2.1-custom.txt"));
  assert.ok(game.some((t) => t.kind === "formula" && t.game.formula.endsWith(")*12.5")));
  assert.ok(game.some((t) => t.time && t.game.time === t.time * 1.5));
  // A different curve must disagree with the game, or the check is vacuous.
  assert.ok(M.mismatches(rows).length > 100);
});

test("rounding and formula numbers match the Lua rules", () => {
  assert.equal(M.roundCount(2.5), 3);
  assert.equal(M.roundCount(0.2), 1);
  assert.equal(M.formulaNumber(50), "50");
  assert.equal(M.formulaNumber(2.5), "2.5");
  assert.equal(M.formulaNumber(1e-9), "0.000001");
});

test("ancestors and pack sets", () => {
  const rows = M.predict(M.techsOf(load("site/samples/vanilla-2.0.txt")), RcsCurve.parse("v1;pts=0:1")[0]);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const anc = M.ancestors(byName, "rocket-silo");
  assert.ok(anc.has("automation-science-pack") && !anc.has("rocket-silo"));
  const sets = M.packSets(rows, M.packRanks(rows));
  assert.equal(sets[0].key, "automation-science-pack");
  assert.equal(sets[1].key, "automation-science-pack+logistic-science-pack");
});

test("formula techs get a numeric cost at their level; triggers are described", () => {
  const exp = load("tests/fixtures/space-age-2.1-custom.txt");
  const rows = M.predict(M.techsOf(exp), RcsCurve.parse(exp.curve)[0]);
  const byName = new Map(rows.map((r) => [r.name, r]));
  const dmg = byName.get("physical-projectile-damage-7");
  assert.equal(dmg.level, 7);
  assert.equal(dmg.levelCost, 1000); // 2^(7-7)*1000
  assert.equal(dmg.now.levelCost, 12500); // x12.5 (inf in the fixture curve)
  assert.equal(dmg.maxLevel, "infinite");
  const steel = byName.get("tungsten-steel");
  assert.equal(steel.kind, "trigger");
  assert.match(M.describeTrigger(steel.trigger), /^(Craft|Mine|Build)/);
  assert.equal(M.describeTrigger(null), "Unlocked by an in-game action, not science packs.");
});

test("formula evaluator", () => {
  const F = require("../site/formula.js");
  assert.equal(F.evaluate("2^(L-6)*1000", 8), 4000);
  assert.equal(F.evaluate("1000*(L - 2)", 5), 3000);
  assert.equal(F.evaluate("1.2^L*1000", 1), 1200);
  assert.equal(F.evaluate("2^3^2", 1), 512); // right-associative
  assert.equal(F.evaluate("-L^2", 3), -9);
  assert.equal(F.evaluate("(2^(L-1)*1000)*10", 1), 10000);
  assert.equal(F.evaluate("log2(L)", 4), null); // unsupported -> fall back to text
  assert.equal(F.evaluate("2^", 1), null);
  assert.equal(F.levelOf("physical-projectile-damage-7"), 7);
  assert.equal(F.levelOf("research-productivity"), 1);
});
