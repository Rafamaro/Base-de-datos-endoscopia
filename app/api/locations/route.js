import { listDirectusItems } from "../../../lib/directus/client.js";
import { LOCATION_FIELDS, normalizeLocation } from "../../../lib/endodb/locations.js";
import { configurationError, jsonResponse, upstreamError } from "../../../lib/http/jsonResponse.js";

export async function GET() {
  try {
    const data = await listDirectusItems("bd_lugares", {
      fields: LOCATION_FIELDS,
      filter: { activo: { _eq: true } },
      sort: ["orden", "nombre"],
      limit: 100,
    });
    const normalized = Array.isArray(data) ? data.map(normalizeLocation) : [];
    return jsonResponse({ ok: true, data: normalized, meta: { count: normalized.length } });
  } catch (error) {
    if (error?.code === "DIRECTUS_CONFIGURATION_ERROR") return configurationError();
    return upstreamError(error);
  }
}
