# Base de datos endoscopia

## Endpoints relativos esperados

La webapp está preparada para hosting estático/GitHub Pages y no incluye secretos en el frontend. Las páginas `viewer.html` y `stats.html` esperan que un backend/proxy seguro (por ejemplo Cloudflare Worker detrás de control de acceso) exponga endpoints relativos que consulten Directus con las credenciales del servidor, nunca desde el navegador.

Endpoints sugeridos:

- `/api/directus/bd_estudios`
- `/api/directus/bd_vcc_calidad`
- `/api/directus/bd_identificaciones` (solo con control de acceso; puede responder `403`)
- `/api/directus/bd_endoscopistas`
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

El frontend acepta PDF, TXT y JSON. El workflow V2 realiza segmentación, anonimización local y extracción con DeepSeek. La identidad se extrae desde el archivo o el nombre del archivo; no se debe escribir DNI/nombre manualmente en notas.

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
