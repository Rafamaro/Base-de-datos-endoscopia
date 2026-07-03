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

## Carga n8n

`index.html` envía `multipart/form-data` al webhook `https://n8n.drperez86.com/webhook/endodb/process-exam-directus` con:

- `file`
- `client_filename`
- `exam_id`
- `patient_code` solo si el usuario lo completa
- `notes` solo si existen

El frontend acepta PDF, TXT y JSON. La clasificación VEDA/VCC y la extracción/anonimización de identidad quedan a cargo del flujo n8n `Flujo_BD_Endoscopia_Directus_DeepSeek_Anonimizacion`.
