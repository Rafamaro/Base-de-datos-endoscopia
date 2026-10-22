import { authorizeIngest, checkFile, conflictPreview, extractText, fingerprint, forwardIngest, ingestConfig, IngestError, previewToken, verifyPreview } from "../../../lib/endodb/ingest.js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    const config = ingestConfig();
    const form = await request.formData();
    const siteId = form.get("sede_id");
    const { site, userId } = await authorizeIngest(request, siteId, config);
    const file = form.get("file");
    const mime = checkFile(file);
    const examId = form.get("exam_id");
    if (typeof examId !== "string" || !examId.trim() || examId.length > 120) throw new IngestError("EXAM_ID_REQUIRED");
    const mode = form.get("mode");
    if (!["preview", "commit"].includes(mode)) throw new IngestError("MODE_INVALID");
    const date = form.get("fecha_estudio") || "";
    const types = String(form.get("procedure_types") || "").split(",").filter(Boolean);
    if (!date || !types.length || types.length > 2 || new Set(types).size !== types.length ||
        types.some(type => !["VEDA", "VCC"].includes(type)) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new IngestError("METADATA_INVALID");
    const hash = fingerprint(Buffer.from(await file.arrayBuffer()));
    const context = { hash, examId, siteId: site.id, userId, date, types: types.join(",") };
    const conflicts = await conflictPreview(examId, site, date, types);
    if (conflicts.length) return Response.json({ ok: false, error: "RECONCILIATION_REQUIRED", conflicts, message: "Hay estudios existentes. Validá la coincidencia antes de migrar; no se envió nada a n8n." }, { status: 409 });
    if (mode === "preview") return Response.json({ ok: true, dry_run: true, conflicts: [], file: { name: file.name, bytes: file.size, sha256: hash }, site: { id: site.id, codigo: site.codigo }, exam_id: examId, token: previewToken(config, context) });
    verifyPreview(config, form.get("preview_token"), context);
    // Text extraction/OCR is local. n8n receives full faithful text and anonymizes before DeepSeek.
    const text = await extractText(file, mime);
    if (!text.trim() || text.length > 1_000_000) throw new IngestError("TEXT_INVALID", 422);
    const result = await forwardIngest(config, {
      sede_id: site.id, organizacion_id: site.organizacion, operador_id: userId,
      exam_id: examId, client_filename: file.name, mime_type: mime,
      fecha_estudio_context: date, procedure_types_context: types.join(","),
      source_file_kind: mime === "application/pdf" ? "pdf" : mime.startsWith("image/") ? "image" : mime === "application/json" ? "json" : "txt",
    }, text);
    return Response.json(result);
  } catch (error) {
    const code = error instanceof IngestError ? error.code : "INGEST_FAILED";
    const status = error instanceof IngestError ? error.status : 502;
    return Response.json({ ok: false, error: code }, { status });
  }
}
