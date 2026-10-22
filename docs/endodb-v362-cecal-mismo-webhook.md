# BD Endoscopia v3.6.2 — Corrección puntual intubación cecal

**Base:** workflow original v3.6.2 de la biblioteca, con 18 nodos, OCRmyPDF por SSH, credenciales SSH y DeepSeek conservadas.

**Webhook INALTERADO:** POST `endodb/process-exam-directus-v3`. No se modifica `public/index.html`, ni sus opciones de carga o URL.

## Cambios exclusivamente en extracción/guardado de intubación cecal

- La narración del avance prevalece sobre una casilla `CIEGO: SI` errónea.
- Si solo se llegó al ángulo esplénico, se guarda `entubacion_cecal=false`, `punto_maximo_alcanzado=angulo_esplenico`, y la causa si se documentó.
- Llegada explícita al ciego/íleon = `true`; sin documentación = `null`, no `false`.
- La contradicción narrativa se clasifica `null` y revisión obligatoria.
- Se registran fuente y advertencias en `raw_ai_json.qc_cecal` sin datos identificatorios, y `requiere_revision` cuando corresponda.
- VEDA conserva intubación cecal como `null` (no aplica).
- Se ajustaron solo las instrucciones del prompt de DeepSeek relativas a ciego.
- Seguridad: se quitó del JSON exportable un token Directus literal expuesto en versiones previas, sustituyéndolo por la variable **ya utilizada** de n8n `$vars.ENDODB_DIRECTUS_TOKEN`. Confirmar que está definida antes de activar.

## Uso en n8n
1. Guardar/exportar copia del flujo activo para poder revertir.
2. Importar **solo** `workflows/endodb_v362_cecal_corregido_mismo_webhook.json` y comprobar que se asignaron las credenciales preexistentes «SSH Password account» y «DeepSeek account».
3. Confirmar variable preexistente `ENDODB_DIRECTUS_TOKEN`; **no copiar tokens dentro del nodo**. Usar permiso para colecciones bd necesarias.
4. Desactivar el workflow antiguo que posee `endodb/process-exam-directus-v3` y activar el reemplazo. n8n no permite dos workflows activos con el mismo webhook/path + method; no cambiar la URL del formulario.
5. Enviar por la página archivos clínicos anonimizados de prueba, comprobar VCC incompleta/cecal documentada y verificar filas en `bd_estudios`. Revertir al flujo anterior en caso de falla.

## Pruebas
`node --test tests/cecal-v362-workflow.test.mjs` valida 11 escenarios clínicos, la ruta webhook, las conexiones SSH/DeepSeek y sintaxis JavaScript de cada nodo Code.

**Pendiente antes de considerar verificado en producción:** prueba completa real n8n→Directus con PDF escaneado y JSON ENDORA. Las pruebas unitarias NO validan credenciales activas, acceso a directorios Ubuntu ni respuesta real de Directus. Esta rama no se despliega automáticamente.
