import { DirectusConfigurationError, listDirectusItems } from "../../../../lib/directus/client.js";
import { configurationError, jsonResponse, upstreamError } from "../../../../lib/http/jsonResponse.js";

export async function GET() {
  try {
    const data = await listDirectusItems("bd_lugares", { fields: ["id", "codigo", "nombre"], limit: 1 });
    return jsonResponse({ ok: true, service: "endodb", dataSource: "directus", directusConfigured: true, connection: "reachable", collection: "bd_lugares", sampleReceived: Array.isArray(data) && data.length > 0, timestamp: new Date().toISOString() });
  } catch (error) {
    if (error instanceof DirectusConfigurationError || error?.code === "DIRECTUS_CONFIGURATION_ERROR") return configurationError();
    return upstreamError(error);
  }
}
