import { listDirectusItems } from "../../../lib/directus/client.js";
import { studySchema, requireFields } from "../../../lib/endodb/schema.js";
import { buildStudiesFilter, normalizeStudy, parseStudiesQuery, selectStudyFields, STUDY_FIELDS } from "../../../lib/endodb/studies.js";
import { jsonResponse, upstreamError, validationError } from "../../../lib/http/jsonResponse.js";
export const dynamic = "force-dynamic";
export async function GET(request) {
  let params;
  try { params = parseStudiesQuery(new URL(request.url).searchParams); }
  catch (error) { return validationError(error.message); }
  try {
    const schema = await studySchema();
    if (params.requires_review !== undefined) requireFields(schema.fields, ["requiere_revision"]);
    const data = await listDirectusItems("bd_estudios", {
      fields: selectStudyFields(schema), filter: buildStudiesFilter(params),
      sort: ["-fecha_estudio", "-id"], limit: params.limit, offset: params.offset,
    });
    return jsonResponse({ ok: true, data: data.map(normalizeStudy), meta: {
      page: params.page, limit: params.limit, offset: params.offset, count: data.length,
      nextOffset: data.length ? params.offset + data.length : null,
      unavailableFields: STUDY_FIELDS.filter(field => !schema.fields.has(field)),
    } });
  } catch (error) { return upstreamError(error, "studies"); }
}
