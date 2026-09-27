-- Did the game end up with the costs Research Cost Shaper set? Mods whose
-- data-final-fixes run after this one can change techs again, so the running
-- game compares its final prototypes against what this mod left behind.
-- Pure: plain tables in, plain tables out.

local check = {}

--- What this mod left each tech with, from the data stage.
---@param snapshot table from techs.snapshot
---@param plan table from shape.plan
---@return table<string, table> name -> {trigger = true} or {count?, formula?, time?}
function check.planned(snapshot, plan)
    local out = {}
    for name, t in pairs(snapshot) do
        local p = plan[name]
        if t.kind == "trigger" then
            out[name] = { trigger = true }
        elseif t.kind == "formula" then
            out[name] = { formula = p.new_formula or t.formula, time = p.new_time or t.time, exempt = t.exempt }
        else
            out[name] = { count = p.new_count or t.count, time = p.new_time or t.time, exempt = t.exempt }
        end
    end
    return out
end

local function sorted(list, key)
    table.sort(list, function(a, b)
        return (key and a[key] or a) < (key and b[key] or b)
    end)
    return list
end

local function time_differs(planned, actual)
    return planned and actual and math.abs(planned - actual) > 1e-6 * math.max(1, planned)
end

-- The game's counts already include the map's technology price multiplier
-- (except for techs that opt out), possibly rounded, so allow one unit.
local function count_differs(p, actual_count, multiplier)
    local expected = p.count * (p.exempt and 1 or multiplier)
    return math.abs(actual_count - expected) > 1 + 1e-9 * expected
end

--- Compares planned costs with the game's final ones.
---@param planned table from check.planned
---@param actual table<string, table> name -> {count?, formula?, time?, costed}
---@param multiplier number the map's technology price multiplier (default 1)
---@return table {changed = {{name, what, planned, actual}}, added = {name}, missing = {name}, checked = n}
function check.compare(planned, actual, multiplier)
    multiplier = multiplier or 1
    local result = { changed = {}, added = {}, missing = {}, checked = 0 }
    for name, p in pairs(planned) do
        local a = actual[name]
        if not a then
            if not p.trigger then
                result.missing[#result.missing + 1] = name
            end
        elseif not p.trigger then
            result.checked = result.checked + 1
            if p.formula and a.formula ~= p.formula then
                result.changed[#result.changed + 1] =
                    { name = name, what = "formula", planned = p.formula, actual = a.formula or tostring(a.count) }
            elseif p.count and (a.formula or count_differs(p, a.count, multiplier)) then
                result.changed[#result.changed + 1] =
                    { name = name, what = "count", planned = p.count, actual = a.formula or a.count }
            elseif time_differs(p.time, a.time) then
                result.changed[#result.changed + 1] = { name = name, what = "time", planned = p.time, actual = a.time }
            end
        end
    end
    for name, a in pairs(actual) do
        if not planned[name] and a.costed then
            result.added[#result.added + 1] = name
        end
    end
    sorted(result.changed, "name")
    sorted(result.added)
    sorted(result.missing)
    return result
end

--- True when everything matched and nothing else changes costs.
function check.clean(result, price_multiplier)
    return #result.changed == 0 and #result.added == 0 and #result.missing == 0 and price_multiplier == 1
end

--- "a, b, c and 4 more"
function check.names(list, limit)
    local names = {}
    for i = 1, math.min(#list, limit) do
        local item = list[i]
        names[i] = type(item) == "table" and item.name or item
    end
    local text = table.concat(names, ", ")
    if #list > limit then
        text = text .. " and " .. (#list - limit) .. " more"
    end
    return text
end

return check
