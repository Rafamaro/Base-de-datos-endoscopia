const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

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
  return jsonResponse({ ok: false, service: "endodb", dataSource: "directus", error: "DIRECTUS_UPSTREAM_ERROR", message: "Directus rechazó o no pudo completar la solicitud.", ...(error?.status ? { upstreamStatus: error.status } : {}), timestamp: new Date().toISOString() }, 502);
}
