-- Builds the export the companion page reads: the loaded modpack's techs
-- with original and planned costs. Pure: returns a table; the caller encodes.
--
-- The encoded form is "RCS1:" .. helpers.encode_string(json) -- deflate +
-- base64, like a blueprint string. Format: spec/export-format.md.

local export = {}

export.PREFIX = "RCS1:"
export.PAGE_URL = "https://bits-orio.github.io/research-cost-shaper/"

---@param snapshot table from techs.snapshot
---@param plan table from shape.plan
---@param curve_string string the setting as entered
---@param active_mods table<string, string> mod name -> version (`mods` in data stage)
---@return table
function export.build(snapshot, plan, curve_string, active_mods)
    local out_techs = {}
    for name, t in pairs(snapshot) do
        local p = plan[name]
        out_techs[name] = {
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
            trigger = t.trigger,
            max_level = t.max_level,
        }
    end
    local mod_list = {}
    for mod_name, version in pairs(active_mods) do
        mod_list[#mod_list + 1] = { mod_name, version }
    end
    table.sort(mod_list, function(a, b)
        return a[1] < b[1]
    end)
    return { format = 1, curve = curve_string, mods = mod_list, techs = out_techs }
end

return export
