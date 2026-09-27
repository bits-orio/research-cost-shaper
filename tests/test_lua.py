"""Tests for the Lua libraries, run on Lua 5.2 (Factorio's version) via lupa.

Also sweeps lib/curve.lua and site/curve.js over the same inputs and requires
them to agree, so the web page never predicts a cost the game won't apply.

Run: python3 -m unittest discover tests
"""

import json
import pathlib
import subprocess
import unittest

import lupa.lua52 as lupa52

ROOT = pathlib.Path(__file__).resolve().parent.parent
CASES = json.loads((ROOT / "spec" / "curve-cases.json").read_text())

SWEEP_CURVES = [
    "v1;pts=0:1",
    "v1;pts=0:40,1:1",
    "v1;pts=0:2,0.5:4,1:10",
    "v1;pts=0:5,0.25:6,0.75:80,1:100",
    "v1;pts=0:20,0.4:4,1:60",
    "v1;pts=0:1,0.1:50,0.2:2,1:3",
    "v1;pts=0.1:3,0.2:3,0.35:9,0.6:9.5,0.9:400",
]
SWEEP_XS = [i / 997 for i in range(-10, 1008)]


def close(a, b, rel=1e-9):
    return abs(a - b) <= rel * max(1.0, abs(b))


def lua_runtime():
    lua = lupa52.LuaRuntime(unpack_returned_tuples=True)
    lua.execute(f'package.path = "{ROOT}/?.lua;" .. package.path')
    return lua


class CurveTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lua = lua_runtime()
        cls.curve = cls.lua.eval('require("lib.curve")')
        # parse returns one value on success; always hand Python (spec, err).
        pair = cls.lua.eval("function(f) return function(s) local a, b = f(s) return a, b end end")
        cls.curve = cls.lua.table_from({"parse": pair(cls.curve.parse), "build": cls.curve.build})

    def evaluator(self, s):
        spec, err = self.curve.parse(s)
        self.assertIsNone(err, s)
        return self.curve.build(spec)

    def test_runs_on_lua_52(self):
        self.assertEqual(self.lua.eval("_VERSION"), "Lua 5.2")

    def test_parses_valid_curves(self):
        for c in CASES["parse_ok"]:
            spec, err = self.curve.parse(c["input"])
            self.assertIsNone(err, c["input"])
            points = [[spec.points[i].x, spec.points[i].m] for i in range(1, len(spec.points) + 1)]
            self.assertEqual(points, c["points"], c["input"])
            self.assertEqual(spec.inf, c["inf"], c["input"])
            self.assertEqual(spec.time, c["time"], c["input"])

    def test_rejects_invalid_curves_with_a_message(self):
        for s in CASES["parse_error"]:
            spec, err = self.curve.parse(s)
            self.assertIsNone(spec, f"accepted: {s!r}")
            self.assertIsInstance(err, str)

    def test_evaluates_to_hand_derived_values(self):
        for c in CASES["eval"]:
            got = self.evaluator(c["curve"])(c["x"])
            self.assertTrue(close(got, c["expect"]), f'{c["curve"]} @ {c["x"]}: {got}')

    def test_matches_javascript_everywhere(self):
        script = (
            "const {parse, build} = require(process.argv[1]);"
            "const [curves, xs] = JSON.parse(process.argv[2]);"
            "console.log(JSON.stringify(curves.map(c => { const f = build(parse(c)[0]); return xs.map(f); })));"
        )
        out = subprocess.run(
            ["node", "-e", script, str(ROOT / "site" / "curve.js"), json.dumps([SWEEP_CURVES, SWEEP_XS])],
            check=True, capture_output=True, text=True,
        ).stdout
        js = json.loads(out)
        worst = 0.0
        for s, js_values in zip(SWEEP_CURVES, js):
            f = self.evaluator(s)
            for x, want in zip(SWEEP_XS, js_values):
                got = f(x)
                worst = max(worst, abs(got - want) / max(1.0, abs(want)))
                self.assertTrue(close(got, want, 1e-12), f"{s} @ {x}: lua {got} js {want}")
        print(f"\n  lua/js worst relative difference: {worst:.3g}")


class ProgressTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lua = lua_runtime()
        cls.progress = cls.lua.eval('require("lib.progress")')

    def compute(self, techs):
        table = self.lua.table_from(
            {n: {"packs": p, "prerequisites": self.lua.table_from(r)} for n, (p, r) in techs.items()}
        )
        return {n: (r.spent, r.x) for n, r in self.progress.compute(table).items()}

    def test_counts_shared_ancestors_once(self):
        # Diamond: d needs b and c, both need a. a's 10 packs count once.
        got = self.compute({
            "a": (10, []), "b": (100, ["a"]), "c": (1000, ["a"]), "d": (1, ["b", "c"]),
        })
        self.assertEqual(got["d"][0], 1111)

    def test_scales_log_spent_from_cheapest_to_dearest(self):
        got = self.compute({"a": (10, []), "b": (90, ["a"]), "c": (900, ["b"])})
        self.assertEqual(got["a"][1], 0)
        self.assertEqual(got["c"][1], 1)
        self.assertTrue(close(got["b"][1], 0.5))

    def test_survives_cycles_and_missing_prerequisites(self):
        got = self.compute({"a": (5, ["b", "ghost"]), "b": (7, ["a"])})
        self.assertEqual(got["a"][0], 12)
        self.assertEqual(got["b"][0], 12)

    def test_trigger_only_techs_sit_at_zero(self):
        got = self.compute({"t": (0, []), "a": (10, ["t"]), "b": (100, ["a"])})
        self.assertEqual(got["t"], (0, 0))
        self.assertEqual(got["a"][1], 0)

    def test_single_costed_tech(self):
        got = self.compute({"a": (10, [])})
        self.assertEqual(got["a"], (10, 0))


class ShapeTest(unittest.TestCase):
    """techs.snapshot -> shape.plan -> techs.apply, on a fake data.raw."""

    @classmethod
    def setUpClass(cls):
        cls.lua = lua_runtime()
        cls.lua.execute("""
            techs = require("lib.techs")
            shape = require("lib.shape")
            curve = require("lib.curve")
            report = require("lib.report")
            function fake_raw()
                return {
                    ["t-start"] = { name = "t-start", research_trigger = { type = "craft-item", item = "iron-plate", count = 10 } },
                    ["a"] = { name = "a", prerequisites = { "t-start" },
                        unit = { count = 10, time = 5, ingredients = { { "red", 1 } } } },
                    ["b"] = { name = "b", prerequisites = { "a" },
                        unit = { count = 45, time = 10,
                            ingredients = { { type = "item", name = "red", amount = 1 }, { "green", 1 } } } },
                    ["c"] = { name = "c", prerequisites = { "b" },
                        unit = { count = 900, time = 30, ingredients = { { "red", 1 } } } },
                    ["inf"] = { name = "inf", prerequisites = { "c" }, max_level = "infinite",
                        unit = { count_formula = "2^L*1000", time = 60, ingredients = { { "red", 1 } } } },
                    ["free"] = { name = "free", ignore_tech_cost_multiplier = true,
                        unit = { count = 10, time = 1, ingredients = { { "red", 1 } } } },
                }
            end
            function run(curve_string)
                local raw = fake_raw()
                local snap = techs.snapshot(raw)
                local plan = shape.plan(snap, (curve.parse(curve_string)))
                techs.apply(raw, plan)
                return raw, plan, report.build(snap, plan, curve_string)
            end
        """)

    def run_curve(self, s):
        return self.lua.globals().run(s)

    def test_snapshot_reads_both_ingredient_shapes(self):
        snap = self.lua.eval("techs.snapshot(fake_raw())")
        self.assertEqual(snap["b"].packs, 90)
        self.assertEqual(snap["t-start"].kind, "trigger")
        self.assertEqual(snap["inf"].kind, "formula")

    def test_scales_counts_along_the_curve(self):
        # spent: a=10, b=10+90=100, c=100+900=1000 -> x = 0, 0.5, 1
        raw, plan, _ = self.run_curve("v1;pts=0:2,1:50")
        self.assertEqual(raw["a"].unit.count, 20)
        self.assertEqual(raw["b"].unit.count, 450)  # 45 * 10 (geometric mean of 2 and 50)
        self.assertEqual(raw["c"].unit.count, 45000)

    def test_rounds_half_up_and_never_below_one(self):
        self.assertEqual(self.lua.eval("shape.round_count(2.5)"), 3)
        self.assertEqual(self.lua.eval("shape.round_count(0.2)"), 1)
        raw, _, _ = self.run_curve("v1;pts=0:0.01")
        self.assertEqual(raw["a"].unit.count, 1)

    def test_formula_uses_end_of_curve_unless_inf_given(self):
        raw, _, _ = self.run_curve("v1;pts=0:2,1:50")
        self.assertEqual(raw["inf"].unit.count_formula, "(2^L*1000)*50")
        raw, _, _ = self.run_curve("v1;pts=0:2,1:50;inf=2.5")
        self.assertEqual(raw["inf"].unit.count_formula, "(2^L*1000)*2.5")
        raw, _, _ = self.run_curve("v1;pts=0:2,1:1")
        self.assertEqual(raw["inf"].unit.count_formula, "2^L*1000")

    def test_leaves_trigger_and_exempt_techs_alone(self):
        raw, plan, _ = self.run_curve("v1;pts=0:9;time=3")
        self.assertEqual(raw["free"].unit.count, 10)
        self.assertEqual(raw["free"].unit.time, 1)
        self.assertEqual(plan["free"].skipped, "exempt")
        self.assertEqual(plan["t-start"].skipped, "trigger")

    def test_time_multiplier(self):
        raw, _, _ = self.run_curve("v1;pts=0:1;time=3")
        self.assertEqual(raw["a"].unit.time, 15)
        self.assertEqual(raw["inf"].unit.time, 180)
        self.assertEqual(raw["a"].unit.count, 10)

    def test_report_lists_every_tech_and_pack_set(self):
        _, _, text = self.run_curve("v1;pts=0:2,1:50")
        for needle in ["t-start", "unchanged (trigger)", "unchanged (exempt)", "(2^L*1000)*50",
                       "10 -> 20", "900 -> 45,000", "red+green"]:
            self.assertIn(needle, text)

    def test_export_carries_original_and_new_costs_and_sorted_mods(self):
        out = self.lua.eval("""(function()
            local raw = fake_raw()
            local snap = techs.snapshot(raw)
            local plan = shape.plan(snap, (curve.parse("v1;pts=0:2,1:50")))
            return require("lib.export").build(snap, plan, "v1;pts=0:2,1:50", { zeta = "1.0.0", base = "2.0.77" })
        end)()""")
        self.assertEqual(out.format, 1)
        self.assertEqual([out.mods[1][1], out.mods[2][1]], ["base", "zeta"])
        self.assertEqual((out.techs["c"].count, out.techs["c"].new_count), (900, 45000))
        self.assertEqual(out.techs["inf"].new_formula, "(2^L*1000)*50")
        self.assertEqual(out.techs["free"].skipped, "exempt")
        self.assertEqual((out.techs["t-start"].trigger.type, out.techs["t-start"].trigger.item), ("craft-item", "iron-plate"))
        self.assertEqual(out.techs["inf"].max_level, "infinite")


if __name__ == "__main__":
    unittest.main()
