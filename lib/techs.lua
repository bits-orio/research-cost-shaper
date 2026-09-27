-- Reads technology prototypes into plain tables and writes planned costs back.
-- The only module that touches data.raw.

local techs = {}

local function ingredient_list(unit)
    local list = {}
    for _, ing in pairs(unit.ingredients or {}) do
        local name = ing.name or ing[1]
        local amount = ing.amount or ing[2] or 1
        list[#list + 1] = { name, amount }
    end
    table.sort(list, function(a, b)
        return a[1] < b[1]
    end)
    return list
end

local function per_unit(ingredients)
    local total = 0
    for _, ing in ipairs(ingredients) do
        total = total + ing[2]
    end
    return total
end

local function copy_list(list)
    local out = {}
    for i, v in ipairs(list or {}) do
        out[i] = v
    end
    return out
end

--- Snapshot of every technology, before any change.
---@param raw table data.raw.technology
---@return table<string, table> name -> {kind, exempt, prerequisites, packs,
---   ingredients, count, formula, time}. kind is "count", "formula" or
---   "trigger"; packs is what the tech alone costs in science packs (0 for
---   formula and trigger techs).
function techs.snapshot(raw)
    local out = {}
    for name, proto in pairs(raw) do
        local unit = proto.unit
        local entry = {
            prerequisites = copy_list(proto.prerequisites),
            exempt = proto.ignore_tech_cost_multiplier == true,
            packs = 0,
        }
        if not unit then
            entry.kind = "trigger"
        else
            entry.ingredients = ingredient_list(unit)
            entry.time = unit.time
            if unit.count_formula then
                entry.kind = "formula"
                entry.formula = unit.count_formula
            else
                entry.kind = "count"
                entry.count = unit.count or 0
                entry.packs = entry.count * per_unit(entry.ingredients)
            end
        end
        out[name] = entry
    end
    return out
end

--- Writes planned costs into the prototypes.
---@param raw table data.raw.technology
---@param plan table<string, table> from shape.plan
function techs.apply(raw, plan)
    for name, p in pairs(plan) do
        local unit = raw[name] and raw[name].unit
        if unit and p.changed then
            if p.new_count then
                unit.count = p.new_count
            end
            if p.new_formula then
                unit.count_formula = p.new_formula
            end
            if p.new_time then
                unit.time = p.new_time
            end
        end
    end
end

return techs
