# EndoDB

EndoDB es la base de datos de endoscopia del repositorio `Rafamaro/Base-de-datos-endoscopia`. En esta primera etapa de migración, el proyecto pasa de ser un frontend HTML estático servido por nginx a una aplicación Next.js mínima con App Router y salida `standalone` para contenedores.

Las páginas HTML existentes todavía no se reescriben en React: se sirven temporalmente desde `public/` para conservar su comportamiento actual mientras se prepara la futura capa backend.

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

La ruta `/` redirige del lado servidor a `/index.html`.

## Compilación

```bash
npm run build
```

La configuración de Next.js usa `output: "standalone"` para generar una salida adecuada para despliegue en contenedor.

## Ejecución de producción

Con Next.js estándar:

```bash
npm run start
```

Con la salida standalone después de compilar:

```bash
npm run start:standalone
```

## Endpoint de salud

`GET /api/health` responde JSON sin caché:

```json
{
  "ok": true,
  "service": "endodb",
  "runtime": "nextjs",
  "timestamp": "ISO_DATE"
}
```

Prueba local:

```bash
curl -i http://localhost:3000/api/health
```

## HTML existentes

Los archivos heredados se sirven desde `public/`:

- `public/index.html`
- `public/viewer.html`
- `public/stats.html`

Las páginas mantienen sus formularios, navegación, consultas actuales y referencias de recursos compatibles con el repositorio. `index.html` continúa enviando archivos directamente al webhook n8n existente. `viewer.html` y `stats.html` continúan intentando consultar `/api/directus/...`; en esta etapa aún no se implementa el proxy/capa backend hacia Directus, por lo que esas consultas pueden fallar hasta una etapa posterior.

## Variables de entorno

`.env.example` documenta las variables previstas para etapas posteriores:

```env
DIRECTUS_URL=https://directus.example.com
DIRECTUS_TOKEN=<SECRET>
ENDODB_PUBLIC_URL=https://endodb.example.com
```

En despliegues de Coolify, estas variables deben configurarse exclusivamente como variables de entorno de runtime del servicio/contenedor, no como build arguments:

```env
DIRECTUS_URL=https://directus.drperez86.com
DIRECTUS_TOKEN=<TOKEN_REAL>
ENDODB_PUBLIC_URL=https://endodb.drperez86.com
```

No deben copiarse al `Dockerfile`, no deben guardarse en GitHub, no deben configurarse como argumentos de build y no deben tener prefijo `NEXT_PUBLIC_`. El build Docker no necesita conocer credenciales de Directus; el código server-side debe leer `DIRECTUS_URL` y `DIRECTUS_TOKEN` desde `process.env` únicamente durante la ejecución.

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
  endodb:next
```

Verificar:

```bash
curl -i http://localhost:3000/
curl -i http://localhost:3000/index.html
curl -i http://localhost:3000/viewer.html
curl -i http://localhost:3000/stats.html
curl -i http://localhost:3000/api/health
```
