// rcs-share: stores shared runs (an export + a curve) so the static
// companion page can hand out short links. KV is the scarce free-tier
// resource, so writes are dedup'd by content hash before touching it.
// It also looks up mod portal details for the page (see handleMods).

const MAX_BODY_BYTES = 300 * 1024; // 300 KB, well over a real export+curve
const MAX_INFLATED_BYTES = 5 * 1024 * 1024; // guard against zip-bomb style input
const ID_RE = /^[a-z2-7]{10}$/;
const BASE32_ALPHABET = "abcdefghijklmnopqrstuvwxyz234567";

// ---------------------------------------------------------------- helpers

function allowedOrigins(env) {
  return (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function corsHeaders(origin, env) {
  const headers = { "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };
  if (origin && allowedOrigins(env).includes(origin)) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function json(body, status, origin, env) {
  const headers = { "Content-Type": "application/json" };
  if (origin && env) Object.assign(headers, corsHeaders(origin, env));
  return new Response(JSON.stringify(body), { status, headers });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

// RFC 4648 base32, lowercased, no padding. Standard algorithm, just a
// lowercase alphabet so ids read easily in URLs.
function base32(bytes) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

// Same content -> same id, so re-sharing an unchanged run never writes KV twice.
async function shareId({ exportStr, curve, title }) {
  const canonical = JSON.stringify({ export: exportStr, curve, title: title ?? "" });
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return base32(new Uint8Array(digest)).slice(0, 10);
}

// Inflate with a running size cap so a small base64 string can't decompress
// into something huge (zip-bomb guard). Mirrors site/app.js's decode().
async function inflateJson(bytes, maxBytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "", total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) throw new Error("Export is too large after decompression.");
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return JSON.parse(text);
}

async function validateExport(exportStr) {
  if (typeof exportStr !== "string" || !exportStr.startsWith("RCS1:")) {
    return { error: "Export must start with RCS1:" };
  }
  let bytes;
  try {
    bytes = Uint8Array.from(atob(exportStr.slice(5)), (c) => c.charCodeAt(0));
  } catch {
    return { error: "Export is not valid base64." };
  }
  let data;
  try {
    data = await inflateJson(bytes, MAX_INFLATED_BYTES);
  } catch (err) {
    return { error: err.message.includes("too large") ? err.message : "Export is corrupt or not a valid export." };
  }
  if (data?.format !== 1) return { error: "Export format is not supported (expected format 1)." };
  if (!data.techs || typeof data.techs !== "object" || Array.isArray(data.techs) || Object.keys(data.techs).length < 1) {
    return { error: "Export has no techs." };
  }
  if (!Array.isArray(data.mods)) return { error: "Export has no mod list." };
  return { data };
}

function validateCurve(curve) {
  if (typeof curve !== "string" || curve.length === 0) return { error: "Curve is missing." };
  if (curve.length > 500) return { error: "Curve string is too long." };
  if (!curve.trim().startsWith("v1")) return { error: "Curve must start with v1." };
  return { curve };
}

// Strip control characters, trim, cap length; empty result means "omit".
function cleanTitle(title) {
  if (typeof title !== "string") return undefined;
  const stripped = title.replace(/\p{Cc}/gu, "").trim().slice(0, 80);
  return stripped || undefined;
}

function summarize(exportData) {
  const mods = exportData.mods.filter(([name]) => name !== "research-cost-shaper");
  return {
    mods: mods.length,
    techs: Object.keys(exportData.techs).length,
    spaceAge: exportData.mods.some(([name]) => name === "space-age"),
  };
}

function describeSummary(record) {
  const s = record.summary || {};
  const parts = [`${s.mods ?? "?"} mods`, `${s.techs ?? "?"} techs`];
  if (s.spaceAge) parts.push("Space Age");
  parts.push(`curve ${record.curve}`);
  const text = parts.join(" · ");
  return text.length > 200 ? text.slice(0, 197) + "…" : text;
}

// ---------------------------------------------------------------- routes

async function handleShare(request, env) {
  const origin = request.headers.get("Origin");
  if (!origin || !allowedOrigins(env).includes(origin)) return json({ error: "Origin not allowed." }, 403, origin, env);

  const lenHeader = request.headers.get("Content-Length");
  if (lenHeader && Number(lenHeader) > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413, origin, env);

  const bodyText = await request.text();
  if (bodyText.length > MAX_BODY_BYTES) return json({ error: "Request body is too large." }, 413, origin, env);

  let body;
  try {
    body = JSON.parse(bodyText);
  } catch {
    return json({ error: "Body is not valid JSON." }, 400, origin, env);
  }

  if (env.UPLOAD_LIMIT) {
    const key = request.headers.get("CF-Connecting-IP") || "unknown";
    const { success } = await env.UPLOAD_LIMIT.limit({ key });
    if (!success) return json({ error: "Too many uploads. Try again in a minute." }, 429, origin, env);
  }

  const curveResult = validateCurve(body.curve);
  if (curveResult.error) return json({ error: curveResult.error }, 400, origin, env);

  const exportResult = await validateExport(body.export);
  if (exportResult.error) return json({ error: exportResult.error }, 400, origin, env);

  const title = cleanTitle(body.title);
  const id = await shareId({ exportStr: body.export, curve: curveResult.curve, title });
  const key = `s:${id}`;

  const existing = await env.SHARES.get(key);
  if (!existing) {
    const record = {
      v: 1,
      export: body.export,
      curve: curveResult.curve,
      title,
      created: new Date().toISOString(),
      summary: summarize(exportResult.data),
    };
    await env.SHARES.put(key, JSON.stringify(record));
  }

  const workerOrigin = new URL(request.url).origin;
  return json(
    { id, url: `${workerOrigin}/s/${id}`, page: `${env.PAGE_URL}?s=${id}` },
    existing ? 200 : 201,
    origin,
    env,
  );
}

// Reads are public, so every answer (404s included) must be readable
// cross-origin; otherwise the page can't tell "missing" from "unreachable".
function publicNotFound() {
  return new Response(JSON.stringify({ error: "Not found." }), {
    status: 404,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
  });
}

async function handleGetShare(id, env) {
  if (!ID_RE.test(id)) return publicNotFound();
  const raw = await env.SHARES.get(`s:${id}`);
  if (!raw) return publicNotFound();
  return new Response(raw, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}

// The mod portal's API sends no CORS headers, so the page asks here for the
// title, summary and thumbnail of the mods in a run. Only the per-mod
// endpoint carries the thumbnail, so it's one upstream call per mod; those
// are edge-cached for a day, and the batch cap keeps a request inside the
// free tier's 50-subrequest limit.
const PORTAL = "https://mods.factorio.com";
const PORTAL_ASSETS = "https://assets-mod.factorio.com";
const MAX_MODS_PER_REQUEST = 40;
const MOD_NAME_RE = /^[A-Za-z0-9_\- ]{1,100}$/;

// null: the portal has no such mod (private or local). undefined: couldn't
// tell right now, so the page keeps the link and may ask again later.
async function portalMod(name) {
  try {
    const res = await fetch(`${PORTAL}/api/mods/${encodeURIComponent(name)}`, {
      cf: { cacheTtlByStatus: { "200-299": 86400, 404: 3600, "500-599": 0 }, cacheEverything: true },
    });
    if (res.status === 404) return null;
    if (!res.ok) return undefined;
    const m = await res.json();
    // Mods without a thumbnail get the bare "/assets/.thumb.png" path.
    const thumb = typeof m.thumbnail === "string" && !m.thumbnail.endsWith("/.thumb.png") ? `${PORTAL_ASSETS}${m.thumbnail}` : null;
    return { title: m.title || name, owner: m.owner || null, summary: m.summary || "", downloads: m.downloads_count ?? null, thumbnail: thumb };
  } catch {
    return undefined;
  }
}

async function handleMods(url) {
  const names = [...new Set(url.searchParams.getAll("name"))];
  if (names.length === 0 || names.length > MAX_MODS_PER_REQUEST || !names.every((n) => MOD_NAME_RE.test(n))) {
    return new Response(JSON.stringify({ error: `Pass 1 to ${MAX_MODS_PER_REQUEST} valid mod names as ?name=.` }), {
      status: 400,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
  }
  const found = await Promise.all(names.map(portalMod));
  const mods = Object.fromEntries(names.flatMap((n, i) => (found[i] === undefined ? [] : [[n, found[i]]])));
  // A partial answer mustn't stick in the browser cache for a day.
  const complete = found.every((m) => m !== undefined);
  return new Response(JSON.stringify({ mods }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": complete ? "public, max-age=86400" : "no-store",
    },
  });
}

function notFoundPage() {
  return new Response("<!doctype html><meta charset=\"utf-8\"><title>Not found</title><p>This share link doesn't exist.</p>", {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

async function handleShortLink(id, env) {
  if (!ID_RE.test(id)) return notFoundPage();
  const raw = await env.SHARES.get(`s:${id}`);
  if (!raw) return notFoundPage();
  const record = JSON.parse(raw);
  const title = record.title || "Research Cost Shaper run";
  const desc = describeSummary(record);
  const pageUrl = `${env.PAGE_URL}?s=${id}`;
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${esc(title)}</title>
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(pageUrl)}">
<meta property="og:site_name" content="Research Cost Shaper">
<meta name="twitter:card" content="summary">
<meta http-equiv="refresh" content="0; url=${esc(pageUrl)}">
</head>
<body>
<p>Taking you to your run&hellip; <a href="${esc(pageUrl)}">${esc(pageUrl)}</a></p>
</body>
</html>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

// ---------------------------------------------------------------- fetch

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(request.headers.get("Origin"), env) });
    }
    if (pathname === "/" && request.method === "GET") {
      return Response.redirect(env.PAGE_URL, 302);
    }
    if (pathname === "/api/share" && request.method === "POST") {
      return handleShare(request, env);
    }
    const shareMatch = pathname.match(/^\/api\/share\/([^/]+)$/);
    if (shareMatch && request.method === "GET") {
      return handleGetShare(shareMatch[1], env);
    }
    if (pathname === "/api/mods" && request.method === "GET") {
      return handleMods(url);
    }
    const shortMatch = pathname.match(/^\/s\/([^/]+)$/);
    if (shortMatch && request.method === "GET") {
      return handleShortLink(shortMatch[1], env);
    }
    return json({ error: "Not found." }, 404);
  },
};
