# EndoDB

EndoDB es la base de datos de endoscopia del repositorio `Rafamaro/Base-de-datos-endoscopia`. La migración actual mantiene los HTML heredados en `public/` y agrega una capa Next.js server-side para consultar Directus de forma controlada.

## Requisitos

- Node.js 20
- npm

## Instalación local

```bash
npm ci
```

## Ejecución en desarrollo

```bash
npm run dev
```

Luego abrir:

- `http://localhost:3000/`
- `http://localhost:3000/index.html`
- `http://localhost:3000/viewer.html`
- `http://localhost:3000/stats.html`
- `http://localhost:3000/api/health`
- `http://localhost:3000/api/diagnostics/directus`
- `http://localhost:3000/api/locations`
- `http://localhost:3000/api/studies`

La ruta `/` redirige del lado servidor a `/index.html`.

## Variables de entorno

Configurar en el servidor, sin prefijo `NEXT_PUBLIC_`:

```env
DIRECTUS_URL=https://directus.drperez86.com
DIRECTUS_TOKEN=<TOKEN_DE_LECTURA_ENDODB>
ENDODB_PUBLIC_URL=https://endodb.drperez86.com
```

`DIRECTUS_URL` y `DIRECTUS_TOKEN` son variables server-only. No deben exponerse en HTML, JavaScript cliente, respuestas JSON, logs, headers ni `next.config.mjs`.

El token de Directus debe pertenecer a un rol de solo lectura con acceso únicamente a:

- `bd_estudios`
- `bd_ingestas`
- `bd_lugares`

El rol no debe tener acceso a:

- `bd_pacientes`
- colecciones de sistema de Directus
- operaciones de escritura
- operaciones de eliminación
- administración de schema

## Endpoints

Todos los endpoints devuelven `Cache-Control: no-store` y no exponen credenciales.

### `GET /api/health`

Endpoint local de salud de la aplicación Next.js.

```bash
curl -i http://localhost:3000/api/health
```

### `GET /api/diagnostics/directus`

Valida la configuración server-side y consulta como máximo un registro de `bd_lugares` solicitando solo `id,codigo,nombre`. La respuesta indica si Directus está alcanzable y si se recibió una muestra, sin devolver el registro completo.

```bash
curl -i http://localhost:3000/api/diagnostics/directus
```

### `GET /api/locations`

Consulta exclusivamente `bd_lugares`, filtra `activo = true`, ordena por `orden,nombre` y devuelve hasta 100 registros normalizados. Solo retorna:

- `id`
- `codigo`
- `nombre`
- `nombre_corto`
- `tipo`
- `orden`

```bash
curl -i http://localhost:3000/api/locations
```

### `GET /api/studies`

Consulta exclusivamente `bd_estudios` con filtros construidos en el servidor. Parámetros aceptados:

- `limit`: entero entre 1 y 500; default 100
- `page`: entero positivo; default 1
- `procedure_type`: `VEDA` o `VCC`
- `location_id`: entero positivo
- `year`: entero entre 2000 y el año actual + 1
- `requires_review`: `true` o `false`

Ejemplos:

```bash
curl -i 'http://localhost:3000/api/studies?limit=50&page=1'
curl -i 'http://localhost:3000/api/studies?procedure_type=VCC&year=2026&requires_review=false'
curl -i 'http://localhost:3000/api/studies?location_id=1'
```

Campos solicitados a Directus para estudios:

- `id`
- `numero_en_archivo`
- `exam_id`
- `legacy_row_id`
- `procedure_type`
- `fecha_estudio`
- `entubacion_cecal`
- `boston_total`
- `boston_derecho`
- `boston_transverso`
- `boston_izquierdo`
- `polipos`
- `tipo_preparacion`
- `preparacion_texto`
- `requiere_revision`
- `observaciones`
- `created_at`
- `updated_at`
- `lugar_fuente`
- `lugar_estudio.id`
- `lugar_estudio.codigo`
- `lugar_estudio.nombre`
- `lugar_estudio.nombre_corto`
- `ingesta.id`
- `ingesta.source_file_name`
- `ingesta.source_file_kind`
- `ingesta.status`

Campos expresamente excluidos de estudios:

- `paciente`
- `raw_ai_json`
- cualquier campo de `bd_pacientes`
- `llego_a_ciego`
- `llego_a_ileon`
- `indicacion`
- `source_file_name` directamente en `bd_estudios`

No existe un proxy genérico a Directus ni endpoints de escritura.

## Compilación

```bash
npm run build
```

La configuración de Next.js usa `output: "standalone"` para generar una salida adecuada para despliegue en contenedor.

## Tests

```bash
npm test
```

Las pruebas unitarias cubren validaciones de filtros, normalización de estudios y allowlist de colecciones sin llamar a Directus.

## Ejecución de producción

Con Next.js estándar:

```bash
npm run start
```

Con la salida standalone después de compilar:

```bash
npm run start:standalone
```

## HTML existentes

Los archivos heredados se sirven desde `public/`:

- `public/index.html`
- `public/viewer.html`
- `public/stats.html`

Las páginas mantienen sus formularios, navegación y referencias de recursos actuales. En esta etapa no se modifican `public/viewer.html` ni `public/stats.html`.

## Docker

Construir la imagen:

```bash
docker build -t endodb:next .
```

Ejecutar el contenedor:

```bash
docker run --rm -p 3000:3000 \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e DIRECTUS_URL=https://directus.drperez86.com \
  -e DIRECTUS_TOKEN=<TOKEN_DE_LECTURA_ENDODB> \
  -e ENDODB_PUBLIC_URL=https://endodb.drperez86.com \
  endodb:next
```

Verificar:

```bash
curl -i http://localhost:3000/
curl -i http://localhost:3000/index.html
curl -i http://localhost:3000/viewer.html
curl -i http://localhost:3000/stats.html
curl -i http://localhost:3000/api/health
curl -i http://localhost:3000/api/diagnostics/directus
curl -i http://localhost:3000/api/locations
curl -i http://localhost:3000/api/studies
```
