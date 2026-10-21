export const LOCATION_FIELDS = Object.freeze(["id", "codigo", "nombre", "activo", "organizacion"]);
export function normalizeLocation(location) {
  return {
    id: location.id ?? null, codigo: location.codigo ?? null, nombre: location.nombre ?? null, activo: location.activo ?? null,
    organizacion: typeof location.organizacion === "object" ? location.organizacion?.id ?? null : location.organizacion ?? null,
  };
}
