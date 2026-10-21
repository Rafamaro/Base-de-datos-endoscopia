export const STUDY_FIELDS = Object.freeze([
  "id", "procedure_type", "fecha_estudio", "entubacion_cecal", "boston_total",
  "boston_derecho", "boston_transverso", "boston_izquierdo", "polipos", "tipo_preparacion",
  "requiere_revision", "motivo_incompleta", "punto_maximo_alcanzado",
  "preparacion_impidio_progresion", "incluir_tasa_bruta", "incluir_tasa_ajustada",
]);
export const SITE_DISPLAY_FIELDS = Object.freeze(["id", "codigo", "nombre"]);
const ALLOWED_QUERY_PARAMS = new Set(["limit", "page", "offset", "procedure_type", "location_id", "year", "requires_review"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function integer(value, name, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const number = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(number) || number < min || number > max) throw new Error(`${name} está fuera del rango permitido.`);
  return number;
}
export function validateQueryKeys(searchParams, allowed) {
  for (const key of searchParams.keys()) {
    if (!allowed.has(key)) throw new Error("La consulta contiene un parámetro no permitido.");
    if (searchParams.getAll(key).length !== 1) throw new Error("La consulta contiene parámetros repetidos.");
  }
}
export function parsePagination(searchParams) {
  if (searchParams.has("page") && searchParams.has("offset")) throw new Error("Usá page u offset, no ambos.");
  const limit = searchParams.has("limit") ? integer(searchParams.get("limit"), "limit", { max: 500 }) : 100;
  const page = searchParams.has("page") ? integer(searchParams.get("page"), "page", { max: 1000000 }) : 1;
  const offset = searchParams.has("offset") ? integer(searchParams.get("offset"), "offset", { min: 0, max: 500000000 }) : (page - 1) * limit;
  return { limit, page, offset };
}
export function parseStudiesQuery(searchParams, currentYear = new Date().getUTCFullYear()) {
  validateQueryKeys(searchParams, ALLOWED_QUERY_PARAMS);
  const pagination = parsePagination(searchParams);
  const procedureType = searchParams.get("procedure_type");
  if (procedureType !== null && !["VEDA", "VCC"].includes(procedureType)) throw new Error("procedure_type debe ser VEDA o VCC.");
  let locationId;
  if (searchParams.has("location_id")) {
    const raw = searchParams.get("location_id");
    if (raw !== "__missing" && !UUID.test(raw)) throw new Error("location_id debe ser un UUID de bd_sedes.");
    locationId = raw === "__missing" ? raw : raw.toLowerCase();
  }
  const year = searchParams.has("year") ? integer(searchParams.get("year"), "year", { min: 2000, max: currentYear + 1 }) : undefined;
  const review = searchParams.get("requires_review");
  if (review !== null && !["true", "false"].includes(review)) throw new Error("requires_review debe ser true o false.");
  return { ...pagination, procedure_type: procedureType || undefined, location_id: locationId, year, requires_review: review === null ? undefined : review === "true" };
}
export function buildStudiesFilter(params) {
  const filter = {};
  if (params.procedure_type) filter.procedure_type = { _eq: params.procedure_type };
  if (params.location_id) filter.sede = params.location_id === "__missing" ? { _null: true } : { _eq: params.location_id };
  if (params.year) filter.fecha_estudio = { _gte: `${params.year}-01-01`, _lte: `${params.year}-12-31` };
  if (params.requires_review !== undefined) filter.requiere_revision = { _eq: params.requires_review };
  return filter;
}
export function selectStudyFields(schema) {
  return [...STUDY_FIELDS.filter(field => schema.fields.has(field)), ...SITE_DISPLAY_FIELDS.filter(field => schema.locations.has(field)).map(field => `sede.${field}`)];
}
export function normalizeStudy(study) {
  const result = Object.fromEntries(STUDY_FIELDS.filter(field => !field.startsWith("boston_")).map(field => [field, study[field] ?? null]));
  result.boston = Object.fromEntries(["total", "derecho", "transverso", "izquierdo"].map(field => [field, study[`boston_${field}`] ?? null]));
  const site = study.sede;
  result.sede = site == null ? null : {
    id: typeof site === "object" ? site.id ?? null : site,
    codigo: typeof site === "object" ? site.codigo ?? null : null,
    nombre: typeof site === "object" ? site.nombre ?? null : null,
  };
  return result;
}
