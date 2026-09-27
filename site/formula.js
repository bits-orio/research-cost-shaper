// Evaluates a technology count_formula (e.g. "2^(L-6)*1000") at a level, so
// the page can show levelled and infinite techs as numbers. Supports numbers,
// L/l, + - * / ^ and parentheses; anything else returns null and the page
// falls back to showing the formula text.

(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.RcsFormula = factory();
})(this, function () {
  function tokenize(src) {
    const tokens = [];
    const re = /\s*(?:(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+)|([Ll])|([-+*/^()]))/y;
    let i = 0;
    while (i < src.length) {
      if (/^\s*$/.test(src.slice(i))) break;
      re.lastIndex = i;
      const m = re.exec(src);
      if (!m) return null;
      tokens.push(m[1] ? { n: Number(m[1]) } : m[2] ? { l: true } : { op: m[3] });
      i = re.lastIndex;
    }
    return tokens;
  }

  /** Value of `formula` at level `L`, or null if it can't be evaluated. */
  function evaluate(formula, L) {
    const tokens = typeof formula === "string" ? tokenize(formula) : null;
    if (!tokens || !tokens.length) return null;
    let pos = 0;
    const peek = () => tokens[pos];
    const isOp = (op) => peek() && peek().op === op;
    function expr() {
      let v = term();
      while (isOp("+") || isOp("-")) v = tokens[pos++].op === "+" ? v + term() : v - term();
      return v;
    }
    function term() {
      let v = unary();
      while (isOp("*") || isOp("/")) v = tokens[pos++].op === "*" ? v * unary() : v / unary();
      return v;
    }
    function unary() {
      if (isOp("-")) { pos++; return -unary(); }
      if (isOp("+")) { pos++; return unary(); }
      return power();
    }
    function power() {
      const base = atom();
      if (isOp("^")) { pos++; return base ** unary(); } // right-associative
      return base;
    }
    function atom() {
      const t = tokens[pos++];
      if (!t) throw new Error("end");
      if (t.n !== undefined) return t.n;
      if (t.l) return L;
      if (t.op === "(") {
        const v = expr();
        if (!isOp(")")) throw new Error("paren");
        pos++;
        return v;
      }
      throw new Error("token");
    }
    try {
      const v = expr();
      return pos === tokens.length && Number.isFinite(v) ? v : null;
    } catch {
      return null;
    }
  }

  /** Level encoded in a tech name ("physical-projectile-damage-7" -> 7), else 1. */
  function levelOf(name) {
    const m = /-(\d+)$/.exec(name);
    return m ? Number(m[1]) : 1;
  }

  return { evaluate, levelOf };
});
