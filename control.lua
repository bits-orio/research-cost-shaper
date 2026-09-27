local export_window = require("scripts.export_window")
local game_check = require("scripts.game_check")

-- Prototypes only change when mods or their settings do, so checking at
-- these two points covers every way costs can drift.
script.on_init(game_check.run)
script.on_configuration_changed(game_check.run)

-- Admins hear about the page once per save, then about any cost problems.
local function introduce(player)
    storage.introduced = storage.introduced or {}
    if not player.admin or storage.introduced[player.index] then
        return
    end
    storage.introduced[player.index] = true
    player.print({ "rcs.intro", prototypes.mod_data["research-cost-shaper"].data.page_url })
end

script.on_event(defines.events.on_player_joined_game, function(event)
    local player = game.get_player(event.player_index)
    introduce(player)
    game_check.warn_admin(player)
end)

commands.add_command("rcs-export", { "rcs.command-help" }, function(command)
    local player = command.player_index and game.get_player(command.player_index)
    if player then
        export_window.open(player, game_check.messages(game_check.run()))
        return
    end
    -- Server console: the same export is already on disk.
    local length = #prototypes.mod_data["research-cost-shaper"].data.export
    rcon.print("Research Cost Shaper export (" .. length .. " characters): script-output/research-cost-shaper/rcs-export.txt")
end)

-- Re-runs the check (the map's price multiplier can change mid-game).
commands.add_command("rcs-check", { "rcs.check-help" }, function(command)
    local player = command.player_index and game.get_player(command.player_index)
    for _, line in ipairs(game_check.messages(game_check.run())) do
        if player then
            player.print(line)
        else
            rcon.print(line)
        end
    end
end)

script.on_event(defines.events.on_gui_click, export_window.on_click)
script.on_event(defines.events.on_gui_closed, export_window.on_closed)
