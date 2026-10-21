import assert from 'node:assert/strict';
import test from 'node:test';
import { generateKeyPairSync, sign } from 'node:crypto';
import { POST } from '../app/api/locations/route.js';

const originalFetch = globalThis.fetch;
const names = ['DIRECTUS_URL','DIRECTUS_TOKEN','ENDODB_PUBLIC_URL','ENDODB_ACCESS_TEAM_DOMAIN','ENDODB_ACCESS_AUD','ENDODB_SITE_ADMIN_EMAILS','ENDODB_ORGANIZATION_ID','ENDODB_SITE_WRITE_TOKEN'];
const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
const orgId = 'ad503839-96ec-45df-8bb4-af41e2732265';
const siteId = '2b60321f-ceba-49d1-aa26-e90b108a3ccf';
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'test-key', alg: 'RS256', use: 'sig' };
const jwt = (email = 'admin@example.com') => {
  const now = Math.floor(Date.now()/1000);
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test-key' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ iss: 'https://team.cloudflareaccess.com', aud: ['endodb-audience'], type: 'app', sub: 'user-id', email, iat: now, nbf: now, exp: now+300 })).toString('base64url');
  const data = `${header}.${payload}`;
  return `${data}.${sign('RSA-SHA256', Buffer.from(data), privateKey).toString('base64url')}`;
};
function configure() {
  Object.assign(process.env, {
    DIRECTUS_URL: 'http://localhost:47771', DIRECTUS_TOKEN: 'read-only-test',
    ENDODB_PUBLIC_URL: 'https://endodb.drperez86.com', ENDODB_ACCESS_TEAM_DOMAIN: 'https://team.cloudflareaccess.com',
    ENDODB_ACCESS_AUD: 'endodb-audience', ENDODB_SITE_ADMIN_EMAILS: 'admin@example.com',
    ENDODB_ORGANIZATION_ID: orgId, ENDODB_SITE_WRITE_TOKEN: 'site-create-test',
  });
}
function request(token = jwt(), body = { nombre: 'Clínica Norte', codigo: 'CLINICA_NORTE', direccion: 'Calle 1' }) {
  return new Request('https://endodb.drperez86.com/api/locations', {
    method: 'POST', headers: { Origin: 'https://endodb.drperez86.com', 'Content-Type': 'application/json', ...(token ? { 'Cf-Access-Jwt-Assertion': token } : {}) },
    body: JSON.stringify(body),
  });
}
function fakeDirectus({ duplicate = false, hidden = false } = {}) {
  const calls = [];
  globalThis.fetch = async (target, options) => {
    const path = new URL(target).pathname;
    calls.push({ path, options });
    if (path.endsWith('/cdn-cgi/access/certs')) return Response.json({ keys: [jwk] });
    if (path === '/fields/bd_sedes') return Response.json({ data: ['id','nombre','codigo','activo','organizacion','direccion'].map(field => ({ field })) });
    if (path === '/items/bd_sedes' && options.method === 'POST') return Response.json({ data: { id: siteId } }, { status: 201 });
    if (path === '/items/bd_sedes') {
      const query = JSON.parse(new URL(target).searchParams.get('filter'));
      return Response.json({ data: query.codigo ? (duplicate ? [{ id: siteId }] : []) : (hidden ? [] : [{ id: siteId, nombre: 'Clínica Norte', codigo: 'CLINICA_NORTE', activo: true, organizacion: orgId }]) });
    }
    throw new Error('Unexpected request');
  };
  return calls;
}
test.after(() => {
  globalThis.fetch = originalFetch;
  for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
});

test('creates an active site in configured organization and returns it for selection', { concurrency: false }, async () => {
  configure(); const calls = fakeDirectus();
  const response = await POST(request());
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.data.id, siteId);
  assert.equal(payload.visible, true);
  const write = calls.find(call => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(write.options.body), { nombre: 'Clínica Norte', codigo: 'CLINICA_NORTE', direccion: 'Calle 1', activo: true, organizacion: orgId });
  assert.equal(write.options.headers.Authorization, 'Bearer site-create-test');
});

test('rejects missing and forged identity without writing', { concurrency: false }, async () => {
  configure(); const calls = fakeDirectus();
  assert.equal((await POST(request(null))).status, 403);
  assert.equal((await POST(request(jwt('other@example.com')))).status, 403);
  const forged = jwt().slice(0, -2) + 'xx';
  assert.equal((await POST(request(forged))).status, 403);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
});

test('rejects duplicates, client organization overrides and missing configuration', { concurrency: false }, async () => {
  configure(); const calls = fakeDirectus({ duplicate: true });
  assert.equal((await POST(request())).status, 409);
  assert.equal((await POST(request(jwt(), { nombre: 'Clínica Norte', codigo: 'CLINICA_NORTE', organizacion: siteId }))).status, 400);
  assert.equal(calls.filter(call => call.options.method === 'POST').length, 0);
  delete process.env.ENDODB_ORGANIZATION_ID;
  assert.equal((await POST(request())).status, 503);
});

test('reports successful creation even when the reader cannot see the new site', { concurrency: false }, async () => {
  configure(); fakeDirectus({ hidden: true });
  const response = await POST(request());
  const payload = await response.json();
  assert.equal(response.status, 201);
  assert.equal(payload.visible, false);
  assert.equal(payload.data.id, siteId);
  assert.match(payload.warning, /creó/);
});
