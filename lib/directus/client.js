import "server-only";
import { assertAllowedEndodbCollection } from "./endodbCollections.js";
import { classifyDirectusFailure } from "./errors.js";

const QUERY_KEYS = new Set(["fields", "sort", "filter", "limit", "offset", "page"]);
export class DirectusConfigurationError extends Error {
  constructor() {
    super("Revisá DIRECTUS_URL, DIRECTUS_TOKEN y DIRECTUS_TIMEOUT_MS en el servidor.");
    this.code = "DIRECTUS_CONFIGURATION_ERROR";
  }
}
export class DirectusUpstreamError extends Error {
  constructor(code, status) { super(code); this.code = code; this.status = status; }
}
export function getDirectusConfig() {
  const token = process.env.DIRECTUS_TOKEN?.trim();
  let url;
  try { url = new URL(process.env.DIRECTUS_URL); } catch { throw new DirectusConfigurationError(); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const timeout = Number(process.env.DIRECTUS_TIMEOUT_MS || 10000);
  if (!token || /^<.*>$/.test(token) || /\s/.test(token) || url.username || url.password || url.search || url.hash
      || (url.protocol !== "https:" && !(local && url.protocol === "http:"))
      || !Number.isInteger(timeout) || timeout < 1000 || timeout > 30000) throw new DirectusConfigurationError();
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  return { url, token, timeout };
}
// Private, read-only transport: no caller-supplied paths, headers or credentials.
async function read(path, query = {}) {
  const { url, token, timeout } = getDirectusConfig();
  const target = new URL(path, url);
  for (const [key, value] of Object.entries(query)) {
    if (!QUERY_KEYS.has(key) || value === undefined || value === null || value === "") continue;
    target.searchParams.set(key, Array.isArray(value) ? value.join(",") : typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  const signal = AbortSignal.timeout(timeout);
  try {
    const response = await fetch(target, {
      method: "GET", cache: "no-store", redirect: "error", signal,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });
    const raw = await response.text();
    let payload;
    try { payload = JSON.parse(raw); } catch { /* Never expose upstream bodies. */ }
    if (!response.ok) throw new DirectusUpstreamError(classifyDirectusFailure(response.status, payload?.errors?.[0]?.extensions?.code), response.status);
    if (!payload) throw new DirectusUpstreamError("DIRECTUS_INVALID_JSON", response.status);
    if (!Array.isArray(payload.data)) throw new DirectusUpstreamError("DIRECTUS_INVALID_RESPONSE", response.status);
    return payload.data;
  } catch (error) {
    if (error instanceof DirectusUpstreamError) throw error;
    throw new DirectusUpstreamError(signal.aborted || error?.name === "TimeoutError" ? "DIRECTUS_TIMEOUT" : "DIRECTUS_CONNECTION_ERROR");
  }
}
export function listDirectusItems(collection, query = {}) {
  assertAllowedEndodbCollection(collection);
  if (!Array.isArray(query.fields) || !query.fields.length || query.fields.some(field => field.includes("*"))) throw new DirectusUpstreamError("DIRECTUS_SCHEMA_MISMATCH");
  return read(`items/${collection}`, query);
}
export function readDirectusFields(collection) {
  assertAllowedEndodbCollection(collection);
  return read(`fields/${collection}`);
}
export function readDirectusRelations(collection) {
  assertAllowedEndodbCollection(collection);
  return read(`relations/${collection}`);
}

export async function createDirectusSite(site, token) {
  const { url, timeout } = getDirectusConfig();
  try {
    const response = await fetch(new URL("items/bd_sedes", url), {
      method: "POST", cache: "no-store", redirect: "error", signal: AbortSignal.timeout(timeout),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(site),
    });
    let payload;
    try { payload = await response.json(); } catch { throw new DirectusUpstreamError("DIRECTUS_INVALID_JSON", response.status); }
    if (!response.ok) throw new DirectusUpstreamError(classifyDirectusFailure(response.status, payload?.errors?.[0]?.extensions?.code), response.status);
    if (!payload?.data?.id || typeof payload.data.id !== "string") throw new DirectusUpstreamError("DIRECTUS_INVALID_RESPONSE", response.status);
    return payload.data.id;
  } catch (error) {
    if (error instanceof DirectusUpstreamError) throw error;
    throw new DirectusUpstreamError(error?.name === "TimeoutError" ? "DIRECTUS_TIMEOUT" : "DIRECTUS_CONNECTION_ERROR");
  }
}
