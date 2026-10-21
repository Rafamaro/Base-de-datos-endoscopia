import { DirectusConfigurationError, listDirectusItems } from "../../../../lib/directus/client.js";
import { LOCATION_FIELDS } from "../../../../lib/endodb/locations.js";
import { STUDY_FIELDS } from "../../../../lib/endodb/studies.js";
import { configurationError, jsonResponse, upstreamError } from "../../../../lib/http/jsonResponse.js";

export async function GET() {
  for (const [collection, fields] of [["bd_lugares", LOCATION_FIELDS], ["bd_estudios", STUDY_FIELDS]]) {
    try {
      await listDirectusItems(collection, { fields, limit: 1 });
    } catch (error) {
      if (error instanceof DirectusConfigurationError || error?.code === "DIRECTUS_CONFIGURATION_ERROR") return configurationError();
      const response = upstreamError(error);
      const body = await response.json();
      return jsonResponse({ ...body, collection }, response.status);
    }
  }
  return jsonResponse({ ok: true, service: "endodb", runtime: "nextjs", dataSource: "directus", connection: "reachable", checkedCollections: ["bd_lugares", "bd_estudios"], timestamp: new Date().toISOString() });
}
