import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFile } from "node:fs/promises";
import { authorizeIngest, checkFile, conflictPreview, extractText, fingerprint, forwardIngest, previewToken, verifyPreview } from "../lib/endodb/ingest.js";
import { POST } from "../app/api/ingest/route.js";

const siteId = "7a898b58-72db-49a5-a8a9-130456b78f01";
const orgId = "7a898b58-72db-49a5-a8a9-130456b78f02";
const userId = "7a898b58-72db-49a5-a8a9-130456b78f03";
const team = "https://endodb.cloudflaraccess.com".replace("cloudflaraccess", "cloudflareaccess");
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: "jwk" }), kid: "test", kty: "RSA", alg: "RS256", use: "sig" };
const originalFetch = globalThis.fetch;
const oldEnv = Object.fromEntries(["DIRECTUS_URL", "DIRECTUS_TOKEN", "ENDODB_OCR_LOCAL_ENDPOINT", "ENDODB_N8N_URL", "ENDODB_WEBHOOK_VERSION"].map(k => [k, process.env[k]]));
process.env.DIRECTUS_URL = "http://localhost:47771";
process.env.DIRECTUS_TOKEN = "test-only";
test.after(() => { globalThis.fetch = originalFetch; for (const [k,v] of Object.entries(oldEnv)) v === undefined ? delete process.env[k] : process.env[k] = v; });
function jwt(email = "doctor@example.org") {
  const now = Math.floor(Date.now() / 1000);
  const a = Buffer.from(JSON.stringify({ alg: "RS256", kid: "test" })).toString("base64url");
  const b = Buffer.from(JSON.stringify({ iss: team, aud: ["app-id"], email, type: "app", sub: "cf-user", iat: now, nbf: now, exp: now + 3600 })).toString("base64url");
  return `${a}.${b}.${sign("RSA-SHA256", Buffer.from(`${a}.${b}`), privateKey).toString("base64url")}`;
}
function config() { return { team, audience: "app-id", secret: "a-test-secret-with-more-than-24-chars", users: { "doctor@example.org": userId }, base: new URL("https://n8n.example.org") }; }
const request = () => new Request("http://localhost/api/ingest", { headers: { "cf-access-jwt-assertion": jwt() } });
function upstream({ member = true, existing = [] } = {}) {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const path = new URL(url).pathname;
    calls.push({ path, options });
    if (path === "/cdn-cgi/access/certs") return Response.json({ keys: [jwk] });
    if (path === "/items/bd_sedes") return Response.json({ data: [{ id: siteId, codigo: "CENTRO", organizacion: orgId, activo: true }] });
    if (path === "/items/bd_membresias") return Response.json({ data: member ? [{ id: "membership" }] : [] });
    if (path === "/items/bd_estudios") return Response.json({ data: existing });
    if (path === "/webhook/endodb/process-exam-directus-v4") return Response.json({ ok: true, estudios: [{ id: 42, paciente: "never expose" }] });
    if (path === "/ocr") return Response.json({ text: "VEDA: esófago sin lesiones. VCC: ciego alcanzado; Boston 1+1+1; sin pólipos." });
    throw new Error(`Unexpected ${path}`);
  };
  return calls;
}
test("verified identity and active membership bind site and organization", { concurrency: false }, async () => {
  upstream();
  const bound = await authorizeIngest(request(), siteId, config());
  assert.equal(bound.site.organizacion, orgId);
  upstream({ member: false });
  await assert.rejects(authorizeIngest(request(), siteId, config()), { code: "SITE_FORBIDDEN" });
  await assert.rejects(authorizeIngest(new Request("http://localhost"), siteId, config()), { code: "INGEST_FORBIDDEN" });
});
test("DRY_RUN is signed to file and user, and historical match blocks write", { concurrency: false }, async () => {
  const c = config(); const context = { hash: fingerprint("synthetic"), siteId, userId };
  const token = previewToken(c, context);
  assert.doesNotThrow(() => verifyPreview(c, token, context));
  assert.throws(() => verifyPreview(c, token, { ...context, siteId: orgId }), { code: "PREVIEW_REQUIRED" });
  upstream({ existing: [{ id: 99, procedure_type: "VCC", fecha_estudio: "2026-09-04", organizacion: orgId }] });
  const matches = await conflictPreview("EX-04-09", { id: siteId, organizacion: orgId }, "2026-09-04", ["VCC"]);
  assert.deepEqual(matches, [{ id: 99, procedure_type: "VCC", fecha_estudio: "2026-09-04" }]);
});
test("anonymous fixtures preserve negatives, splenic angle contradiction, poor prep and combined report", { concurrency: false }, async () => {
  const fixtures = [
    "04/09 VCC: ciego identificado. Sin lesiones; Boston 3+3+3.",
    "Caso B: formulario marca ciego; informe: se progresa SOLO hasta ángulo esplénico. No se alcanzó el ciego.",
    "Caso C: se alcanza ciego; Boston 1+1+1, preparación inadecuada.",
    "VCC: no se documenta el punto máximo alcanzado.",
    "VEDA: esófago normal, sin esofagitis. VCC: ciego, Boston 2+2+2; sin pólipos.",
  ];
  for (const text of fixtures) assert.equal(await extractText(new File([text], "sintetico.txt", { type: "text/plain" }), "text/plain"), text);
  const calls = upstream();
  const sent = await forwardIngest(config(), { sede_id: siteId, organizacion_id: orgId }, fixtures[4]);
  assert.deepEqual(sent, { ok: true, accepted: true, studies: 1 });
  const webhook = calls.find(c => c.path.includes("process-exam"));
  assert.equal(webhook.options.headers["x-endodb-secret"], config().secret);
  assert.equal(webhook.options.body.get("document_text"), fixtures[4]);
  assert.equal(JSON.stringify(sent).includes("paciente"), false);
});
test("simulated image and scanned PDF use local OCR only", { concurrency: false }, async () => {
  const calls = upstream();
  process.env.ENDODB_OCR_LOCAL_ENDPOINT = "http://localhost:47771/ocr";
  for (const [mime, ext, data] of [["image/png", "png", "PNG"], ["application/pdf", "pdf", await readFile(new URL("./fixtures/2026-09-04_vcc_escaneada.pdf", import.meta.url))]]) {
    const file = new File([data], `anonimo.${ext}`, { type: mime });
    assert.equal(checkFile(file), mime);
    assert.match(await extractText(file, mime), /Boston 1\+1\+1/);
  }
  assert.equal(calls.filter(c => c.path === "/ocr").length, 2);
});
test("text PDF retains both clinical sections without OCR", { concurrency: false }, async () => {
  const calls = upstream();
  const file = new File([await readFile(new URL("./fixtures/2026-09-04_veda-vcc_texto.pdf", import.meta.url))], "anonimo.pdf", { type: "application/pdf" });
  const text = await extractText(file, checkFile(file));
  assert.match(text, /VEDA:.*sin lesiones/);
  assert.match(text, /VCC:.*ciego/);
  assert.match(text, /sin polipos/);
  assert.equal(calls.filter(c => c.path === "/ocr").length, 0);
});
test("route preview and commit keep verified metadata and secrets on the server", { concurrency: false }, async () => {
  const keys = ["ENDODB_ACCESS_TEAM_DOMAIN", "ENDODB_ACCESS_AUD", "ENDODB_WEBHOOK_SHARED_SECRET", "ENDODB_ACCESS_USER_MAP", "ENDODB_N8N_URL"];
  const previous = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  Object.assign(process.env, { ENDODB_ACCESS_TEAM_DOMAIN: team, ENDODB_ACCESS_AUD: "app-id", ENDODB_WEBHOOK_SHARED_SECRET: config().secret,
    ENDODB_ACCESS_USER_MAP: JSON.stringify(config().users), ENDODB_N8N_URL: "https://n8n.example.org/" });
  try {
    const calls = upstream();
    const form = (mode, token) => { const f = new FormData(); f.set("file", new File(["VCC: no se alcanzó el ciego."], "anonimo.txt", { type: "text/plain" }));
      f.set("sede_id", siteId); f.set("exam_id", "EX-04-09"); f.set("fecha_estudio", "2026-09-04"); f.set("procedure_types", "VCC");
      f.set("mode", mode); if (token) f.set("preview_token", token); return f; };
    const send = async f => POST(new Request("http://localhost/api/ingest", { method: "POST", headers: { "cf-access-jwt-assertion": jwt() }, body: f }));
    const preview = await send(form("preview")); assert.equal(preview.status, 200);
    const body = await preview.json(); assert.equal(body.dry_run, true);
    assert.equal(calls.some(call => call.path.includes("process-exam")), false);
    const rejected = await send(form("commit", "forged")); assert.equal(rejected.status, 409);
    const commit = await send(form("commit", body.token)); assert.equal(commit.status, 200);
    const result = await commit.json(); assert.equal(result.studies, 1);
    assert.equal(JSON.stringify(result).includes(config().secret), false);
    const webhook = calls.find(call => call.path.includes("process-exam"));
    assert.equal(webhook.options.body.get("organizacion_id"), orgId);
    assert.equal(webhook.options.body.get("operador_id"), userId);
  } finally { for (const [key,value] of Object.entries(previous)) value === undefined ? delete process.env[key] : process.env[key] = value; }
});
test("route refuses unconfigured secret without leaking it", { concurrency: false }, async () => {
  const form = new FormData(); form.set("file", new File(["hola"], "anonimo.txt", { type: "text/plain" }));
  const response = await POST(new Request("http://localhost/api/ingest", { method: "POST", body: form }));
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { ok: false, error: "INGEST_NOT_CONFIGURED" });
});
