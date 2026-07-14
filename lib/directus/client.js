import "server-only";

import { assertAllowedEndodbCollection } from "./endodbCollections.js";

const QUERY_KEYS = new Set(["fields", "sort", "filter", "limit", "offset", "page", "search"]);

export class DirectusConfigurationError extends Error {
  constructor() {
    super("La conexión con Directus no está configurada.");
    this.name = "DirectusConfigurationError";
    this.code = "DIRECTUS_CONFIGURATION_ERROR";
  }
}

export class DirectusUpstreamError extends Error {
  constructor(message, { status, code } = {}) {
    super(message || "Directus rechazó o no pudo completar la solicitud.");
    this.name = "DirectusUpstreamError";
    this.code = code || "DIRECTUS_UPSTREAM_ERROR";
    this.status = status;
  }
}

export function getDirectusConfig() {
  const url = process.env.DIRECTUS_URL;
  const token = process.env.DIRECTUS_TOKEN;
  if (!url || !token) {
    throw new DirectusConfigurationError();
  }
  return { url, token };
}

function appendDirectusQuery(searchParams, key, value) {
  if (value === undefined || value === null || value === "") return;
  if (Array.isArray(value)) {
    searchParams.set(key, value.join(","));
    return;
  }
  if (typeof value === "object") {
    searchParams.set(key, JSON.stringify(value));
    return;
  }
  searchParams.set(key, String(value));
}

function buildUrl(path, query = {}) {
  const { url } = getDirectusConfig();
  const directusUrl = new URL(path, url.endsWith("/") ? url : `${url}/`);
  const searchParams = new URLSearchParams(directusUrl.search);
  for (const [key, value] of Object.entries(query)) {
    if (QUERY_KEYS.has(key)) appendDirectusQuery(searchParams, key, value);
  }
  directusUrl.search = searchParams.toString();
  return directusUrl;
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new DirectusUpstreamError("Directus devolvió una respuesta no JSON.", {
      code: "DIRECTUS_INVALID_JSON",
    });
  }
}

export async function directusRequest(path, options = {}) {
  const { token } = getDirectusConfig();
  const { query, ...fetchOptions } = options;
  const url = buildUrl(path, query);
  let response;
  try {
    response = await fetch(url, {
      ...fetchOptions,
      method: fetchOptions.method || "GET",
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(fetchOptions.headers || {}),
      },
    });
  } catch {
    throw new DirectusUpstreamError("Directus rechazó o no pudo completar la solicitud.");
  }

  const text = await response.text();
  const payload = parseJson(text);
  if (!response.ok) {
    throw new DirectusUpstreamError("Directus rechazó o no pudo completar la solicitud.", {
      status: response.status,
    });
  }
  return payload?.data;
}

export function listDirectusItems(collection, query = {}) {
  assertAllowedEndodbCollection(collection);
  return directusRequest(`/items/${encodeURIComponent(collection)}`, { query });
}
