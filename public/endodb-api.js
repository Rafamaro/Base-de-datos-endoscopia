/* Same-origin read-only client shared by Viewer, Stats and upload. */
(function (root) {
  const messages = {
    DIRECTUS_CONFIGURATION_ERROR: 'La conexión con Directus necesita configuración en el servidor.',
    DIRECTUS_CONNECTION_ERROR: 'El servidor no pudo conectarse con Directus.',
    DIRECTUS_TIMEOUT: 'Directus tardó demasiado en responder. Podés reintentar.',
    DIRECTUS_ACCESS_DENIED: 'Directus denegó el acceso. Revisá la credencial y sus permisos de lectura.',
    DIRECTUS_SCHEMA_MISMATCH: 'El esquema o los campos autorizados no coinciden con los requeridos por EndoDB.',
    DIRECTUS_COLLECTION_NOT_FOUND: 'No se encontró la colección requerida en Directus.',
    DIRECTUS_INVALID_JSON: 'El servidor de datos devolvió contenido no JSON.',
    DIRECTUS_INVALID_RESPONSE: 'El servidor de datos devolvió un formato inesperado.',
    DIRECTUS_UPSTREAM_ERROR: 'Directus no pudo completar la solicitud.',
    VALIDATION_ERROR: 'Revisá los filtros de la consulta.',
  };
  async function request(path, { signal } = {}) {
    const controller = new AbortController();
    const abort = () => controller.abort();
    if (signal?.aborted) abort();
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 25000);
    try {
      const response = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
      if (/cloudflareaccess\.com|\/cdn-cgi\/access\//.test(response.url)) throw new Error('Tu sesión de acceso venció. Volvé a iniciar sesión en EndoDB.');
      const raw = await response.text();
      if (raw.includes('Use /api/(calidad|registro)/(columns|rows)')) throw new Error('El dominio está respondiendo con la API antigua. Revisá el destino del despliegue.');
      if (response.headers.get('X-EndoDB-Runtime') !== 'nextjs-directus') throw new Error('La respuesta no llegó desde EndoDB Next.js. Revisá el acceso y el despliegue.');
      let payload;
      try { payload = JSON.parse(raw); } catch { throw new Error('EndoDB devolvió contenido no JSON. Podés recargar o revisar el acceso.'); }
      if (!response.ok || payload?.ok !== true) {
        const reference = /^[0-9a-f-]{36}$/i.test(payload?.requestId || '') ? ` Referencia: ${payload.requestId}` : '';
        throw new Error((messages[payload?.error] || 'EndoDB no pudo completar la consulta.') + reference);
      }
      return payload;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Se agotó el tiempo de carga. Reintentá o reducí los filtros.');
      if (error instanceof TypeError) throw new Error('No se pudo conectar con EndoDB. Revisá tu conexión.');
      throw error;
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
  async function all(path) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 60000);
    const rows = [], seen = new Set(), unavailable = new Set();
    try {
      let offset = 0;
      for (let page = 0; page < 10000; page++) {
        const url = new URL(path, root.location.origin);
        url.searchParams.set('limit', '500');
        url.searchParams.set('offset', String(offset));
        const result = await request(url.pathname + url.search, { signal: controller.signal });
        if (!Array.isArray(result.data)) throw new Error('La respuesta no contiene una lista de datos.');
        for (const field of result.meta?.unavailableFields || []) unavailable.add(field);
        for (const row of result.data) {
          if (row.id == null || seen.has(String(row.id))) throw new Error('La lista cambió durante la carga o contiene identificadores repetidos. Recargá para obtener un conjunto consistente.');
          seen.add(String(row.id)); rows.push(row);
        }
        if (rows.length > 500000) throw new Error('El conjunto es demasiado grande. Reducí los filtros.');
        if (!result.data.length) return { data: rows, unavailableFields: [...unavailable] };
        const next = result.meta?.nextOffset;
        if (!Number.isSafeInteger(next) || next !== offset + result.data.length) throw new Error('La paginación del servidor es incompatible. Recargá la aplicación.');
        offset = next; // Handles Directus caps smaller than the requested limit.
      }
      throw new Error('Se alcanzó el límite de páginas. Reducí los filtros.');
    } finally { clearTimeout(timer); }
  }
  root.EndoDBApi = { request, all };
})(window);
