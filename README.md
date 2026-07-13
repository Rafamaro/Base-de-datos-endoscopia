# Base de datos endoscopia

Frontend estático para cargar informes endoscópicos hacia n8n y consultar en Directus un modelo mínimo de conteo VEDA/VCC y métricas básicas de calidad de VCC.

Incluye HTML/CSS/JS simple y una configuración nginx mínima para exponer un proxy seguro de lectura hacia Directus cuando se despliega con el Dockerfile. No se deben publicar secretos en el frontend.

## Flujo de carga

`index.html` mantiene la carga directa al webhook de n8n:

`https://n8n.drperez86.com/webhook/endodb/process-exam-directus-v3`

Este endpoint corresponde al flujo n8n V3 “BD Endoscopia v3 — Directus + DeepSeek — mínimo anonimizado” (`endodb/process-exam-directus-v3`).

La página envía `multipart/form-data` con:

- `file`: archivo PDF, TXT, JSON, CSS o FOTO/imagen.
- `document_text` / `ocr_text`: texto OCR/manual opcional para pruebas de FOTO o PDF escaneado cuando todavía no está configurado OCR local en n8n.
- `client_filename`: nombre del archivo fuente.
- `exam_id`: UUID generado por el navegador.
- `notes`: notas internas opcionales.

n8n recibe el archivo, procesa PDF/TXT/JSON/CSS/FOTO, separa PII en `bd_pacientes`, crea `bd_ingestas`, anonimiza el texto antes de DeepSeek y guarda los estudios en `bd_estudios`.

## Modelo Directus mínimo

El frontend solo consulta estas colecciones mediante endpoints relativos expuestos por un proxy seguro:

- `/api/directus/bd_estudios`
- `/api/directus/bd_lugares`

`bd_ingestas` representa un archivo subido/procesado. `bd_estudios` representa cada procedimiento real detectado dentro del archivo.

Si un archivo contiene solo VEDA, se espera una fila VEDA. Si contiene solo VCC, se espera una fila VCC. Si contiene VEDA + VCC, n8n debe crear dos filas en `bd_estudios`: una VEDA y una VCC; el viewer las mostrará como dos registros separados.

Campos esperados en `bd_estudios`:

- `id`
- `ingesta`
- `exam_id`
- `source_file_name`
- `procedure_type`: `VEDA`, `VCC`, `OTRO` o `INDETERMINADO`
- `fecha_estudio`
- `lugar_estudio`
- `indicacion`
- `llego_a_ciego` o `entubacion_cecal`
- `llego_a_ileon`
- `boston_total`
- `boston_derecho`
- `boston_transverso`
- `boston_izquierdo`
- `polipos`
- `tipo_preparacion`
- `created_at`

Las respuestas de los endpoints pueden ser un array directo o un objeto con `data`, `rows` o `items`.

## Reglas de visualización

- VEDA solo se cuenta como procedimiento realizado; las métricas de VCC se muestran como `No aplica`.
- VCC muestra llegada a ciego, llegada a íleon, Boston total/segmentario y pólipos.
- Si `llego_a_ileon` es verdadero, se considera que también llegó a ciego aunque el campo de ciego venga vacío o falso.
- Boston adecuado significa `boston_total >= 6` y cada segmento (`derecho`, `transverso`, `izquierdo`) `>= 2`.
- `lugar_estudio` se muestra tal como llega desde Directus. La inferencia de lugar la resuelve n8n: lunes suele ser Santa Isabel; otros días, principalmente viernes, Sanatorio de la Providencia; si el informe trae un lugar explícito confiable, n8n puede usarlo.

## Páginas

- `index.html`: carga archivos al webhook n8n y resume la respuesta de procesamiento.
- `viewer.html`: consulta solo `/api/directus/bd_estudios` y muestra una tabla filtrable.
- `stats.html`: calcula estadísticas y resumen mensual usando solo `/api/directus/bd_estudios`.

## Proxy Directus seguro

El contenedor nginx expone únicamente:

- `/api/directus/bd_estudios`
- `/api/directus/bd_lugares`

Estas rutas se traducen internamente a `${DIRECTUS_URL}/items/<coleccion>`. `DIRECTUS_URL` tiene valor por defecto `https://directus.drperez86.com` y `DIRECTUS_TOKEN` debe configurarse como variable de entorno del servidor/contenedor. El token se inyecta solo en nginx mediante el header `Authorization` y nunca aparece en `viewer.html` ni `stats.html`. Cualquier otra colección bajo `/api/directus/`, incluyendo `bd_pacientes`, responde 403. El proxy además fuerza/restringe una lista de campos públicos para evitar que el navegador pida datos identificatorios o metadatos sensibles.

Ejemplo de prueba:

```txt
/api/directus/bd_estudios?limit=1
/api/directus/bd_lugares?fields=id,codigo,nombre,nombre_corto,activo,orden&filter[activo][_eq]=true&sort[]=orden
```

## CORS

Como la carga al webhook es directa desde el navegador, n8n debe responder `OPTIONS` y `POST` con headers CORS apropiados para el dominio público del frontend.
