import { jsonResponse } from "../../../lib/http/jsonResponse.js";

function respond(request) {
  const pathname = new URL(request.url).pathname;
  const legacy = /^\/api\/(?:calidad|registro|directus)(?:\/|$)/.test(pathname);
  return jsonResponse({
    ok: false,
    service: "endodb",
    runtime: "nextjs",
    error: legacy ? "LEGACY_ROUTE_REMOVED" : "NEXT_ROUTE_NOT_FOUND",
    message: legacy ? "Esta ruta pertenece a la implementación anterior. Usá /api/locations o /api/studies." : "La ruta solicitada no existe en EndoDB Next.js.",
  }, legacy ? 410 : 404);
}

export const GET = respond;
export const POST = respond;
export const PUT = respond;
export const PATCH = respond;
export const DELETE = respond;
