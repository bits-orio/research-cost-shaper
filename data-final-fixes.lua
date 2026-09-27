local curve = require("lib.curve")
local techs = require("lib.techs")
local shape = require("lib.shape")
local report = require("lib.report")

local curve_string = settings.startup["rcs-curve"].value
local spec, err = curve.parse(curve_string)
if not spec then
    error(
        "\n\nResearch Cost Shaper: the 'Cost curve' startup setting is invalid.\n"
            .. err
            .. "\n\nSetting value: "
            .. curve_string
            .. "\nExample of a valid curve: v1; pts=0:2, 0.5:4, 1:10\n"
    )
end

local snapshot = techs.snapshot(data.raw.technology)
local plan = shape.plan(snapshot, spec)
techs.apply(data.raw.technology, plan)

log("\n" .. report.build(snapshot, plan, curve_string))

-- Original and new costs, for the in-game export (read via prototypes.mod_data).
local stored = {}
for name, t in pairs(snapshot) do
    local p = plan[name]
    stored[name] = {
        kind = t.kind,
        skipped = p.skipped,
        x = p.x,
        spent = p.spent,
        multiplier = p.multiplier,
        count = t.count,
        new_count = p.new_count,
        formula = t.formula,
        new_formula = p.new_formula,
        time = t.time,
        new_time = p.new_time,
        ingredients = t.ingredients,
        prerequisites = t.prerequisites,
    }
end

data:extend({
    {
        type = "mod-data",
        name = "research-cost-shaper",
        data = { format = 1, curve = curve_string, techs = stored },
    },
})
