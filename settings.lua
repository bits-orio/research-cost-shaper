local PAGE_URL = "https://bits-orio.github.io/research-cost-shaper/"

data:extend({
    -- Not read by the mod. Factorio can't show links in settings, but a text
    -- field can be selected and copied, so this is how players find the page.
    {
        type = "string-setting",
        name = "rcs-page",
        setting_type = "startup",
        default_value = PAGE_URL,
        allow_blank = true,
        auto_trim = true,
        order = "a",
    },
    {
        type = "string-setting",
        name = "rcs-curve",
        setting_type = "startup",
        default_value = "v1; pts=0:2, 0.5:4, 1:10",
        allow_blank = false,
        auto_trim = true,
        order = "b",
    },
})
