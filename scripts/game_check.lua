-- Runs lib/check against the running game: did techs keep the costs this mod
-- set? Results go to the log, /rcs-check, the /rcs-export window, and once
-- per configuration to each admin who joins.

local check = require("lib.check")

local game_check = {}

local LIST_LIMIT = 5

-- The game's final technologies, in the shape lib/check expects.
local function actual_costs()
    local out = {}
    for name, proto in pairs(prototypes.technology) do
        out[name] = {
            count = proto.research_unit_count,
            formula = proto.research_unit_count_formula,
            time = proto.research_unit_energy / 60, -- ticks -> seconds, as in the prototype
            costed = next(proto.research_unit_ingredients) ~= nil,
        }
    end
    return out
end

local function log_details(result)
    local lines = { "Research Cost Shaper check: " .. result.checked .. " techs compared" }
    for _, c in ipairs(result.changed) do
        lines[#lines + 1] = string.format("  changed later: %s %s %s -> %s", c.name, c.what, tostring(c.planned), tostring(c.actual))
    end
    for _, name in ipairs(result.added) do
        lines[#lines + 1] = "  added later (not shaped): " .. name
    end
    for _, name in ipairs(result.missing) do
        lines[#lines + 1] = "  removed later: " .. name
    end
    if result.multiplier ~= 1 then
        lines[#lines + 1] = "  map technology price multiplier: " .. result.multiplier
    end
    log(table.concat(lines, "\n"))
end

--- Compares, stores and logs. Returns the result.
function game_check.run()
    local planned = prototypes.mod_data["research-cost-shaper"].data.planned
    local multiplier = game.difficulty_settings.technology_price_multiplier
    local result = check.compare(planned, actual_costs(), multiplier)
    result.multiplier = multiplier
    result.clean = check.clean(result, result.multiplier)
    -- Admins are warned once per distinct result, not on every re-check.
    local signature = table.concat({
        result.multiplier, check.names(result.changed, 1e9), check.names(result.added, 1e9), check.names(result.missing, 1e9),
    }, "|")
    if signature ~= storage.check_signature then
        storage.check_signature = signature
        storage.check_id = (storage.check_id or 0) + 1
    end
    storage.check = result
    log_details(result)
    return result
end

--- The result as localised lines for chat, console or GUI.
function game_check.messages(result)
    if result.clean then
        return { { "rcs.check-ok", result.checked } }
    end
    local lines = {}
    if #result.changed > 0 then
        lines[#lines + 1] = { "rcs.check-changed", #result.changed, check.names(result.changed, LIST_LIMIT) }
    end
    if #result.added > 0 then
        lines[#lines + 1] = { "rcs.check-added", #result.added, check.names(result.added, LIST_LIMIT) }
    end
    if #result.missing > 0 then
        lines[#lines + 1] = { "rcs.check-missing", #result.missing, check.names(result.missing, LIST_LIMIT) }
    end
    if result.multiplier ~= 1 then
        lines[#lines + 1] = { "rcs.check-multiplier", result.multiplier }
    end
    return lines
end

--- Tells an admin about a problem once per configuration.
function game_check.warn_admin(player)
    local result = storage.check
    if not (result and not result.clean and player.admin) then
        return
    end
    storage.warned = storage.warned or {}
    if storage.warned[player.index] == storage.check_id then
        return
    end
    storage.warned[player.index] = storage.check_id
    for _, line in ipairs(game_check.messages(result)) do
        player.print(line, { color = { 1, 0.7, 0.3 } })
    end
    player.print({ "rcs.check-more" })
end

return game_check
