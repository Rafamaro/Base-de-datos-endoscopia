export const STUDY_FIELDS = Object.freeze([
  "id",
  "procedure_type",
  "fecha_estudio",
  "entubacion_cecal",
  "boston_total",
  "boston_derecho",
  "boston_transverso",
  "boston_izquierdo",
  "polipos",
  "tipo_preparacion",
  "requiere_revision",
  "motivo_incompleta",
  "punto_maximo_alcanzado",
  "preparacion_impidio_progresion",
  "incluir_tasa_bruta",
  "incluir_tasa_ajustada",
  "lugar_estudio.id",
  "lugar_estudio.codigo",
  "lugar_estudio.nombre",
  "lugar_estudio.nombre_corto",
]);

const ALLOWED_QUERY_PARAMS = new Set(["limit", "page", "procedure_type", "location_id", "year", "requires_review"]);

function positiveInteger(value, name, { max } = {}) {
  if (!/^\d+$/.test(value)) throw new Error(`${name} debe ser un entero positivo.`);
  const number = Number(value);
  if (number < 1 || (max && number > max)) throw new Error(`${name} está fuera del rango permitido.`);
  return number;
}

export function parseStudiesQuery(searchParams, currentYear = new Date().getUTCFullYear()) {
  for (const key of searchParams.keys()) {
    if (!ALLOWED_QUERY_PARAMS.has(key)) throw new Error(`Parámetro no permitido: ${key}.`);
  }
  const limit = searchParams.has("limit") ? positiveInteger(searchParams.get("limit"), "limit", { max: 500 }) : 100;
  const page = searchParams.has("page") ? positiveInteger(searchParams.get("page"), "page") : 1;
  const procedureType = searchParams.get("procedure_type");
  if (procedureType && !["VEDA", "VCC"].includes(procedureType)) throw new Error("procedure_type debe ser VEDA o VCC.");
  const locationId = searchParams.has("location_id") ? positiveInteger(searchParams.get("location_id"), "location_id") : undefined;
  const year = searchParams.has("year") ? positiveInteger(searchParams.get("year"), "year") : undefined;
  if (year && (year < 2000 || year > currentYear + 1)) throw new Error("year está fuera del rango permitido.");
  const requiresReviewRaw = searchParams.get("requires_review");
  if (requiresReviewRaw && !["true", "false"].includes(requiresReviewRaw)) throw new Error("requires_review debe ser true o false.");
  return {
    limit,
    page,
    procedure_type: procedureType || undefined,
    location_id: locationId,
    year,
    requires_review: requiresReviewRaw === null ? undefined : requiresReviewRaw === "true",
  };
}

export function buildStudiesFilter(params) {
  const filter = {};
  if (params.procedure_type) filter.procedure_type = { _eq: params.procedure_type };
  if (params.location_id) filter.lugar_estudio = { id: { _eq: params.location_id } };
  if (params.year) {
    filter.fecha_estudio = { _gte: `${params.year}-01-01`, _lte: `${params.year}-12-31` };
  }
  if (params.requires_review !== undefined) filter.requiere_revision = { _eq: params.requires_review };
  return filter;
}

export function normalizeStudy(study) {
  return {
    id: study.id ?? null,
    procedure_type: study.procedure_type ?? null,
    fecha_estudio: study.fecha_estudio ?? null,
    entubacion_cecal: study.entubacion_cecal ?? null,
    boston: {
      total: study.boston_total ?? null,
      derecho: study.boston_derecho ?? null,
      transverso: study.boston_transverso ?? null,
      izquierdo: study.boston_izquierdo ?? null,
    },
    polipos: study.polipos ?? null,
    tipo_preparacion: study.tipo_preparacion ?? null,
    requiere_revision: study.requiere_revision ?? null,
    motivo_incompleta: study.motivo_incompleta ?? null,
    punto_maximo_alcanzado: study.punto_maximo_alcanzado ?? null,
    preparacion_impidio_progresion: study.preparacion_impidio_progresion ?? null,
    incluir_tasa_bruta: study.incluir_tasa_bruta ?? null,
    incluir_tasa_ajustada: study.incluir_tasa_ajustada ?? null,
    lugar_estudio: {
      id: study.lugar_estudio?.id ?? null,
      codigo: study.lugar_estudio?.codigo ?? null,
      nombre: study.lugar_estudio?.nombre ?? null,
      nombre_corto: study.lugar_estudio?.nombre_corto ?? null,
    },
  };
}
