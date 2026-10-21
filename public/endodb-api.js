/* Same-origin, read-only API used by all EndoDB pages. */
window.endodbGet = async function endodbGet(path) {
  let response;
  try {
    response = await fetch(path, { headers: { Accept: 'application/json' }, cache: 'no-store' });
  } catch {
    throw new Error('No se pudo conectar con EndoDB. Comprobá el dominio y la red.');
  }
  if (response.url.includes('/cdn-cgi/access/login/') || response.url.includes('cloudflareaccess.com')) {
    throw new Error('Cloudflare Access solicita iniciar sesión antes de consultar EndoDB.');
  }
  const raw = await response.text();
  if (raw.includes('Use /api/(calidad|registro)/(columns|rows)') || raw.includes('/nc/tables/{id}/(columns|rows)')) {
    throw new Error('Versión antigua: el dominio está sirviendo la API de Nextcloud Tables. Revisá la ruta Cloudflare y el servicio Coolify.');
  }
  const marker = response.headers.get('X-EndoDB-Runtime');
  if (marker !== 'nextjs-directus') {
    throw new Error(`La solicitud no llegó a EndoDB Next.js (HTTP ${response.status}). Revisá Cloudflare Worker, Access y el destino del túnel.`);
  }
  let payload;
  try { payload = JSON.parse(raw); } catch {
    throw new Error(`EndoDB Next.js devolvió contenido no JSON (HTTP ${response.status}).`);
  }
  if (!response.ok || payload.ok !== true) {
    throw new Error(`${payload.error || 'ENDODB_ERROR'}: ${payload.message || `HTTP ${response.status}`}`);
  }
  if (!Array.isArray(payload.data)) throw new Error('La API de EndoDB no devolvió una lista de datos.');
  return payload.data;
};
