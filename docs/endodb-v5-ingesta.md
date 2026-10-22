# EndoDB v5 — Puente de carga seguro

Se agrega **solo en una rama**, sin alterar el webhook actual en n8n ni Directus, la ruta `POST /api/ingest`.
El navegador ya no conoce la URL de n8n ni el secreto compartido. El backend valida firma, emisor,
audiencia y vigencia de Cloudflare Access, y la membresía activa en `bd_membresias` para la
organización y sede solicitadas. Recién entonces envía el archivo al webhook nuevo, único permitido,
`endodb/process-exam-directus-v5-nuevo`.

## Prerrequisitos (Coolify)

- `ENDODB_V5_WEBHOOK_URL=https://n8n.drperez86.com/webhook/endodb/process-exam-directus-v5-nuevo`
- `ENDODB_WEBHOOK_SHARED_SECRET`: misma cadena aleatoria (al menos 24 caracteres) que `$vars.ENDODB_WEBHOOK_SHARED_SECRET` en n8n.
- `ENDODB_INGEST_AUTH_TOKEN`: lectura de `bd_sedes(id,activo,organizacion)`, `bd_membresias(id,activo,sede,organizacion,usuario.email)`, y correo relacionado de usuarios.
- `ENDODB_ORGANIZATION_ID`: organización real; misma que `$vars.ENDODB_ORGANIZATION_ID` en n8n.
- `DIRECTUS_URL`, `ENDODB_PUBLIC_URL`, `ENDODB_ACCESS_TEAM_DOMAIN`, `ENDODB_ACCESS_AUD`: ya utilizadas/explicadas en el repositorio.

El servidor aplica límite de 25 MiB, verifica extensión y tipo multipart, permite únicamente el
hostname n8n.drperez86.com y nunca imprime JWT, tokens, texto OCR ni contenido bruto.

## Workflow independiente

Importar manualmente `EndoDB_v5_NUEVO_ingesta_segura.json` en n8n, dejarlo **inactivo** hasta
validar la credencial DeepSeek existente y el OCR SSH; no sustituir v3/v4.1 automáticamente.
El workflow requiere las variables de n8n `ENDODB_DIRECTUS_TOKEN`, `ENDODB_ORGANIZATION_ID`,
`ENDODB_WEBHOOK_SHARED_SECRET` (opcional `ENDODB_DIRECTUS_URL`, `ENDODB_DEEPSEEK_MODEL`).
Necesita directorios compartidos `/data/ocr/{entrada,salida}` y `/usr/local/bin/ocrpdf`,
`tesseract` en Ubuntu; si n8n 2.x restringe discos, declarar
`N8N_RESTRICT_FILE_ACCESS_TO=/data/ocr`.

## Validación y límites

`npm test` ejecuta los tests de la ruta cuando esta rama esté descargada.
Se han incluido pruebas para JWT ausente/manipulado, membresía inexistente, sede inválida
y secreto solo backend. Falta ejecución real E2E con n8n y Directus, por lo que **no mergear
sin verificar las credenciales, las variables y el acceso del contenedor al OCR**.
Los errores o incertidumbres clínicas se derivan a revisión y no se sobrescriben históricos.
