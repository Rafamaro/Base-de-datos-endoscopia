import { jsonResponse } from "../../../lib/http/jsonResponse.js";

function removed() {
  return jsonResponse({ ok: false, service: "endodb", runtime: "nextjs", error: "LEGACY_ROUTE_REMOVED", message: "La API de Nextcloud Tables ya no forma parte de EndoDB. Usá /api/locations o /api/studies." }, 410);
}

export const GET = removed;
export const POST = removed;
