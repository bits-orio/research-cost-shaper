// Tests call worker.fetch(request, env) directly with a fake KV and rate
// limiter, no wrangler dev server needed.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import worker from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.join(here, "..", "..");
const ORIGIN = "https://bits-orio.github.io";
const PAGE_URL = "https://bits-orio.github.io/research-cost-shaper/";
const ALLOWED_ORIGINS = "https://bits-orio.github.io,http://127.0.0.1:8765,http://localhost:8765";

function sampleExport(name) {
  return fs.readFileSync(path.join(repoRoot, "site", "samples", name), "utf8").trim();
}

// A "deflate" (zlib) export, encoded the same way the mod does. Lets tests
// build custom payloads (bad format, oversize, etc.) without a real sample.
function makeExport(obj) {
  const compressed = zlib.deflateSync(Buffer.from(JSON.stringify(obj)));
  return "RCS1:" + compressed.toString("base64");
}

function fakeKv() {
  const store = new Map();
  let puts = 0;
  return {
    async get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    async put(key, value) {
      puts++;
      store.set(key, value);
    },
    puts: () => puts,
  };
}

function makeEnv(overrides = {}) {
  return { SHARES: fakeKv(), PAGE_URL, ALLOWED_ORIGINS, ...overrides };
}

function shareRequest(body, { origin = ORIGIN, headers = {} } = {}) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  return new Request("https://rcs-share.example.workers.dev/api/share", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin, ...headers },
    body: text,
  });
}

const VALID_CURVE = "v1; pts=0:2, 0.5:4, 1:10";

test("valid upload of a real sample returns an id", async () => {
  const env = makeEnv();
  const res = await worker.fetch(shareRequest({ export: sampleExport("space-age-2.0.txt"), curve: VALID_CURVE }), env);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.id, /^[a-z2-7]{10}$/);
  assert.equal(body.url, `https://rcs-share.example.workers.dev/s/${body.id}`);
  assert.equal(body.page, `${PAGE_URL}?s=${body.id}`);
  assert.equal(env.SHARES.puts(), 1);
});

test("re-sharing identical content returns the same id and does not write KV again", async () => {
  const env = makeEnv();
  const exp = sampleExport("vanilla-2.0.txt");
  const first = await (await worker.fetch(shareRequest({ export: exp, curve: VALID_CURVE, title: "My run" }), env)).json();
  const second = await (await worker.fetch(shareRequest({ export: exp, curve: VALID_CURVE, title: "My run" }), env)).json();
  assert.equal(first.id, second.id);
  assert.equal(env.SHARES.puts(), 1);
});

test("GET /api/share/<id> round-trips the stored record", async () => {
  const env = makeEnv();
  const exp = sampleExport("space-age-2.0.txt");
  const { id } = await (await worker.fetch(shareRequest({ export: exp, curve: VALID_CURVE, title: "Server run" }), env)).json();
  const res = await worker.fetch(new Request(`https://x/api/share/${id}`), env);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("Cache-Control"), /immutable/);
  const record = await res.json();
  assert.equal(record.export, exp);
  assert.equal(record.curve, VALID_CURVE);
  assert.equal(record.title, "Server run");
  assert.equal(record.summary.techs, 275);
  assert.equal(record.summary.spaceAge, true);
  assert.equal(record.summary.mods, 4); // 5 mods minus research-cost-shaper itself
});

test("/s/<id> renders og tags and escapes a hostile title", async () => {
  const env = makeEnv();
  const exp = sampleExport("vanilla-2.0.txt");
  const { id } = await (
    await worker.fetch(shareRequest({ export: exp, curve: VALID_CURVE, title: "<script>x</script>" }), env)
  ).json();
  const res = await worker.fetch(new Request(`https://x/s/${id}`), env);
  assert.equal(res.status, 200);
  const html = await res.text();
  assert.match(html, /og:title/);
  assert.match(html, /og:description/);
  assert.match(html, /og:site_name" content="Research Cost Shaper"/);
  assert.match(html, /twitter:card" content="summary"/);
  assert.ok(!html.includes("<script>x</script>"), "raw script tag must not appear");
  assert.match(html, /&lt;script&gt;x&lt;\/script&gt;/);
  assert.match(html, new RegExp(`meta http-equiv="refresh" content="0; url=${PAGE_URL.replace(/\//g, "\\/")}\\?s=${id}"`));
});

test("rejects an Origin not in ALLOWED_ORIGINS", async () => {
  const env = makeEnv();
  const res = await worker.fetch(
    shareRequest({ export: sampleExport("vanilla-2.0.txt"), curve: VALID_CURVE }, { origin: "https://evil.example" }),
    env,
  );
  assert.equal(res.status, 403);
});

test("rejects an export that doesn't start with RCS1:", async () => {
  const env = makeEnv();
  const res = await worker.fetch(shareRequest({ export: "not-an-export", curve: VALID_CURVE }), env);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /RCS1/);
});

test("rejects corrupt base64", async () => {
  const env = makeEnv();
  const res = await worker.fetch(shareRequest({ export: "RCS1:not*valid*base64!!", curve: VALID_CURVE }), env);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /base64/);
});

test("rejects valid base64 that isn't deflate data", async () => {
  const env = makeEnv();
  const res = await worker.fetch(shareRequest({ export: "RCS1:" + Buffer.from("hello there").toString("base64"), curve: VALID_CURVE }), env);
  assert.equal(res.status, 400);
});

test("rejects JSON with the wrong format", async () => {
  const env = makeEnv();
  const bad = makeExport({ format: 2, curve: VALID_CURVE, mods: [["base", "2.0.77"]], techs: { a: { kind: "count" } } });
  const res = await worker.fetch(shareRequest({ export: bad, curve: VALID_CURVE }), env);
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /format/);
});

test("rejects an oversized body (413)", async () => {
  const env = makeEnv();
  const huge = { export: makeExport({ format: 1, curve: VALID_CURVE, mods: [], techs: { a: { kind: "count" } } }), curve: VALID_CURVE, junk: "x".repeat(400 * 1024) };
  const res = await worker.fetch(shareRequest(huge), env);
  assert.equal(res.status, 413);
});

test("GET with a badly-formed id returns 404", async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request("https://x/api/share/not-an-id!!"), env);
  assert.equal(res.status, 404);
});

test("GET for an unknown id is a 404 the page can read cross-origin", async () => {
  const env = makeEnv();
  for (const id of ["aaaaaaaaaa", "not-an-id!!"]) {
    const res = await worker.fetch(new Request(`https://x/api/share/${id}`), env);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get("Access-Control-Allow-Origin"), "*");
  }
});

test("GET /s/<id> for an unknown id shows a 404 page", async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request("https://x/s/aaaaaaaaaa"), env);
  assert.equal(res.status, 404);
  assert.match(await res.text(), /not found/i);
});

test("honors a rate limiter binding and returns 429 when it says no", async () => {
  const env = makeEnv({ UPLOAD_LIMIT: { async limit() { return { success: false }; } } });
  const res = await worker.fetch(shareRequest({ export: sampleExport("vanilla-2.0.txt"), curve: VALID_CURVE }), env);
  assert.equal(res.status, 429);
});

test("works without a rate limiter binding at all", async () => {
  const env = makeEnv(); // no UPLOAD_LIMIT
  const res = await worker.fetch(shareRequest({ export: sampleExport("vanilla-2.0.txt"), curve: VALID_CURVE }), env);
  assert.equal(res.status, 201);
});

test("OPTIONS preflight echoes an allowed origin and omits a disallowed one", async () => {
  const env = makeEnv();
  const allowed = await worker.fetch(new Request("https://x/api/share", { method: "OPTIONS", headers: { Origin: ORIGIN } }), env);
  assert.equal(allowed.status, 204);
  assert.equal(allowed.headers.get("Access-Control-Allow-Origin"), ORIGIN);
  assert.match(allowed.headers.get("Access-Control-Allow-Methods"), /POST/);

  const disallowed = await worker.fetch(
    new Request("https://x/api/share", { method: "OPTIONS", headers: { Origin: "https://evil.example" } }),
    env,
  );
  assert.equal(disallowed.status, 204);
  assert.equal(disallowed.headers.get("Access-Control-Allow-Origin"), null);
});

test("GET / redirects to PAGE_URL", async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request("https://x/"), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get("Location"), PAGE_URL);
});
