import assert from 'node:assert/strict';
import test from 'node:test';
import { GET as studies } from '../app/api/studies/route.js';
import { GET as locations } from '../app/api/locations/route.js';
import { GET as diagnostic } from '../app/api/diagnostics/directus/route.js';

const siteId = '7a898b58-72db-49a5-a8a9-130456b78f01';
const studyFields = ['id', 'procedure_type', 'fecha_estudio', 'sede', 'polipos'];
const siteFields = ['id', 'codigo', 'nombre', 'activo'];
const originalFetch = globalThis.fetch;
const originalUrl = process.env.DIRECTUS_URL;
const originalToken = process.env.DIRECTUS_TOKEN;
process.env.DIRECTUS_URL = 'http://localhost:47771';
process.env.DIRECTUS_TOKEN = 'test-only';
test.after(() => { globalThis.fetch = originalFetch; if (originalUrl === undefined) delete process.env.DIRECTUS_URL; else process.env.DIRECTUS_URL = originalUrl; if (originalToken === undefined) delete process.env.DIRECTUS_TOKEN; else process.env.DIRECTUS_TOKEN = originalToken; });

function upstream({ denied = false, noRelation = false } = {}) {
  const seen = [];
  globalThis.fetch = async (url, options) => {
    const target = new URL(url), path = target.pathname;
    seen.push({ path, query: Object.fromEntries(target.searchParams), token: options.headers.Authorization });
    if (denied && path === '/items/bd_estudios') return Response.json({ errors: [{ extensions: { code: 'FORBIDDEN' } }] }, { status: 403 });
    let data;
    if (path === '/fields/bd_estudios') data = studyFields.map(field => ({ field }));
    else if (path === '/fields/bd_sedes') data = siteFields.map(field => ({ field }));
    else if (path === '/relations/bd_estudios') data = noRelation ? [] : [{ collection: 'bd_estudios', field: 'sede', related_collection: 'bd_sedes' }];
    else if (path === '/items/bd_sedes') data = [{ id: siteId, codigo: 'CENTRO', nombre: 'Centro', activo: true }];
    else if (path === '/items/bd_estudios') data = [
      { id: 10, procedure_type: 'VEDA', fecha_estudio: '2026-01-01', sede: { id: siteId, nombre: 'Centro' }, paciente: { nombre: 'NO' } },
      { id: 11, procedure_type: 'VCC', fecha_estudio: '2026-01-01', sede: { id: siteId, nombre: 'Centro' } },
    ];
    else throw new Error('Unexpected path');
    return Response.json({ data });
  };
  return seen;
}
const request = (path) => new Request(`http://localhost:3000${path}`);

test('studies endpoint probes schema, excludes unavailable fields and identity, keeps VEDA/VCC distinct', { concurrency: false }, async () => {
  const seen = upstream();
  const response = await studies(request(`/api/studies?location_id=${siteId}`));
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(payload.data.map(row => row.procedure_type), ['VEDA', 'VCC']);
  assert.equal(JSON.stringify(payload.data).includes('"paciente"'), false);
  assert.equal(payload.meta.unavailableFields.includes('preparacion_impidio_progresion'), true);
  const read = seen.find(entry => entry.path === '/items/bd_estudios');
  assert.equal(read.query.fields.includes('preparacion_impidio_progresion'), false);
  assert.deepEqual(JSON.parse(read.query.filter).sede, { _eq: siteId });
});

test('locations endpoint reads bd_sedes and retains UUID', { concurrency: false }, async () => {
  const seen = upstream();
  const response = await locations(request('/api/locations'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).data[0].id, siteId);
  assert.equal(seen.some(entry => entry.path.includes('bd_lugares')), false);
});

test('endpoint errors are bounded and diagnostic verifies relation', { concurrency: false }, async () => {
  upstream({ denied: true });
  const denied = await studies(request('/api/studies'));
  assert.equal(denied.status, 403);
  const error = await denied.json();
  assert.equal(error.error, 'DIRECTUS_ACCESS_DENIED');
  assert.equal(JSON.stringify(error).includes('test-only'), false);
  upstream({ noRelation: true });
  const broken = await diagnostic();
  assert.equal(broken.status, 502);
  assert.equal((await broken.json()).error, 'DIRECTUS_SCHEMA_MISMATCH');
  const invalid = await studies(request('/api/studies?location_id=4'));
  assert.equal(invalid.status, 400);
});
