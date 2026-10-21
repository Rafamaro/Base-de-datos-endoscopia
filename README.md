# EndoDB · Directus

Este repositorio sirve `index.html` (carga), `viewer.html` (consulta) y `stats.html` (indicadores) desde Next.js. El navegador consulta `/api/locations` y `/api/studies`; el token de lectura de Directus permanece en el servidor. Los archivos se envían al webhook n8n, que separa identidad y datos clínicos antes de llamar a DeepSeek.

## Requisitos y ejecución

Node.js 20+, las colecciones `bd_lugares`, `bd_estudios`, `bd_ingestas` y `bd_pacientes` del esquema actual, y un flujo n8n configurado. Las versiones del esquema de Directus deben incluir los campos de VCC incompleta usados por `/api/studies`.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

En `.env.local`, reemplazá `DIRECTUS_TOKEN` por un token de **solo lectura** de `bd_lugares` (`id,codigo,nombre,nombre_corto,tipo,activo,orden`) y `bd_estudios` (los campos clínicos de `lib/endodb/studies.js`, con expansión de `lugar_estudio`). No concedas lectura de `bd_pacientes`, `bd_ingestas`, `raw_ai_json`, `exam_id`, `observaciones` ni escrituras. `DIRECTUS_URL` apunta a `https://directus.drperez86.com`; nunca uses `NEXT_PUBLIC_` para secretos.

Abrí `http://localhost:3000/index.html`, `/viewer.html` o `/stats.html`. El contenedor `Dockerfile` ejecuta Next.js con los mismos valores de entorno. El sitio **requiere un servidor Next.js**: una publicación estática en GitHub Pages no puede responder a `/api/*`. `nginx.conf.template` del despliegue antiguo no forma parte del contenedor.

## Rutas de lectura

- `GET /api/locations`: sedes activas ordenadas por `orden,nombre`.
- `GET /api/studies?limit=500&page=1`: página de estudios; acepta además `procedure_type`, `location_id`, `year` y `requires_review`. El navegador solicita las páginas sucesivas y calcula los indicadores con el conjunto completo.
- `GET /api/diagnostics/directus`: verifica la conexión sin devolver filas.
- `GET /api/health`: salud local de Next.js.

La API pública devuelve solo el conjunto clínico definido en `STUDY_FIELDS`. Omite `paciente`, nombres de archivo, `exam_id`, `legacy_row_id`, texto libre, JSON crudo de IA y relaciones privadas. No ofrece escritura ni proxy genérico. Sigue exponiendo variables clínicas y fechas; antes de usar datos de pacientes en una instalación accesible desde Internet, configurá autenticación y permisos de lectura por usuario o en el proxy de acceso. El esquema actual **no tiene todavía aislamiento multiusuario por organización**.

## Ingesta n8n

`workflows/endodb_directus_v3.json` es una copia de trabajo del flujo V3 adjunto, preparada para importar en n8n. Conserva el webhook `endodb/process-exam-directus-v3`, la separación local de identidad y la llamada a DeepSeek. La versión incluye:

- `lugar_codigo` en entradas binarias y de texto; verifica una sede activa por código antes de escribir.
- `bd_ingestas.lugar_estudio` y `bd_estudios.lugar_estudio`, con `lugar_fuente=frontend`.
- Detención antes de DeepSeek si la comprobación local encuentra identificadores residuales.

Tras importar, seleccioná la credencial DeepSeek del nodo HTTP Request y configurá el token Directus en el nodo CONFIG (o trasladalo a una credencial n8n antes de activar). El JSON del repositorio solo contiene el marcador de posición; no guardes tokens reales en Git. La detección automática de PII no garantiza anonimización perfecta: revisá el flujo con documentos de prueba y mantené la salida privada. El OCR de imágenes/PDF escaneados debe ser local o propio antes de pasar texto a DeepSeek. Importar el archivo **no actualiza ni activa** el flujo actualmente en producción.

## Verificación

```bash
npm test
npm run build
```

Para probar la integración real, configurá Directus y verificá `/api/diagnostics/directus`, `/api/locations` y varias páginas de `/api/studies`. Luego ejecutá un informe sintético VEDA+VCC por el webhook y confirmá dos registros con la misma ingesta y sede en Directus. No uses datos de pacientes para pruebas.
