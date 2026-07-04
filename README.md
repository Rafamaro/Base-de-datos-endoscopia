# Base de datos endoscopia

Frontend estático para cargar informes endoscópicos hacia n8n y consultar variables clínicas expuestas por un proxy seguro de Directus.

## Schema Directus “solo Rafa”

La base ya no maneja múltiples endoscopistas: todos los estudios pertenecen implícitamente al Dr. Rafael Pérez. Por eso el frontend y la documentación no piden, muestran ni consultan campos de endoscopista, y el flujo de extracción no debe emitir motivos de revisión por endoscopista no detectado.

El tiempo de retirada en VCC es un dato documental explícito de `bd_vcc_calidad`; no se calcula desde horarios o duración del estudio y no se consulta desde `bd_estudios`. Si el informe no lo menciona, queda como no informado y sin minutos/texto.

Campos de tiempo de retirada en `bd_vcc_calidad`:

- `tiempo_retirada_informado`: booleano. `true` solo si el informe menciona explícitamente el tiempo de retirada.
- `tiempo_retirada_minutos`: entero nullable. Minutos reportados explícitamente; no inferir ni calcular.
- `tiempo_retirada_texto`: texto nullable. Frase original o texto soporte del informe.

Reglas de extracción:

- No calcular tiempo de retirada a partir de hora de ingreso/salida ni duración total.
- No usar horarios de salida o campos similares como sustitutos del tiempo de retirada.
- Si el informe dice `tiempo de retirada: 8 minutos`, guardar `tiempo_retirada_informado = true`, `tiempo_retirada_minutos = 8` y `tiempo_retirada_texto = "tiempo de retirada: 8 minutos"`.
- Si el informe dice `retirada mayor a 6 minutos` sin número exacto reportable, guardar `tiempo_retirada_informado = true`, `tiempo_retirada_minutos = null` y `tiempo_retirada_texto = "retirada mayor a 6 minutos"`.
- Si no se menciona, guardar `tiempo_retirada_informado = false`, `tiempo_retirada_minutos = null` y `tiempo_retirada_texto = null`.

## Endpoints relativos esperados

La webapp está preparada para hosting estático/GitHub Pages y no incluye secretos en el frontend. Las páginas `viewer.html` y `stats.html` esperan que un backend/proxy seguro (por ejemplo Cloudflare Worker detrás de control de acceso) exponga endpoints relativos que consulten Directus con las credenciales del servidor, nunca desde el navegador.

Endpoints sugeridos:

- `/api/directus/bd_estudios`
- `/api/directus/bd_vcc_calidad`
- `/api/directus/bd_identificaciones` (solo con control de acceso; puede responder `403`)
- `/api/directus/bd_lugares`
- `/api/directus/bd_ingestas`
- `/api/directus/bd_ingesta_items`
- `/api/directus/bd_revisiones`

Cada endpoint puede responder un array directo o un objeto con `data`, `rows` o `items`.

## Carga n8n V2

`index.html` envía `multipart/form-data` al webhook V2 `https://n8n.drperez86.com/webhook/endodb/process-exam-directus-v2` con:

- `file`
- `client_filename`
- `exam_id`
- `notes` solo si existen

El frontend acepta PDF, TXT y JSON. El workflow V2 realiza segmentación, anonimización local y extracción con DeepSeek. La identidad se extrae desde el archivo o el nombre del archivo; no se debe escribir DNI/nombre manualmente en notas. En el schema “solo Rafa” no se extrae ni se muestra endoscopista.

## CORS para hosting estático

Este repositorio no incluye Cloudflare Pages Functions, Worker, API routes ni backend propio para crear un proxy same-origin. Por eso el frontend mantiene la llamada directa al webhook n8n V2 y n8n debe responder el preflight `OPTIONS` y el `POST` con headers CORS.

En n8n debe existir un webhook `OPTIONS` para:

`/webhook/endodb/process-exam-directus-v2`

con estos headers:

```http
Access-Control-Allow-Origin: https://endodb.drperez86.com
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type
Access-Control-Max-Age: 86400
```

El `POST` del webhook V2 también debe devolver `Access-Control-Allow-Origin: https://endodb.drperez86.com` para que el navegador permita leer la respuesta JSON.
