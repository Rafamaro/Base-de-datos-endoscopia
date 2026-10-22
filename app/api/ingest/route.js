import { createPublicKey, verify } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LIMIT_BYTES = 25 * 1024 * 1024;
const ACCEPTED = /\.(pdf|json|txt|text|md|csv|jpg|jpeg|png|webp|heic|heif|tif|tiff|bmp)$/i;
const json = (status, error, extra = {}) => Response.json({ ok: status < 400, ...(error ? { error } : {}), ...extra }, {
  status, headers: { "Cache-Control": "no-store", "X-EndoDB-Runtime": "nextjs-directus" },
});
const decode = part => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

function config() {
  const team = String(process.env.ENDODB_ACCESS_TEAM_DOMAIN || "").replace(/\/+$/, "");
  const audience = String(process.env.ENDODB_ACCESS_AUD || "");
  const org = String(process.env.ENDODB_ORGANIZATION_ID || "");
  const siteToken = String(process.env.ENDODB_INGEST_AUTH_TOKEN || "");
  const directusUrl = String(process.env.DIRECTUS_URL || "").replace(/\/+$/, "");
  const secret = String(process.env.ENDODB_WEBHOOK_SHARED_SECRET || "");
  const endpoint = String(process.env.ENDODB_V5_WEBHOOK_URL || "");
  let origin;
  try { origin = new URL(process.env.ENDODB_PUBLIC_URL).origin; } catch {}
  if (!/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team) || !audience ||
      !UUID.test(org) || !siteToken || secret.length < 24 || !origin ||
      !/^https:\/\//.test(directusUrl) || !/^https:\/\//.test(endpoint) ||
      new URL(endpoint).hostname !== "n8n.drperez86.com" ||
      new URL(endpoint).pathname !== "/webhook/endodb/process-exam-directus-v5-nuevo") throw new Error("NOT_CONFIGURED");
  return { team, audience, org, siteToken, directusUrl, secret, endpoint, origin };
}

async function verifiedAccessEmail(request, c) {
  const token = request.headers.get("cf-access-jwt-assertion") || "";
  if (!token || token.length > 12000) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const header = decode(parts[0]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 128) return null;
    const response = await fetch(c.team + "/cdn-cgi/access/certs", { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) return null;
    const payload = await response.json();
    const jwk = (Array.isArray(payload.keys) ? payload.keys : []).find(key =>
      key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256" && key.use === "sig");
    if (!jwk || !verify("RSA-SHA256", Buffer.from(parts[0] + "." + parts[1]),
      createPublicKey({ key: jwk, format: "jwk" }), Buffer.from(parts[2], "base64url"))) return null;
    const claims = decode(parts[1]), now = Math.floor(Date.now() / 1000);
    if (claims.iss !== c.team || !Array.isArray(claims.aud) || !claims.aud.includes(c.audience) ||
        claims.type !== "app" || !claims.sub || !Number.isSafeInteger(claims.exp) || claims.exp <= now ||
        !Number.isSafeInteger(claims.iat) || claims.iat > now + 30 ||
        !Number.isSafeInteger(claims.nbf) || claims.nbf > now + 30 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(claims.email || "")) return null;
    return claims.email.trim().toLowerCase();
  } catch { return null; }
}

async function directusList(c, collection, fields, filter) {
  const u = new URL(c.directusUrl + "/items/" + collection);
  u.searchParams.set("fields", fields);
  u.searchParams.set("filter", JSON.stringify(filter));
  u.searchParams.set("limit", "2");
  const r = await fetch(u, {
    headers: { Authorization: "Bearer " + c.siteToken, Accept: "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10000),
  });
  if (!r.ok) throw new Error("MEMBERSHIP_READ_ERROR");
  const parsed = await r.json();
  if (!Array.isArray(parsed?.data)) throw new Error("MEMBERSHIP_READ_ERROR");
  return parsed.data;
}

async function isAuthorizedForSite(c, email, sedeId) {
  const sites = await directusList(c, "bd_sedes", "id,organizacion,activo", {
    _and: [{ id: { _eq: sedeId } }, { organizacion: { _eq: c.org } }, { activo: { _eq: true } }],
  });
  if (sites.length !== 1) return false;
  const memberships = await directusList(c, "bd_membresias", "id", {
    _and: [
      { usuario: { email: { _eq: email } } },
      { organizacion: { _eq: c.org } },
      { activo: { _eq: true } },
      { _or: [{ sede: { _eq: sedeId } }, { sede: { _null: true } }] },
    ],
  });
  return memberships.length > 0;
}

export async function POST(request) {
  let c;
  try { c = config(); } catch { return json(503, "INGEST_NOT_CONFIGURED"); }
  if (request.headers.get("origin") !== c.origin) return json(403, "INGEST_FORBIDDEN");
  const email = await verifiedAccessEmail(request, c);
  if (!email) return json(403, "INGEST_FORBIDDEN");
  if (!/^multipart\/form-data\s*;/i.test(request.headers.get("content-type") || "")) return json(415, "INGEST_INVALID_TYPE");
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (declaredSize > LIMIT_BYTES + 100000) return json(413, "INGEST_TOO_LARGE");

  let form;
  try { form = await request.formData(); } catch { return json(400, "INGEST_INVALID_FORM"); }
  const file = form.get("file"), sedeId = String(form.get("sede_id") || "");
  if (!UUID.test(sedeId) || !file || typeof file.arrayBuffer !== "function" ||
      !ACCEPTED.test(file.name || "") || file.size < 1 || file.size > LIMIT_BYTES) return json(422, "INGEST_INVALID_INPUT");
  let allowed;
  try { allowed = await isAuthorizedForSite(c, email, sedeId); }
  catch { return json(502, "INGEST_AUTH_BACKEND_ERROR"); }
  if (!allowed) return json(403, "INGEST_SITE_FORBIDDEN");

  const next = new FormData();
  next.set("file", file, file.name);
  next.set("sede_id", sedeId);
  next.set("client_filename", file.name.slice(0, 180));
  next.set("file_size", String(file.size));
  for (const k of ["exam_id", "document_text", "ocr_text"]) {
    const v = form.get(k);
    if (typeof v === "string" && v.length <= (k === "exam_id" ? 120 : 120000)) next.set(k, v);
  }
  try {
    const r = await fetch(c.endpoint, {
      method: "POST", body: next, headers: { "x-endodb-secret": c.secret, Accept: "application/json" },
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(150000),
    });
    const result = await r.json().catch(() => null);
    // El secreto compartido solo se verifica dentro de n8n. Informar el fallo sin exponer secretos ni el cuerpo remoto.
    if (r.status === 401 || r.status === 403) return json(502, "INGEST_WEBHOOK_UNAUTHORIZED");
    if (!r.ok || !result || typeof result !== "object") return json(502, "INGEST_UPSTREAM_ERROR");
    if (result.ok === false && !result.ingesta_id) return json(422, result.error || "INGEST_REJECTED");
    return json(200, null, { data: result, ingesta_id: result.ingesta_id ?? null,
      requiere_revision: result.requiere_revision === true || result.ok === false,
      duplicado: result.duplicate === true });
  } catch { return json(504, "INGEST_UPSTREAM_TIMEOUT_OR_UNAVAILABLE"); }
}
