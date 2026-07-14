import assert from "node:assert/strict";
import test from "node:test";

import { assertAllowedEndodbCollection, ENDODB_READ_COLLECTIONS } from "../lib/directus/endodbCollections.js";
import { normalizeStudy, parseStudiesQuery } from "../lib/endodb/studies.js";

function parse(query, currentYear = 2026) {
  return parseStudiesQuery(new URLSearchParams(query), currentYear);
}

test("allowlist accepts only EndoDB read collections", () => {
  assert.deepEqual(ENDODB_READ_COLLECTIONS, ["bd_estudios", "bd_ingestas", "bd_lugares"]);
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
  assert.equal(parse("location_id=10").location_id, 10);
  assert.throws(() => parse("location_id=0"), /location_id/);
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
  assert.throws(() => parse("filter={}"), /Parámetro no permitido/);
});

test("normalizes study without patient or raw AI JSON fields", () => {
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
    lugar_estudio: { id: 5, codigo: "SANTA_ISABEL", nombre: "Clínica Santa Isabel", nombre_corto: "Santa Isabel" },
    ingesta: { id: 7, source_file_name: "archivo.pdf", source_file_kind: "pdf", status: "procesado" },
    created_at: "2026-07-01T00:00:00.000Z",
    updated_at: "2026-07-02T00:00:00.000Z",
    paciente: { nombre: "NO" },
    raw_ai_json: { secret: true },
  });
  assert.equal(normalized.requiere_revision, null);
  assert.equal(normalized.lugar.codigo, "SANTA_ISABEL");
  assert.equal(normalized.ingesta.source_file_name, "archivo.pdf");
  assert.equal(Object.hasOwn(normalized, "paciente"), false);
  assert.equal(Object.hasOwn(normalized, "raw_ai_json"), false);
});
