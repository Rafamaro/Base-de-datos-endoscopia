// Real HTTP checks only. No fixtures, no patient records, no secrets in output.
const base = (process.env.ENDODB_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const credentials = process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET
  ? { 'CF-Access-Client-Id': process.env.CF_ACCESS_CLIENT_ID, 'CF-Access-Client-Secret': process.env.CF_ACCESS_CLIENT_SECRET }
  : {};
const checks = ['/api/health', '/api/diagnostics/directus', '/api/locations', '/api/studies?limit=1&page=1', '/api/calidad/rows'];
let failed = false;

for (const path of checks) {
  try {
    const response = await fetch(`${base}${path}`, { headers: { Accept: 'application/json', ...credentials }, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(12000) });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { /* Classified below; never print upstream bodies. */ }
    const marker = response.headers.get('x-endodb-runtime');
    const access = response.status === 302 && /cloudflareaccess\.com|\/cdn-cgi\/access\//.test(response.headers.get('location') || '');
    const old = text.includes('Use /api/(calidad|registro)/(columns|rows)') || text.includes('/nc/tables/{id}/(columns|rows)');
    const expectedStatus = path.startsWith('/api/calidad/') ? 410 : 200;
    const valid = marker === 'nextjs-directus' && response.status === expectedStatus && (expectedStatus !== 200 || json?.ok === true);
    const cause = access ? 'CLOUDFLARE_ACCESS_LOGIN' : old ? 'OLD_NEXTCLOUD_BACKEND' : marker !== 'nextjs-directus' ? 'NOT_NEXTJS_OR_INTERCEPTED' : json?.error || 'OK';
    console.log(`${path}: HTTP ${response.status} · ${valid ? 'OK' : cause}${json?.release ? ` · release=${json.release}` : ''}`);
    if (!valid) failed = true;
  } catch (error) {
    console.log(`${path}: CONNECTION_ERROR (${error.name})`);
    failed = true;
  }
}
process.exitCode = failed ? 1 : 0;
