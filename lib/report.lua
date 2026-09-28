-- Builds the human-readable cost report written to factorio-current.log.
-- Pure: returns a string.

local report = {}

-- Pack names in the order each pack first appears along the curve, so a
-- pack set reads red+green+blue rather than alphabetically.
local function pack_key(ingredients, rank)
    local names = {}
    for i, ing in ipairs(ingredients or {}) do
        names[i] = ing[1]
    end
    table.sort(names, function(a, b)
        if rank[a] ~= rank[b] then
            return rank[a] < rank[b]
        end
        return a < b
    end)
    for i, name in ipairs(names) do
        names[i] = (name:gsub("%-science%-pack$", ""))
    end
    return table.concat(names, "+")
end

local function pack_ranks(names, snapshot)
    local rank, next_rank = {}, 1
    for _, name in ipairs(names) do
        for _, ing in ipairs(snapshot[name].ingredients or {}) do
            if not rank[ing[1]] then
                rank[ing[1]] = next_rank
                next_rank = next_rank + 1
            end
        end
    end
    return rank
end

-- 1234567 -> "1,234,567"
local function thousands(n)
    local s = string.format("%d", n)
    local out = s:reverse():gsub("(%d%d%d)", "%1,"):reverse()
    return (out:gsub("^,", ""))
end

local function sorted_names(snapshot, plan)
    local names = {}
    for name in pairs(snapshot) do
        names[#names + 1] = name
    end
    table.sort(names, function(a, b)
        if plan[a].x ~= plan[b].x then
            return plan[a].x < plan[b].x
        end
        return a < b
    end)
    return names
end

local function per_unit(ingredients)
    local total = 0
    for _, ing in ipairs(ingredients or {}) do
        total = total + ing[2]
    end
    return total
end

-- x2.45, x88.2, x1,000, x100,000: no scientific notation for big multipliers.
local function fmt_mult(m)
    if m >= 1000 then
        return "x" .. thousands(math.floor(m + 0.5))
    end
    return "x" .. string.format("%.3g", m)
end

local function tech_line(name, t, p, rank)
    local head = string.format("  %.3f  %-44s", p.x, name)
    if p.skipped then
        return head .. "  unchanged (" .. p.skipped .. ")"
    end
    if t.kind == "formula" then
        return head .. string.format("  %-10s  %s", fmt_mult(p.multiplier), p.new_formula or t.formula)
    end
    return head
        .. string.format("  %-10s  %s -> %s", fmt_mult(p.multiplier), thousands(t.count), thousands(p.new_count or t.count))
        .. "  [" .. pack_key(t.ingredients, rank) .. "]"
end

-- Totals per distinct set of science packs, in order of first appearance.
local function pack_set_lines(names, snapshot, plan, rank)
    local groups, order = {}, {}
    for _, name in ipairs(names) do
        local t, p = snapshot[name], plan[name]
        if t.kind == "count" then
            local key = pack_key(t.ingredients, rank)
            local g = groups[key]
            if not g then
                g = { techs = 0, before = 0, after = 0 }
                groups[key] = g
                order[#order + 1] = key
            end
            local each = per_unit(t.ingredients)
            g.techs = g.techs + 1
            g.before = g.before + t.count * each
            g.after = g.after + (p.new_count or t.count) * each
        end
    end
    local lines = { "Science packs by pack set (techs, packs before -> after):" }
    for _, key in ipairs(order) do
        local g = groups[key]
        lines[#lines + 1] = string.format(
            "  %-60s %4d  %s -> %s",
            key,
            g.techs,
            thousands(g.before),
            thousands(g.after)
        )
    end
    return lines
end

--- Formats the report.
---@param snapshot table from techs.snapshot
---@param plan table from shape.plan
---@param curve_string string the setting as entered
---@return string
function report.build(snapshot, plan, curve_string)
    local names = sorted_names(snapshot, plan)
    local rank = pack_ranks(names, snapshot)
    local counts = { count = 0, formula = 0, skipped = 0 }
    for _, name in ipairs(names) do
        if plan[name].skipped then
            counts.skipped = counts.skipped + 1
        else
            counts[snapshot[name].kind] = counts[snapshot[name].kind] + 1
        end
    end
    local lines = {
        "Research Cost Shaper report",
        "Curve: " .. curve_string,
        string.format(
            "Techs: %d costed by count, %d by formula, %d unchanged (trigger or exempt)",
            counts.count,
            counts.formula,
            counts.skipped
        ),
        "",
    }
    for _, line in ipairs(pack_set_lines(names, snapshot, plan, rank)) do
        lines[#lines + 1] = line
    end
    lines[#lines + 1] = ""
    lines[#lines + 1] = "      x  technology                                    multiplier  cost"
    for _, name in ipairs(names) do
        lines[#lines + 1] = tech_line(name, snapshot[name], plan[name], rank)
    end
    return table.concat(lines, "\n")
end

return report
