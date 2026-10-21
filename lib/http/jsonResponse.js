import { randomUUID } from "node:crypto";
import { ENDODB_RELEASE, RUNTIME_HEADER } from "../endodb/runtime.js";

const NO_STORE_HEADERS = { "Cache-Control": "no-store", "X-EndoDB-Runtime": RUNTIME_HEADER, "X-EndoDB-Release": ENDODB_RELEASE };
const MESSAGES = {
  DIRECTUS_CONFIGURATION_ERROR: "La conexión no está configurada correctamente. Revisá DIRECTUS_URL, DIRECTUS_TOKEN y DIRECTUS_TIMEOUT_MS en el servidor.",
  DIRECTUS_CONNECTION_ERROR: "No se pudo conectar con Directus. Revisá la dirección y la conectividad del servidor.",
  DIRECTUS_TIMEOUT: "Directus no respondió dentro del tiempo permitido. Podés reintentar.",
  DIRECTUS_ACCESS_DENIED: "Directus denegó el acceso. Revisá la credencial y sus permisos de lectura de estudios, sedes y esquema.",
  DIRECTUS_COLLECTION_NOT_FOUND: "No se encontró la colección solicitada. Revisá la dirección y el esquema de Directus.",
  DIRECTUS_SCHEMA_MISMATCH: "El esquema o los campos visibles no son compatibles. Revisá bd_estudios, bd_sedes y la relación sede.",
  DIRECTUS_INVALID_JSON: "El servidor de datos devolvió contenido no JSON. Revisá el proxy y la dirección de Directus.",
  DIRECTUS_INVALID_RESPONSE: "Directus devolvió una respuesta con formato inesperado.",
  DIRECTUS_UPSTREAM_ERROR: "Directus no pudo completar la solicitud. Podés reintentar.",
};
export function jsonResponse(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE_HEADERS });
}
export function validationError(message) {
  return jsonResponse({ ok: false, error: "VALIDATION_ERROR", message }, 400);
}
export function upstreamError(error, operation = "read") {
  const code = Object.hasOwn(MESSAGES, error?.code) ? error.code : "DIRECTUS_UPSTREAM_ERROR";
  const requestId = randomUUID();
  const upstreamStatus = Number.isInteger(error?.status) && error.status >= 100 && error.status <= 599 ? error.status : undefined;
  // Fixed labels only: never messages, stacks, URLs, queries, tokens or records.
  const safeOperation = ["locations", "studies", "diagnostics"].includes(operation) ? operation : "read";
  console.error(JSON.stringify({ event: "endodb.directus.error", operation: safeOperation, code, upstreamStatus, requestId }));
  const status = code === "DIRECTUS_ACCESS_DENIED" ? 403 : code === "DIRECTUS_TIMEOUT" ? 504 : code === "DIRECTUS_CONFIGURATION_ERROR" ? 503 : 502;
  return jsonResponse({ ok: false, service: "endodb", runtime: "nextjs", error: code, message: MESSAGES[code], requestId, ...(upstreamStatus ? { upstreamStatus } : {}) }, status);
}
