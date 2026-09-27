-- Cost curve: parses the curve string and evaluates the multiplier at a
-- progress position x in [0, 1].
--
-- String format (spec/curve-format.md):
--   v1; pts=0:2, 0.5:4, 1:10; inf=20; time=1
--
-- Control points are joined by a monotone cubic (Fritsch-Carlson) in log
-- space, so the curve passes through every point, never overshoots between
-- them, and halfway between 4x and 100x is 20x, not 52x.
--
-- site/curve.js is a line-for-line port. Change both together; the shared
-- cases in spec/curve-cases.json keep them in agreement.

local curve = {}

local KNOWN_KEYS = { pts = true, inf = true, time = true }

local function trim(s)
    return s:match("^%s*(.-)%s*$")
end

local function split(s, sep)
    local parts = {}
    for part in (s .. sep):gmatch("(.-)" .. sep) do
        parts[#parts + 1] = trim(part)
    end
    return parts
end

-- Strict number parse. The charset guard keeps Lua's tonumber and JS's
-- Number from disagreeing on inputs like "", "0x1p4" or "Infinity".
local function parse_number(s)
    if s == "" or not s:match("^[%d%.eE+-]+$") then
        return nil
    end
    local n = tonumber(s)
    if n == nil or n ~= n or n == math.huge or n == -math.huge then
        return nil
    end
    return n
end

local function parse_positive(s, label)
    local n = parse_number(s)
    if n == nil or n <= 0 then
        return nil, label .. " must be a positive number, got '" .. s .. "'"
    end
    return n
end

local function parse_points(s)
    if s == "" then
        return nil, "pts needs at least one point"
    end
    local points = {}
    for _, pair in ipairs(split(s, ",")) do
        local xs, ms = pair:match("^(.-):(.*)$")
        if not xs then
            return nil, "point '" .. pair .. "' must look like x:multiplier"
        end
        local x = parse_number(trim(xs))
        if x == nil or x < 0 or x > 1 then
            return nil, "point '" .. pair .. "': x must be between 0 and 1"
        end
        local m, err = parse_positive(trim(ms), "point '" .. pair .. "': multiplier")
        if not m then
            return nil, err
        end
        local prev = points[#points]
        if prev and x <= prev.x then
            return nil, "point '" .. pair .. "': x values must increase left to right"
        end
        points[#points + 1] = { x = x, m = m }
    end
    return points
end

--- Parses a curve string.
---@param s string
---@return table|nil spec {points = {{x, m}...}, inf = number|nil, time = number}
---@return string|nil err
function curve.parse(s)
    if type(s) ~= "string" then
        return nil, "curve must be a string"
    end
    local sections = split(s, ";")
    if sections[1] ~= "v1" then
        return nil, "curve must start with 'v1;'"
    end
    local spec = { time = 1 }
    local seen = {}
    for i = 2, #sections do
        local section = sections[i]
        if section ~= "" then
            local key, value = section:match("^(%w+)%s*=%s*(.*)$")
            if not key or not KNOWN_KEYS[key] then
                return nil, "unknown section '" .. section .. "'"
            end
            if seen[key] then
                return nil, "'" .. key .. "' appears twice"
            end
            seen[key] = true
            local parsed, err
            if key == "pts" then
                parsed, err = parse_points(value)
                key = "points"
            else
                parsed, err = parse_positive(value, key)
            end
            if parsed == nil then
                return nil, err
            end
            spec[key] = parsed
        end
    end
    if not spec.points then
        return nil, "curve needs a 'pts=' section"
    end
    return spec
end

-- Fritsch-Carlson tangents over (x, log m).
local function tangents(xs, ys)
    local n = #xs
    local delta, t = {}, {}
    for k = 1, n - 1 do
        delta[k] = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k])
    end
    t[1] = delta[1]
    t[n] = delta[n - 1]
    for k = 2, n - 1 do
        if delta[k - 1] * delta[k] > 0 then
            t[k] = (delta[k - 1] + delta[k]) / 2
        else
            t[k] = 0
        end
    end
    for k = 1, n - 1 do
        if delta[k] == 0 then
            t[k] = 0
            t[k + 1] = 0
        end
    end
    for k = 1, n - 1 do
        if delta[k] ~= 0 then
            local a = t[k] / delta[k]
            local b = t[k + 1] / delta[k]
            local r = a * a + b * b
            if r > 9 then
                local tau = 3 / math.sqrt(r)
                t[k] = tau * a * delta[k]
                t[k + 1] = tau * b * delta[k]
            end
        end
    end
    return t
end

--- Builds an evaluator from a parsed spec.
---@param spec table from curve.parse
---@return fun(x: number): number multiplier at x
function curve.build(spec)
    local xs, ys, ms = {}, {}, {}
    for i, p in ipairs(spec.points) do
        xs[i] = p.x
        ys[i] = math.log(p.m)
        ms[i] = p.m
    end
    local n = #xs
    if n == 1 then
        return function()
            return ms[1]
        end
    end
    local t = tangents(xs, ys)
    return function(x)
        if x <= xs[1] then
            return ms[1]
        end
        if x >= xs[n] then
            return ms[n]
        end
        local k = 1
        while x >= xs[k + 1] do
            k = k + 1
        end
        local h = xs[k + 1] - xs[k]
        local u = (x - xs[k]) / h
        local u2, u3 = u * u, u * u * u
        local y = (2 * u3 - 3 * u2 + 1) * ys[k]
            + (u3 - 2 * u2 + u) * h * t[k]
            + (-2 * u3 + 3 * u2) * ys[k + 1]
            + (u3 - u2) * h * t[k + 1]
        return math.exp(y)
    end
end

return curve
