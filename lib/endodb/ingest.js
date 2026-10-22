import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listDirectusItems } from "../directus/client.js";
import { verifyAccessIdentity, SiteAdminError } from "./siteAdmin.js";

const exec = promisify(execFile);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Map(Object.entries({ pdf: "application/pdf", jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", tif: "image/tiff", tiff: "image/tiff", txt: "text/plain", json: "application/json" }));
export class IngestError extends Error {
  constructor(code, status = 400) { super(code); this.code = code; this.status = status; }
}
export function ingestConfig() {
  const team = process.env.ENDODB_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.ENDODB_ACCESS_AUD?.trim();
  const secret = process.env.ENDODB_WEBHOOK_SHARED_SECRET?.trim();
  let users;
  try { users = JSON.parse(process.env.ENDODB_ACCESS_USER_MAP || "{}"); } catch { users = null; }
  if (!team || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team) || !audience ||
      !secret || secret.length < 24 || !users || typeof users !== "object" || Array.isArray(users)) throw new IngestError("INGEST_NOT_CONFIGURED", 503);
  const origin = process.env.ENDODB_N8N_URL?.trim();
  let base;
  try { base = new URL(origin); } catch { throw new IngestError("INGEST_NOT_CONFIGURED", 503); }
  if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash || base.pathname !== "/") throw new IngestError("INGEST_NOT_CONFIGURED", 503);
  return { team, audience, secret, users, base };
}
export async function authorizeIngest(request, siteId, config = ingestConfig()) {
  if (!UUID.test(siteId || "")) throw new IngestError("SITE_INVALID", 400);
  let email;
  try { email = await verifyAccessIdentity(request, config); }
  catch (error) { if (error instanceof SiteAdminError) throw new IngestError("INGEST_FORBIDDEN", 403); throw error; }
  const userId = config.users[email];
  if (!UUID.test(userId || "")) throw new IngestError("INGEST_FORBIDDEN", 403);
  const sites = await listDirectusItems("bd_sedes", { fields: ["id", "codigo", "organizacion", "activo"], filter: { id: { _eq: siteId }, activo: { _eq: true } }, limit: 1 });
  const site = sites[0];
  if (!site || !UUID.test(site.organizacion || "")) throw new IngestError("SITE_FORBIDDEN", 403);
  const members = await listDirectusItems("bd_membresias", { fields: ["id"], filter: {
    usuario: { _eq: userId }, sede: { _eq: site.id }, organizacion: { _eq: site.organizacion }, activo: { _eq: true },
  }, limit: 1 });
  if (!members.length) throw new IngestError("SITE_FORBIDDEN", 403);
  return { site, userId };
}
export function checkFile(file) {
  if (!(file instanceof File) || file.size < 1 || file.size > 25 * 1024 * 1024) throw new IngestError("FILE_INVALID");
  const ext = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  const mime = kinds.get(ext);
  if (!mime || (file.type && file.type !== mime && file.type !== "application/octet-stream" &&
      !(mime === "image/heic" && file.type === "image/heif"))) throw new IngestError("FILE_INVALID");
  return mime;
}
export async function extractText(file, mime) {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (mime === "text/plain" || mime === "application/json") {
    const value = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (mime === "application/json") {
      try { JSON.parse(value); } catch { throw new IngestError("JSON_INVALID", 422); }
    }
    return value;
  }
  if (mime === "application/pdf") {
    const dir = await mkdtemp(join(tmpdir(), "endodb-"));
    try {
      const path = join(dir, "input.pdf");
      await writeFile(path, bytes, { mode: 0o600 });
      const { stdout } = await exec("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], { maxBuffer: 12 * 1024 * 1024, timeout: 30000 });
      if (stdout.trim()) return stdout;
    } catch { /* Scanned PDF: OCR below. */ }
    finally { await rm(dir, { recursive: true, force: true }); }
  }
  const endpoint = process.env.ENDODB_OCR_LOCAL_ENDPOINT;
  if (!endpoint || !/^http:\/\/(?:127\.0\.0\.1|localhost|[a-z0-9-]+)(?::\d+)?\//i.test(endpoint)) throw new IngestError("OCR_NOT_CONFIGURED", 503);
  let response;
  try { response = await fetch(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(120000),
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ file_name: "documento", mime_type: mime, data_base64: bytes.toString("base64") }) }); }
  catch { throw new IngestError("OCR_FAILED", 502); }
  if (!response.ok) throw new IngestError("OCR_FAILED", 502);
  let payload;
  try { payload = await response.json(); } catch { throw new IngestError("OCR_FAILED", 502); }
  if (typeof payload.text !== "string" || !payload.text.trim()) throw new IngestError("OCR_EMPTY", 422);
  return payload.text;
}
export function fingerprint(text) { return createHash("sha256").update(text).digest("hex"); }
export function previewToken(config, context) {
  const body = Buffer.from(JSON.stringify({ ...context, expires: Date.now() + 10 * 60_000 })).toString("base64url");
  return `${body}.${createHmac("sha256", config.secret).update(body).digest("base64url")}`;
}
export function verifyPreview(config, token, context) {
  const [body, signature, extra] = String(token || "").split(".");
  if (!body || !signature || extra) throw new IngestError("PREVIEW_REQUIRED", 409);
  const expected = createHmac("sha256", config.secret).update(body).digest();
  let received;
  try { received = Buffer.from(signature, "base64url"); } catch { throw new IngestError("PREVIEW_REQUIRED", 409); }
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) throw new IngestError("PREVIEW_REQUIRED", 409);
  let saved;
  try { saved = JSON.parse(Buffer.from(body, "base64url").toString("utf8")); } catch { throw new IngestError("PREVIEW_REQUIRED", 409); }
  if (saved.expires < Date.now() || Object.entries(context).some(([key, value]) => saved[key] !== value)) throw new IngestError("PREVIEW_REQUIRED", 409);
}
export async function conflictPreview(examId, site, date, types) {
  if (!examId || examId.length > 120) throw new IngestError("EXAM_ID_REQUIRED");
  const filter = { _or: [{ exam_id: { _eq: examId } }] };
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && types.length) {
    for (const type of types) filter._or.push({ fecha_estudio: { _eq: date }, sede: { _eq: site.id }, procedure_type: { _eq: type } });
  }
  const rows = await listDirectusItems("bd_estudios", { fields: ["id", "exam_id", "fecha_estudio", "sede", "organizacion", "procedure_type"], filter, limit: 50 });
  return rows.map(({ id, fecha_estudio, procedure_type, organizacion }) => organizacion === site.organizacion
    ? { id, fecha_estudio, procedure_type } : { scope: "otra_organizacion_o_sin_asignar" });
}
export async function forwardIngest(config, meta, text) {
  const version = process.env.ENDODB_WEBHOOK_VERSION === "v3" ? "v3" : "v4";
  const target = new URL(`/webhook/endodb/process-exam-directus-${version}`, config.base);
  const form = new FormData();
  for (const [key, value] of Object.entries(meta)) form.set(key, value);
  form.set("document_text", text);
  let response;
  try { response = await fetch(target, { method: "POST", redirect: "error", signal: AbortSignal.timeout(180000),
    headers: version === "v4" ? { "x-endodb-secret": config.secret } : {}, body: form, cache: "no-store" }); }
  catch { throw new IngestError("INGEST_UPSTREAM_FAILED", 502); }
  if (!response.ok) throw new IngestError("INGEST_UPSTREAM_FAILED", 502);
  let payload;
  try { payload = await response.json(); } catch { throw new IngestError("INGEST_UPSTREAM_FAILED", 502); }
  if (payload?.ok !== true) throw new IngestError("INGEST_UPSTREAM_FAILED", 502);
  return { ok: true, accepted: true, studies: Array.isArray(payload?.estudios) ? payload.estudios.length : null };
}
