local curve = require("lib.curve")
local techs = require("lib.techs")
local shape = require("lib.shape")
local report = require("lib.report")
local export = require("lib.export")

local OUTPUT_DIR = "research-cost-shaper/"

local curve_string = settings.startup["rcs-curve"].value
local spec, err = curve.parse(curve_string)
if not spec then
    error(
        "\n\nResearch Cost Shaper: the 'Cost curve' startup setting is invalid.\n"
            .. err
            .. "\n\nSetting value: "
            .. curve_string
            .. "\nExample of a valid curve: v1; pts=0:2, 0.5:4, 1:10\n"
    )
end

local snapshot = techs.snapshot(data.raw.technology)
local plan = shape.plan(snapshot, spec)
techs.apply(data.raw.technology, plan)

-- Written on every launch, before the main menu, so the page can be fed
-- without starting a game. Overwritten each time: the files describe the
-- modpack loaded right now, and a stale export would mislead the page.
local export_string = export.PREFIX
    .. helpers.encode_string(helpers.table_to_json(export.build(snapshot, plan, curve_string, mods)))
helpers.write_file(OUTPUT_DIR .. "export.txt", export_string)
helpers.write_file(OUTPUT_DIR .. "report.txt", report.build(snapshot, plan, curve_string) .. "\n")
log(
    "Research Cost Shaper: cost report and page export written to script-output/"
        .. OUTPUT_DIR
        .. " ("
        .. #export_string
        .. " characters)"
)

-- Same export for the in-game /rcs-export window.
data:extend({
    {
        type = "mod-data",
        name = "research-cost-shaper",
        data = { export = export_string, page_url = export.PAGE_URL },
    },
})
