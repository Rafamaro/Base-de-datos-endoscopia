export const LOCATION_FIELDS = Object.freeze([
  "id",
  "codigo",
  "nombre",
  "nombre_corto",
  "tipo",
  "activo",
  "orden",
]);

export function normalizeLocation(location) {
  return {
    id: location.id ?? null,
    codigo: location.codigo ?? null,
    nombre: location.nombre ?? null,
    nombre_corto: location.nombre_corto ?? null,
    tipo: location.tipo ?? null,
    orden: location.orden ?? null,
  };
}
