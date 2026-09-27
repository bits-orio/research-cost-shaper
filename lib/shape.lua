-- Plans the new cost of every technology from a snapshot and a curve.
-- Pure: no data.raw, so the test harness runs it unchanged.
--
-- Rounding rules are part of the contract with site/ (spec/curve-format.md):
--   new count = round-half-up(count * multiplier), clamped to [1, 2^53]

local curve = require("lib.curve")
local progress = require("lib.progress")

local shape = {}

local MAX_COUNT = 2 ^ 53

-- Multiplier as a plain decimal for a count_formula. Exponent notation is
-- avoided because the formula parser's support for it is not documented.
local function formula_number(m)
    local s = string.format("%.6f", m):gsub("0+$", ""):gsub("%.$", "")
    if tonumber(s) == 0 then
        return "0.000001"
    end
    return s
end

function shape.round_count(v)
    local n = math.floor(v + 0.5)
    if n < 1 then
        return 1
    end
    if n > MAX_COUNT then
        return MAX_COUNT
    end
    return n
end

--- Plans new costs.
---@param snapshot table from techs.snapshot
---@param spec table from curve.parse
---@return table<string, table> name -> {x, spent, multiplier, changed,
---   skipped?, new_count?, new_formula?, new_time?}
function shape.plan(snapshot, spec)
    local f = curve.build(spec)
    local inf = spec.inf or f(1)
    local positions = progress.compute(snapshot)
    local plan = {}
    for name, t in pairs(snapshot) do
        local pos = positions[name]
        local p = { x = pos.x, spent = pos.spent, multiplier = 1, changed = false }
        if t.kind == "trigger" then
            p.skipped = "trigger"
        elseif t.exempt then
            p.skipped = "exempt"
        else
            if t.kind == "count" then
                p.multiplier = f(pos.x)
                p.new_count = shape.round_count(t.count * p.multiplier)
            elseif inf ~= 1 then
                p.multiplier = inf
                p.new_formula = "(" .. t.formula .. ")*" .. formula_number(inf)
            end
            if spec.time ~= 1 and t.time then
                p.new_time = t.time * spec.time
            end
            p.changed = p.new_count ~= nil or p.new_formula ~= nil or p.new_time ~= nil
        end
        plan[name] = p
    end
    return plan
end

return shape
