import "server-only";
import { DirectusUpstreamError, readDirectusFields, readDirectusRelations } from "../directus/client.js";

export function requireFields(fields, required) {
  if (required.some(field => !fields.has(field))) throw new DirectusUpstreamError("DIRECTUS_SCHEMA_MISMATCH");
}
export async function locationSchema() {
  const rows = await readDirectusFields("bd_sedes");
  const fields = new Set(rows.map(row => row.field));
  requireFields(fields, ["id", "nombre"]);
  return fields;
}
export async function studySchema() {
  // Same identity as the data request, every time; no stale cache or admin fallback.
  const [rows, locations, relations] = await Promise.all([
    readDirectusFields("bd_estudios"), locationSchema(), readDirectusRelations("bd_estudios"),
  ]);
  const fields = new Set(rows.map(row => row.field));
  requireFields(fields, ["id", "procedure_type", "fecha_estudio", "sede"]);
  if (!relations.some(relation => relation.collection === "bd_estudios" && relation.field === "sede" && relation.related_collection === "bd_sedes")) throw new DirectusUpstreamError("DIRECTUS_SCHEMA_MISMATCH");
  return { fields, locations };
}
