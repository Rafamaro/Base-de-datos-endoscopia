import { listDirectusItems } from "../../../lib/directus/client.js";
import { buildStudiesFilter, normalizeStudy, parseStudiesQuery, STUDY_FIELDS } from "../../../lib/endodb/studies.js";
import { configurationError, jsonResponse, upstreamError, validationError } from "../../../lib/http/jsonResponse.js";

export async function GET(request) {
  let params;
  try {
    params = parseStudiesQuery(new URL(request.url).searchParams);
  } catch (error) {
    return validationError(error.message);
  }

  try {
    const data = await listDirectusItems("bd_estudios", {
      fields: STUDY_FIELDS,
      filter: buildStudiesFilter(params),
      sort: ["-fecha_estudio", "-id"],
      limit: params.limit,
      page: params.page,
    });
    const normalized = Array.isArray(data) ? data.map(normalizeStudy) : [];
    return jsonResponse({ ok: true, data: normalized, meta: { page: params.page, limit: params.limit, count: normalized.length } });
  } catch (error) {
    if (error?.code === "DIRECTUS_CONFIGURATION_ERROR") return configurationError();
    return upstreamError(error);
  }
}
