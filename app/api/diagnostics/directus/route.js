import { getDirectusConfig, listDirectusItems } from "../../../../lib/directus/client.js";
import { studySchema, requireFields } from "../../../../lib/endodb/schema.js";
import { LOCATION_FIELDS } from "../../../../lib/endodb/locations.js";
import { selectStudyFields, STUDY_FIELDS } from "../../../../lib/endodb/studies.js";
import { jsonResponse, upstreamError } from "../../../../lib/http/jsonResponse.js";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    getDirectusConfig();
    const schema = await studySchema();
    requireFields(schema.locations, ["activo"]);
    const [sites] = await Promise.all([
      listDirectusItems("bd_sedes", { fields: LOCATION_FIELDS.filter(field => schema.locations.has(field)), filter: { activo: { _eq: true } }, limit: 1 }),
      listDirectusItems("bd_estudios", { fields: selectStudyFields(schema), limit: 1 }),
    ]);
    return jsonResponse({ ok: true, service: "endodb", runtime: "nextjs", dataSource: "directus",
      connection: "reachable", configuration: "valid", checkedCollections: ["bd_sedes", "bd_estudios"],
      relation: "bd_estudios.sede → bd_sedes", hasAccessibleActiveSites: sites.length > 0,
      unavailableFields: STUDY_FIELDS.filter(field => !schema.fields.has(field)),
      warnings: sites.length ? [] : ["No hay sedes activas visibles para esta credencial. La carga requiere una sede configurada y autorizada."],
      authorization: "Directus aplica los permisos de la credencial del servidor; este endpoint no certifica aislamiento entre usuarios del navegador.",
      timestamp: new Date().toISOString(),
    });
  } catch (error) { return upstreamError(error, "diagnostics"); }
}
