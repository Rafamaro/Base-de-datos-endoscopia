import { createDirectusSite, listDirectusItems } from "../../../lib/directus/client.js";
import { LOCATION_FIELDS, normalizeLocation } from "../../../lib/endodb/locations.js";
import { requireSiteAdmin, siteAdminConfig, SiteAdminError, validateSiteInput } from "../../../lib/endodb/siteAdmin.js";
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

const SITE_MESSAGES = {
  SITE_ADMIN_NOT_CONFIGURED: "El alta de sedes aún no está configurada en el servidor.",
  SITE_ADMIN_FORBIDDEN: "No tenés permiso para agregar sedes.",
  SITE_INVALID_INPUT: "Revisá el nombre, código y dirección de la sede.",
  SITE_ALREADY_EXISTS: "Ya existe una sede con ese código en esta organización.",
};

export async function POST(request) {
  try {
    const config = siteAdminConfig();
    if (request.headers.get("origin") !== config.origin) throw new SiteAdminError("SITE_ADMIN_FORBIDDEN", 403);
    await requireSiteAdmin(request, config);
    if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "") ||
        Number(request.headers.get("content-length") || 0) > 4096) throw new SiteAdminError("SITE_INVALID_INPUT", 400);
    const raw = await request.text();
    if (raw.length > 4096) throw new SiteAdminError("SITE_INVALID_INPUT", 400);
    let value;
    try { value = JSON.parse(raw); } catch { throw new SiteAdminError("SITE_INVALID_INPUT", 400); }
    const input = validateSiteInput(value);
    const fields = await locationSchema();
    requireFields(fields, ["codigo", "activo", "organizacion"]);
    const existing = await listDirectusItems("bd_sedes", {
      fields: ["id"], filter: { codigo: { _eq: input.codigo }, organizacion: { _eq: config.organization } }, limit: 1,
    });
    if (existing.length) throw new SiteAdminError("SITE_ALREADY_EXISTS", 409);
    const site = { ...input, activo: true, organizacion: config.organization };
    const id = await createDirectusSite(site, config.writeToken);
    let visible = [];
    try {
      visible = await listDirectusItems("bd_sedes", {
        fields: LOCATION_FIELDS.filter(field => fields.has(field)), filter: { id: { _eq: id } }, limit: 1,
      });
    } catch {
      // The write succeeded. Do not invite a duplicate by reporting this as a failed creation.
    }
    return jsonResponse({ ok: true, data: visible[0] ? normalizeLocation(visible[0]) : { id, ...site },
      visible: Boolean(visible[0]),
      ...(!visible[0] ? { warning: "La sede se creó, pero la credencial de lectura no puede verla. Revisá permisos antes de reintentar." } : {}),
    }, 201);
  } catch (error) {
    if (error instanceof SiteAdminError) return jsonResponse({ ok: false, error: error.code, message: SITE_MESSAGES[error.code] }, error.status);
    return upstreamError(error, "locations");
  }
}
