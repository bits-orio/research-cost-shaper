-- Progress position of every technology: where it sits on the curve's x-axis.
--
-- x is the log of the science spent to reach and finish a tech -- its own
-- packs plus the packs of every distinct ancestor, each counted once --
-- scaled so the cheapest tech is 0 and the most expensive is 1.
--
-- Pure: takes plain tables, never touches data.raw, so it runs under the
-- test harness unchanged.

local progress = {}

-- Distinct ancestors of `name`, walking prerequisites iteratively.
-- Prerequisite cycles and names with no entry are tolerated.
local function ancestors(techs, name)
    local seen = { [name] = true }
    local stack = { name }
    local found = {}
    while #stack > 0 do
        local current = table.remove(stack)
        local tech = techs[current]
        for _, prereq in ipairs(tech and tech.prerequisites or {}) do
            if not seen[prereq] then
                seen[prereq] = true
                found[#found + 1] = prereq
                stack[#stack + 1] = prereq
            end
        end
    end
    return found
end

local function spent_on(techs, name)
    local total = techs[name].packs
    for _, ancestor in ipairs(ancestors(techs, name)) do
        local tech = techs[ancestor]
        if tech then
            total = total + tech.packs
        end
    end
    return total
end

--- Computes science spent and progress x for every technology.
---@param techs table<string, {packs: number, prerequisites: string[]}>
---   packs: science packs this tech alone costs (count * sum of ingredient
---   amounts); 0 for trigger techs and for techs costed by a formula.
---@return table<string, {spent: number, x: number}>
function progress.compute(techs)
    local result = {}
    local lo, hi = math.huge, -math.huge
    for name in pairs(techs) do
        local spent = spent_on(techs, name)
        result[name] = { spent = spent }
        if spent > 0 then
            local l = math.log(spent)
            if l < lo then
                lo = l
            end
            if l > hi then
                hi = l
            end
        end
    end
    local range = hi - lo
    for _, r in pairs(result) do
        if r.spent <= 0 or range <= 0 then
            r.x = 0
        else
            r.x = (math.log(r.spent) - lo) / range
        end
    end
    return result
end

return progress
