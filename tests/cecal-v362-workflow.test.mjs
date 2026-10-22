import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const workflow = JSON.parse(readFileSync(new URL("../workflows/endodb_v362_cecal_corregido_mismo_webhook.json", import.meta.url), "utf8"));
const named = name => workflow.nodes.find(n => n.name === name);
const save = named("Directus — guardar estudio").parameters.jsCode;
const markerA = "// CECAL_QC_V362_BEGIN", markerB = "// CECAL_QC_V362_END";
const snippet = save.slice(save.indexOf(markerA) + markerA.length, save.indexOf(markerB)).replace(/^[^\n]*\n/, "");
const qc = runInNewContext(snippet + "\n evaluarCecalV362;", {});
const scenarios = [
  { label:"Dante: casilla sí pero detenido en ángulo esplénico", t:"CIEGO: Si\nINFORME_VCC: Se progresa hasta el ángulo esplénico debido a angulación fija infranqueable.\nDIAGNOSTICOS_VCC: Colonoscopia incompleta", structured:true, value:false, point:"angulo_esplenico", reason:"angulacion_fija" },
  { label:"Graciela: ciego sí y mala preparación", t:"CIEGO: Si\nINFORME_VCC: Se progresa hasta el ciego. Boston total 5 por mala preparación.", structured:true, value:true, point:"ciego" },
  { label:"Ciego documentado sin casilla", t:"Se progresa hasta el ciego, se identifica el orificio apendicular.", value:true, point:"ciego" },
  { label:"Ileon terminal", t:"Se progresa hasta el íleon terminal.", value:true, point:"ileon_terminal" },
  { label:"No documentado", t:"Colonoscopia, mucosa sin alteraciones.", value:null, point:"no_informado" },
  { label:"Ciego mencionado por pólipo", t:"Pólipo en ciego de 5 mm.", value:null },
  { label:"No se alcanza ciego", t:"No se logró alcanzar el ciego por colon redundante.", value:false },
  { label:"Casilla NO sin informe", t:"CIEGO: No\nINFORME_VCC: Mucosa sin lesiones.", structured:true, value:null },
  { label:"Casilla SI aislada", t:"CIEGO: Sí\nINFORME_VCC: Mucosa sin lesiones.", structured:true, value:true },
  { label:"Contradicción en narrativa", t:"Se progresa hasta el angulo esplenico. Se llega al ciego.", value:null },
  { label:"Detenido en sigmoides", t:"Se detuvo en sigmoides por mala preparación.", value:false, point:"sigmoides", reason:"mala_preparacion" },
];
test("no cambió webhook ni nodos OCR/DeepSeek", () => {
  assert.equal(workflow.nodes.length, 18);
  assert.equal(named("Webhook — endodb index.html").parameters.path, "endodb/process-exam-directus-v3");
  assert.ok(named("SSH — OCRmyPDF Ubuntu").credentials.sshPassword);
  assert.ok(named("DeepSeek — Chat Completions").credentials.deepSeekApi);
  assert.equal(Object.keys(workflow.connections).length, 17);
  assert.match(named("CONFIG — BD Endoscopia v3").parameters.jsCode, /\$vars\.ENDODB_DIRECTUS_TOKEN/);
});
for (const c of scenarios) test(c.label, () => {
  const output = qc(c.t, !!c.structured, { entubacion_cecal:true }, { entubacion_cecal:true });
  assert.equal(output.value, c.value);
  if (c.point) assert.equal(output.point, c.point);
  if (c.reason) assert.equal(output.reason, c.reason);
  if (c.label.includes("Dante")) assert.ok(output.warnings.length);
});
test("todos los nodos Code mantienen sintaxis JS", () => {
  const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
  for (const node of workflow.nodes.filter(n => n.type === "n8n-nodes-base.code"))
    assert.doesNotThrow(() => new AsyncFunction(node.parameters.jsCode), node.name);
});
