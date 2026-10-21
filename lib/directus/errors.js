export function classifyDirectusFailure(status, upstreamCode) {
  if (status === 401 || status === 403 || upstreamCode === "FORBIDDEN") return "DIRECTUS_ACCESS_DENIED";
  if (upstreamCode === "INVALID_QUERY" || upstreamCode === "INVALID_PAYLOAD" || upstreamCode === "FAILED_VALIDATION") return "DIRECTUS_SCHEMA_MISMATCH";
  if (status === 404 || upstreamCode === "COLLECTION_NOT_FOUND") return "DIRECTUS_COLLECTION_NOT_FOUND";
  return "DIRECTUS_UPSTREAM_ERROR";
}
