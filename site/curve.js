// Cost curve: parses the curve string and evaluates the multiplier at a
// progress position x in [0, 1].
//
// Line-for-line port of lib/curve.lua. Change both together; the shared
// cases in spec/curve-cases.json keep them in agreement.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RcsCurve = factory();
})(this, function () {
  const KNOWN_KEYS = { pts: true, inf: true, time: true };

  const trim = (s) => s.replace(/^\s+|\s+$/g, "");
  const split = (s, sep) => s.split(sep).map(trim);

  // Strict number parse; mirrors parse_number in lib/curve.lua.
  function parseNumber(s) {
    if (s === "" || !/^[0-9.eE+-]+$/.test(s)) return null;
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return n;
  }

  function parsePositive(s, label) {
    const n = parseNumber(s);
    if (n === null || n <= 0) return [null, `${label} must be a positive number, got '${s}'`];
    return [n, null];
  }

  function parsePoints(s) {
    if (s === "") return [null, "pts needs at least one point"];
    const points = [];
    for (const pair of split(s, ",")) {
      const match = pair.match(/^(.*?):(.*)$/s);
      if (!match) return [null, `point '${pair}' must look like x:multiplier`];
      const x = parseNumber(trim(match[1]));
      if (x === null || x < 0 || x > 1) return [null, `point '${pair}': x must be between 0 and 1`];
      const [m, err] = parsePositive(trim(match[2]), `point '${pair}': multiplier`);
      if (m === null) return [null, err];
      const prev = points[points.length - 1];
      if (prev && x <= prev.x) return [null, `point '${pair}': x values must increase left to right`];
      points.push({ x, m });
    }
    return [points, null];
  }

  /** Parses a curve string. Returns [spec, null] or [null, error]. */
  function parse(s) {
    if (typeof s !== "string") return [null, "curve must be a string"];
    const sections = split(s, ";");
    if (sections[0] !== "v1") return [null, "curve must start with 'v1;'"];
    const spec = { time: 1 };
    const seen = {};
    for (const section of sections.slice(1)) {
      if (section === "") continue;
      const match = section.match(/^([A-Za-z0-9]+)\s*=\s*(.*)$/s);
      if (!match || !KNOWN_KEYS[match[1]]) return [null, `unknown section '${section}'`];
      let key = match[1];
      if (seen[key]) return [null, `'${key}' appears twice`];
      seen[key] = true;
      let parsed, err;
      if (key === "pts") {
        [parsed, err] = parsePoints(match[2]);
        key = "points";
      } else {
        [parsed, err] = parsePositive(match[2], key);
      }
      if (parsed === null) return [null, err];
      spec[key] = parsed;
    }
    if (!spec.points) return [null, "curve needs a 'pts=' section"];
    return [spec, null];
  }

  // Fritsch-Carlson tangents over (x, log m).
  function tangents(xs, ys) {
    const n = xs.length;
    const delta = [];
    const t = [];
    for (let k = 0; k < n - 1; k++) delta[k] = (ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]);
    t[0] = delta[0];
    t[n - 1] = delta[n - 2];
    for (let k = 1; k < n - 1; k++) {
      t[k] = delta[k - 1] * delta[k] > 0 ? (delta[k - 1] + delta[k]) / 2 : 0;
    }
    for (let k = 0; k < n - 1; k++) {
      if (delta[k] === 0) {
        t[k] = 0;
        t[k + 1] = 0;
      }
    }
    for (let k = 0; k < n - 1; k++) {
      if (delta[k] !== 0) {
        const a = t[k] / delta[k];
        const b = t[k + 1] / delta[k];
        const r = a * a + b * b;
        if (r > 9) {
          const tau = 3 / Math.sqrt(r);
          t[k] = tau * a * delta[k];
          t[k + 1] = tau * b * delta[k];
        }
      }
    }
    return t;
  }

  /** Builds an evaluator x -> multiplier from a parsed spec. */
  function build(spec) {
    const xs = spec.points.map((p) => p.x);
    const ys = spec.points.map((p) => Math.log(p.m));
    const ms = spec.points.map((p) => p.m);
    const n = xs.length;
    if (n === 1) return () => ms[0];
    const t = tangents(xs, ys);
    return function (x) {
      if (x <= xs[0]) return ms[0];
      if (x >= xs[n - 1]) return ms[n - 1];
      let k = 0;
      while (x >= xs[k + 1]) k++;
      const h = xs[k + 1] - xs[k];
      const u = (x - xs[k]) / h;
      const u2 = u * u;
      const u3 = u * u * u;
      const y =
        (2 * u3 - 3 * u2 + 1) * ys[k] +
        (u3 - 2 * u2 + u) * h * t[k] +
        (-2 * u3 + 3 * u2) * ys[k + 1] +
        (u3 - u2) * h * t[k + 1];
      return Math.exp(y);
    };
  }

  return { parse, build };
});
