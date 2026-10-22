import assert from "node:assert/strict";
import test from "node:test";

import { assertAllowedEndodbCollection, ENDODB_READ_COLLECTIONS } from "../lib/directus/endodbCollections.js";
import { buildStudiesFilter, normalizeStudy, parseStudiesQuery, selectStudyFields, STUDY_FIELDS } from "../lib/endodb/studies.js";
import { classifyDirectusFailure } from "../lib/directus/errors.js";
import "../public/endodb-metrics.js";

function parse(query, currentYear = 2026) {
  return parseStudiesQuery(new URLSearchParams(query), currentYear);
}

test("allowlist accepts only EndoDB read collections", () => {
  assert.deepEqual(ENDODB_READ_COLLECTIONS, ["bd_estudios", "bd_sedes", "bd_membresias"]);
  assert.equal(assertAllowedEndodbCollection("bd_estudios"), "bd_estudios");
  assert.throws(() => assertAllowedEndodbCollection("bd_pacientes"), /no está permitida/);
  assert.throws(() => assertAllowedEndodbCollection("directus_users"), /no está permitida/);
});

test("validates limit", () => {
  assert.equal(parse("").limit, 100);
  assert.equal(parse("limit=1").limit, 1);
  assert.equal(parse("limit=500").limit, 500);
  assert.throws(() => parse("limit=0"), /limit/);
  assert.throws(() => parse("limit=501"), /limit/);
});

test("validates page", () => {
  assert.equal(parse("").page, 1);
  assert.equal(parse("page=2").page, 2);
  assert.throws(() => parse("page=0"), /page/);
});

test("validates procedure_type", () => {
  assert.equal(parse("procedure_type=VEDA").procedure_type, "VEDA");
  assert.equal(parse("procedure_type=VCC").procedure_type, "VCC");
  assert.throws(() => parse("procedure_type=OTHER"), /procedure_type/);
});

test("validates location_id", () => {
  assert.equal(parse("location_id=7a898b58-72db-49a5-a8a9-130456b78f01").location_id, "7a898b58-72db-49a5-a8a9-130456b78f01");
  assert.throws(() => parse("location_id=0"), /location_id/);
  assert.equal(parse("location_id=__missing").location_id, "__missing");
  assert.throws(() => parse("location_id=abc"), /location_id/);
});

test("validates year", () => {
  assert.equal(parse("year=2000", 2026).year, 2000);
  assert.equal(parse("year=2027", 2026).year, 2027);
  assert.throws(() => parse("year=1999", 2026), /year/);
  assert.throws(() => parse("year=2028", 2026), /year/);
});

test("validates requires_review", () => {
  assert.equal(parse("requires_review=true").requires_review, true);
  assert.equal(parse("requires_review=false").requires_review, false);
  assert.throws(() => parse("requires_review=1"), /requires_review/);
});

test("rejects unknown query parameters", () => {
  assert.throws(() => parse("filter={}"), /parámetro no permitido/);
});

test("public study projection omits identity and source filename", () => {
  const normalized = normalizeStudy({
    id: 1,
    numero_en_archivo: 2,
    exam_id: "EX",
    legacy_row_id: "LEG",
    procedure_type: "VCC",
    fecha_estudio: "2026-07-01",
    entubacion_cecal: true,
    boston_total: 9,
    boston_derecho: 3,
    boston_transverso: 3,
    boston_izquierdo: 3,
    polipos: false,
    tipo_preparacion: "Barex",
    preparacion_texto: "",
    requiere_revision: null,
    observaciones: "",
    lugar_fuente: "frontend",
    sede: { id: "7a898b58-72db-49a5-a8a9-130456b78f01", codigo: "SANTA_ISABEL", nombre: "Clínica Santa Isabel" },
    ingesta: { id: 7, source_file_name: "2026-01-01_VCC_12345678_NOMBRE.pdf", source_file_kind: "pdf", status: "procesado" },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    paciente: { nombre: "NO" },
    raw_ai_json: { secret: true },
  });
  assert.equal(normalized.requiere_revision, null);
  assert.equal(normalized.sede.codigo, "SANTA_ISABEL");
  assert.equal(normalized.boston.total, 9);
  assert.equal(normalized.ingesta, undefined);
  for (const key of ["paciente", "raw_ai_json", "ingesta", "exam_id", "legacy_row_id", "observaciones", "preparacion_texto"]) {
    assert.equal(STUDY_FIELDS.some(field => field === key || field.startsWith(`${key}.`)), false);
    assert.equal(Object.hasOwn(normalized, key), false);
  }
  assert.equal(JSON.stringify(normalized).includes("12345678"), false);
  assert.equal(Object.hasOwn(normalized, "paciente"), false);
  assert.equal(Object.hasOwn(normalized, "raw_ai_json"), false);
});

test("Directus failures distinguish access, schema, collection and upstream", () => {
  assert.equal(classifyDirectusFailure(403, "FORBIDDEN"), "DIRECTUS_ACCESS_DENIED");
  assert.equal(classifyDirectusFailure(400, "INVALID_QUERY"), "DIRECTUS_SCHEMA_MISMATCH");
  assert.equal(classifyDirectusFailure(404, "COLLECTION_NOT_FOUND"), "DIRECTUS_COLLECTION_NOT_FOUND");
  assert.equal(classifyDirectusFailure(502), "DIRECTUS_UPSTREAM_ERROR");
});


test("selects only verified optional fields, uses UUID relation and preserves two procedures", () => {
  const schema = { fields: new Set(["id", "procedure_type", "fecha_estudio", "sede", "polipos"]), locations: new Set(["id", "nombre"]) };
  assert.deepEqual(selectStudyFields(schema), ["id", "procedure_type", "fecha_estudio", "polipos", "sede.id", "sede.nombre"]);
  assert.deepEqual(buildStudiesFilter(parse("procedure_type=VCC&location_id=7a898b58-72db-49a5-a8a9-130456b78f01")), {
    procedure_type: { _eq: "VCC" }, sede: { _eq: "7a898b58-72db-49a5-a8a9-130456b78f01" },
  });
  const procedures = [normalizeStudy({ id: 10, procedure_type: "VEDA" }), normalizeStudy({ id: 11, procedure_type: "VCC" })];
  assert.deepEqual(procedures.map(row => row.procedure_type), ["VEDA", "VCC"]);
  assert.notEqual(procedures[0].id, procedures[1].id);
});

test("cecal percentage separates documented from all VCC; VEDA never enters denominator", () => {
  const rows = [
    { procedure_type: "VEDA", entubacion_cecal: false },
    { procedure_type: "VCC", entubacion_cecal: true, punto_maximo_alcanzado: "ciego" },
    { procedure_type: "VCC", entubacion_cecal: false, punto_maximo_alcanzado: "angulo_esplenico" },
    { procedure_type: "VCC", entubacion_cecal: null },
  ];
  const m = globalThis.EndoDBMetrics.summarize(rows);
  assert.deepEqual(m.cecal, { numerator: 1, denominator: 2, total: 3 });
  assert.equal(globalThis.EndoDBMetrics.percent(m.cecal), "50%");
  assert.equal(globalThis.EndoDBMetrics.totalDetail(m.cecal), "33.3% · 1/3 VCC totales");
});
