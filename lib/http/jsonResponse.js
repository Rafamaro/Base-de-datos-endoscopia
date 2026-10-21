import { ENDODB_RELEASE, RUNTIME_HEADER } from "../endodb/runtime.js";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "X-EndoDB-Runtime": RUNTIME_HEADER, "X-EndoDB-Release": ENDODB_RELEASE };

export function jsonResponse(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}

export function validationError(message) {
  return jsonResponse({ ok: false, error: "VALIDATION_ERROR", message }, 400);
}

export function configurationError() {
  return jsonResponse({ ok: false, service: "endodb", dataSource: "directus", error: "DIRECTUS_CONFIGURATION_ERROR", message: "La conexión con Directus no está configurada.", timestamp: new Date().toISOString() }, 500);
}

export function upstreamError(error) {
  const messages = {
    DIRECTUS_CONNECTION_ERROR: "No se pudo establecer conexión con Directus.",
    DIRECTUS_ACCESS_DENIED: "El token de lectura no tiene acceso a la colección o a los campos solicitados.",
    DIRECTUS_COLLECTION_NOT_FOUND: "La colección solicitada no existe en Directus o la ruta de Directus no es correcta.",
    DIRECTUS_SCHEMA_MISMATCH: "La consulta solicita un campo o relación incompatible con el esquema actual de Directus.",
    DIRECTUS_INVALID_JSON: "Directus devolvió una respuesta que no es JSON.",
    DIRECTUS_INVALID_RESPONSE: "Directus devolvió un formato inesperado.",
  };
  const code = Object.hasOwn(messages, error?.code) ? error.code : "DIRECTUS_UPSTREAM_ERROR";
  return jsonResponse({ ok: false, service: "endodb", runtime: "nextjs", dataSource: "directus", error: code, message: messages[code] || "Directus rechazó o no pudo completar la solicitud.", ...(error?.status ? { upstreamStatus: error.status } : {}), timestamp: new Date().toISOString() }, 502);
}
