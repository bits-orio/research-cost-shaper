local export_window = require("scripts.export_window")

commands.add_command("rcs-export", { "rcs.command-help" }, function(command)
    local player = command.player_index and game.get_player(command.player_index)
    if player then
        export_window.open(player)
        return
    end
    -- Server console: the same export is already on disk.
    local length = #prototypes.mod_data["research-cost-shaper"].data.export
    rcon.print("Research Cost Shaper export (" .. length .. " characters): script-output/research-cost-shaper/export.txt")
end)

script.on_event(defines.events.on_gui_click, export_window.on_click)
script.on_event(defines.events.on_gui_closed, export_window.on_closed)
