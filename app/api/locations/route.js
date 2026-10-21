import { listDirectusItems } from "../../../lib/directus/client.js";
import { LOCATION_FIELDS, normalizeLocation } from "../../../lib/endodb/locations.js";
import { locationSchema, requireFields } from "../../../lib/endodb/schema.js";
import { parsePagination, validateQueryKeys } from "../../../lib/endodb/studies.js";
import { jsonResponse, upstreamError, validationError } from "../../../lib/http/jsonResponse.js";
export const dynamic = "force-dynamic";
export async function GET(request) {
  let params;
  try {
    const search = new URL(request.url).searchParams;
    validateQueryKeys(search, new Set(["limit", "page", "offset"]));
    params = parsePagination(search);
  } catch (error) { return validationError(error.message); }
  try {
    const schema = await locationSchema();
    requireFields(schema, ["activo"]); // Do not silently offer disabled sites.
    const data = await listDirectusItems("bd_sedes", {
      fields: LOCATION_FIELDS.filter(field => schema.has(field)),
      filter: { activo: { _eq: true } }, sort: ["nombre", "id"], limit: params.limit, offset: params.offset,
    });
    return jsonResponse({ ok: true, data: data.map(normalizeLocation), meta: {
      count: data.length, limit: params.limit, offset: params.offset,
      nextOffset: data.length ? params.offset + data.length : null,
    } });
  } catch (error) { return upstreamError(error, "locations"); }
}
