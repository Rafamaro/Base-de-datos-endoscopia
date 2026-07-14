export const ENDODB_READ_COLLECTIONS = Object.freeze([
  "bd_estudios",
  "bd_ingestas",
  "bd_lugares",
]);

const BLOCKED_COLLECTIONS = new Set([
  "bd_pacientes",
  "directus_users",
  "directus_roles",
  "directus_permissions",
]);

export function assertAllowedEndodbCollection(collection) {
  if (!ENDODB_READ_COLLECTIONS.includes(collection)) {
    const error = new Error("La colección solicitada no está permitida para lectura en EndoDB.");
    error.code = "ENDODB_COLLECTION_NOT_ALLOWED";
    error.collection = BLOCKED_COLLECTIONS.has(collection) ? collection : undefined;
    throw error;
  }
  return collection;
}
