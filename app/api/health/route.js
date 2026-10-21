import { jsonResponse } from "../../../lib/http/jsonResponse.js";
import { ENDODB_RELEASE } from "../../../lib/endodb/runtime.js";

export const dynamic = "force-dynamic";

export function GET() {
  return jsonResponse({ ok: true, service: "endodb", runtime: "nextjs", dataSource: "directus", release: ENDODB_RELEASE, timestamp: new Date().toISOString() });
}
