-- The /rcs-export window: the page URL and the export string, ready to copy.
--
-- Mods can't write to the system clipboard (the API only has a blueprint
-- clipboard), so each field gets a Select button that focuses and selects
-- it; the player then presses Ctrl+C.

local export_window = {}

local WINDOW = "rcs_export_window"
local CLOSE = "rcs_export_close"
local SELECT_URL = "rcs_select_url"
local SELECT_EXPORT = "rcs_select_export"
local HINT = "rcs_copy_hint"

local function stored()
    return prototypes.mod_data["research-cost-shaper"].data
end

-- A row holding a field (added by the caller) and its Select button.
local function field_row(frame, name)
    local row = frame.add({ type = "flow", name = name .. "_row", direction = "horizontal" })
    row.style.vertical_align = "top"
    row.style.horizontal_spacing = 8
    return row
end

local function select_button(row, name)
    row.add({ type = "button", name = name, caption = { "rcs.select" }, tooltip = { "rcs.select-tooltip" } })
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
        label.style.maximal_width = 660
        label.style.font_color = storage.check and storage.check.clean and { 0.55, 0.9, 0.55 } or { 1, 0.7, 0.3 }
    end

    frame.add({ type = "label", caption = { "rcs.export-step-page" } })
    local url_row = field_row(frame, "rcs_url")
    local url = url_row.add({ type = "textfield", name = "rcs_url", text = data.page_url })
    url.style.width = 580
    select_button(url_row, SELECT_URL)

    frame.add({ type = "label", caption = { "rcs.export-step-copy", #data.export } })
    local export_row = field_row(frame, "rcs_export")
    local box = export_row.add({ type = "text-box", name = "rcs_export", text = data.export })
    box.read_only = true
    box.word_wrap = true
    box.style.width = 580
    box.style.height = 240
    select_button(export_row, SELECT_EXPORT)

    local hint = frame.add({ type = "label", name = HINT, caption = { "rcs.copy-hint" } })
    hint.style.font_color = { 0.55, 0.9, 0.55 }

    frame.add({ type = "label", caption = { "rcs.export-step-file" } })
    frame.add({ type = "button", name = CLOSE, caption = { "rcs.close" } })

    box.focus()
    box.select_all()
    player.opened = frame
end

-- Focus and select a field, and say what to press next.
local function select_field(frame, row_name, field_name)
    local field = frame[row_name] and frame[row_name][field_name]
    if not field then
        return
    end
    field.focus()
    field.select_all()
    frame[HINT].caption = { "rcs.copy-hint" }
end

function export_window.on_click(event)
    local element = event.element
    if not element.valid then
        return
    end
    local player = game.get_player(event.player_index)
    local frame = player.gui.screen[WINDOW]
    if element.name == CLOSE then
        export_window.close(player)
    elseif frame and element.name == SELECT_URL then
        select_field(frame, "rcs_url_row", "rcs_url")
    elseif frame and element.name == SELECT_EXPORT then
        select_field(frame, "rcs_export_row", "rcs_export")
    end
end

function export_window.on_closed(event)
    if event.element and event.element.valid and event.element.name == WINDOW then
        event.element.destroy()
    end
end

return export_window
