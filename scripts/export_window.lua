-- The /rcs-export window: the page URL and the export string, ready to copy.

local export_window = {}

local WINDOW = "rcs_export_window"
local CLOSE = "rcs_export_close"

local function stored()
    return prototypes.mod_data["research-cost-shaper"].data
end

function export_window.close(player)
    local frame = player.gui.screen[WINDOW]
    if frame then
        frame.destroy()
    end
end

--- @param check_lines LocalisedString[] result of the cost check, shown on top
function export_window.open(player, check_lines)
    export_window.close(player)
    local data = stored()
    local frame = player.gui.screen.add({
        type = "frame",
        name = WINDOW,
        direction = "vertical",
        caption = { "rcs.export-title" },
    })
    frame.auto_center = true

    -- Whether the game's costs are the ones this export describes.
    for _, line in ipairs(check_lines or {}) do
        local label = frame.add({ type = "label", caption = line })
        label.style.single_line = false
        label.style.maximal_width = 600
        label.style.font_color = storage.check and storage.check.clean and { 0.55, 0.9, 0.55 } or { 1, 0.7, 0.3 }
    end

    frame.add({ type = "label", caption = { "rcs.export-step-page" } })
    local url = frame.add({ type = "textfield", text = data.page_url })
    url.style.horizontally_stretchable = true

    frame.add({ type = "label", caption = { "rcs.export-step-copy", #data.export } })
    local box = frame.add({ type = "text-box", text = data.export })
    box.read_only = true
    box.word_wrap = true
    box.style.width = 600
    box.style.height = 240

    frame.add({ type = "label", caption = { "rcs.export-step-file" } })
    frame.add({ type = "button", name = CLOSE, caption = { "rcs.close" } })

    box.focus()
    box.select_all()
    player.opened = frame
end

function export_window.on_click(event)
    if event.element.valid and event.element.name == CLOSE then
        export_window.close(game.get_player(event.player_index))
    end
end

function export_window.on_closed(event)
    if event.element and event.element.valid and event.element.name == WINDOW then
        event.element.destroy()
    end
end

return export_window
