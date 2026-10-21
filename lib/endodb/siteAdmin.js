import "server-only";
import { createPublicKey, verify } from "node:crypto";

export class SiteAdminError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const decode = value => JSON.parse(Buffer.from(value, "base64url").toString("utf8"));

export function siteAdminConfig() {
  const team = process.env.ENDODB_ACCESS_TEAM_DOMAIN?.trim();
  const audience = process.env.ENDODB_ACCESS_AUD?.trim();
  const emails = (process.env.ENDODB_SITE_ADMIN_EMAILS || "").split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  const organization = process.env.ENDODB_ORGANIZATION_ID?.trim();
  const writeToken = process.env.ENDODB_SITE_WRITE_TOKEN?.trim();
  const publicUrl = process.env.ENDODB_PUBLIC_URL?.trim();
  let origin;
  try { origin = new URL(publicUrl).origin; } catch { /* Fail closed below. */ }
  if (!team || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/i.test(team) || !audience || !emails.length ||
      !emails.every(email => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) || !UUID.test(organization || "") ||
      !writeToken || /^<.*>$/.test(writeToken) || /\s/.test(writeToken) || !origin ||
      !(origin.startsWith("https://") || /^http:\/\/localhost(?::\d+)?$/.test(origin))) {
    throw new SiteAdminError("SITE_ADMIN_NOT_CONFIGURED", 503);
  }
  return { team, audience, emails, organization, writeToken, origin };
}

export async function requireSiteAdmin(request, config = siteAdminConfig()) {
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token || token.length > 12000) throw new SiteAdminError("SITE_ADMIN_FORBIDDEN", 403);
  try {
    const parts = token.split(".");
    if (parts.length !== 3) throw new Error("JWT format");
    const header = decode(parts[0]);
    if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length > 128) throw new Error("JWT header");
    const response = await fetch(`${config.team}/cdn-cgi/access/certs`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error("JWKS unavailable");
    const { keys } = await response.json();
    const jwk = Array.isArray(keys) ? keys.find(key => key.kid === header.kid && key.kty === "RSA" && key.alg === "RS256" && key.use === "sig") : null;
    if (!jwk) throw new Error("JWT key");
    const key = createPublicKey({ key: jwk, format: "jwk" });
    if (!verify("RSA-SHA256", Buffer.from(`${parts[0]}.${parts[1]}`), key, Buffer.from(parts[2], "base64url"))) throw new Error("JWT signature");
    const claims = decode(parts[1]);
    const now = Math.floor(Date.now() / 1000);
    const email = typeof claims.email === "string" ? claims.email.toLowerCase() : "";
    if (claims.iss !== config.team || !Array.isArray(claims.aud) || !claims.aud.includes(config.audience) ||
        !Number.isSafeInteger(claims.exp) || claims.exp <= now || !Number.isSafeInteger(claims.nbf) || claims.nbf > now + 30 ||
        !Number.isSafeInteger(claims.iat) || claims.iat > now + 30 || claims.type !== "app" ||
        !claims.sub || !config.emails.includes(email)) throw new Error("JWT claims");
    return email;
  } catch {
    // Do not expose JWTs, claims or fetch errors.
    throw new SiteAdminError("SITE_ADMIN_FORBIDDEN", 403);
  }
}

export function validateSiteInput(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) ||
      Object.keys(value).some(key => !["nombre", "codigo", "direccion"].includes(key))) throw new SiteAdminError("SITE_INVALID_INPUT", 400);
  const nombre = typeof value.nombre === "string" ? value.nombre.trim().replace(/\s+/g, " ") : "";
  const codigo = typeof value.codigo === "string" ? value.codigo.trim().toUpperCase() : "";
  const direccion = typeof value.direccion === "string" ? value.direccion.trim() : "";
  if (nombre.length < 3 || nombre.length > 120 || /[\x00-\x1f\x7f]/.test(nombre) ||
      !/^[A-Z][A-Z0-9_]{1,39}$/.test(codigo) || direccion.length > 200 || /[\x00-\x1f\x7f]/.test(direccion)) {
    throw new SiteAdminError("SITE_INVALID_INPUT", 400);
  }
  return { nombre, codigo, ...(direccion ? { direccion } : {}) };
}
