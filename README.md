# EndoDB · despliegue Next.js + Directus

**Servidor único:** el `Dockerfile` compila Next.js y ejecuta `node server.js` en el puerto 3000. Next.js sirve `public/index.html`, `public/viewer.html` y `public/stats.html`, además de la API. No seleccionar una imagen Nginx, publicación estática ni GitHub Pages. Se eliminaron `nginx.conf.template`, `CNAME` y las copias HTML de la raíz para impedir que una configuración anterior parezca funcional.

El navegador consulta **únicamente** `/api/locations` y `/api/studies` para leer datos. No hay proxy arbitrario a Directus. Las rutas `/api/directus/*`, `/api/calidad/*`, `/api/registro/*` y `/nc/*` responden 410 cuando llegan a esta aplicación. La ingesta continúa en el webhook n8n actual; este cambio no modifica el flujo ni las colecciones.

## Configuración exacta en Coolify

1. Crear o editar la aplicación que atiende `endodb.drperez86.com`, origen GitHub `Rafamaro/Base-de-datos-endoscopia`, rama que se vaya a desplegar después del merge, directorio raíz `/`, **build pack Dockerfile**, ruta `Dockerfile`. No seleccionar Nixpacks, servidor estático ni Docker Compose antiguo.
2. Puerto interno del contenedor: `3000`. Asociar **solo esta aplicación** al dominio `https://endodb.drperez86.com`. La comprobación de salud es `GET /api/health` en el puerto 3000; no verifica Directus, porque su indisponibilidad no debe reiniciar Next.js.
3. Variables **de ejecución**, nunca `NEXT_PUBLIC_*`: `DIRECTUS_URL=https://directus.drperez86.com`, `DIRECTUS_TOKEN=<token de solo lectura>`, `ENDODB_RELEASE=<SHA o etiqueta del despliegue>`. Configurar el token como secreto en Coolify. No incluirlo en repositorio, parámetros de URL, HTML ni logs. `ENDODB_PUBLIC_URL` es opcional y actualmente no afecta el enrutamiento.
4. El token debe leer `bd_sedes`, `bd_estudios`, sus campos visibles (`/fields/bd_sedes` y `/fields/bd_estudios`) y la relación `bd_estudios.sede` (`/relations/bd_estudios`). Los campos opcionales se solicitan solo si existen. No conceder lectura de `bd_pacientes`, `bd_ingestas`, `raw_ai_json` o `exam_id`, ni escritura o administración. Un fallo de permisos se informa como error; no se amplían políticas para ocultarlo.
5. Desplegar el commit de esta PR y confirmar en Coolify el SHA efectivo, puerto, logs de arranque y salud interna. Una PR abierta no despliega la aplicación por sí sola.

## Configuración exacta en Cloudflare

1. En **DNS** y **Tunnels → Public Hostnames**, comprobar cuál ruta atiende `endodb.drperez86.com`. Debe apuntar al proxy de Coolify para esa única aplicación o al servicio HTTP de Next.js en el puerto 3000; no apuntar al contenedor Nginx/Nextcloud previo. Evitar dos rutas que compitan por el mismo hostname.
2. En **Workers & Pages → Workers Routes / Custom Domains**, revisar coincidencias `endodb.drperez86.com/*` y `*.drperez86.com/*`. Desasociar o adaptar cualquier Worker que devuelva la API antigua, incluidas rutas `/api/*` y `/nc/*`. No basta con cambiar DNS si un Worker intercepta las solicitudes. Revisar Redirects, Transform, Cache y Origin Rules que alteren esas rutas; desactivar caché para `/api/*` y los HTML.
3. Mantener **Cloudflare Access** delante del hostname completo y sus rutas API. Una sesión no autenticada puede recibir 302 hacia Access; eso no prueba el estado del origen. Si se usa un service token de Access para la verificación, permitirlo explícitamente en la política de la aplicación. No abrir las rutas clínicas al público para hacer una prueba.
4. Comparar `/api/health` desde la red interna contra el servicio Coolify en el puerto 3000 y desde el dominio con la misma sesión/política de Access. Si el origen muestra `X-EndoDB-Runtime: nextjs-directus` y el dominio no, revisar Worker, reglas, túnel y caché. Si ambos muestran la respuesta antigua, Coolify sigue ejecutando el servicio anterior.

## Verificación reproducible

```bash
npm ci
npm test
npm run build
npm run start
```

En otra terminal, con un Directus real configurado:

```bash
ENDODB_BASE_URL=http://localhost:3000 npm run check:deployment
ENDODB_BASE_URL=https://endodb.drperez86.com npm run check:deployment
```

El script consulta `/api/health`, `/api/diagnostics/directus`, `/api/locations`, `/api/studies?limit=1&page=1` y la ruta antigua `/api/calidad/rows`. No usa registros simulados. Si Cloudflare Access requiere un service token, definir `CF_ACCESS_CLIENT_ID` y `CF_ACCESS_CLIENT_SECRET` como variables locales; el script las envía solo en headers y no imprime ni guarda su valor. También se puede verificar con `curl -i` desde una sesión autenticada.

Resultado esperado: salud 200 con `runtime: nextjs`, `dataSource: directus`, `release` y header `X-EndoDB-Runtime: nextjs-directus`; diagnóstico 200 con las dos colecciones verificadas; sedes y estudios 200 con `data` arreglo; ruta antigua 410 con `LEGACY_ROUTE_REMOVED`. Abrir luego `/`, `/index.html`, `/viewer.html` y `/stats.html`. El HTML raíz redirige a `/index.html`.

| Señal | Causa probable / comprobación siguiente |
| --- | --- |
| Texto `Use /api/(calidad\|registro)/(columns\|rows)` o `/nc/tables` | Backend antiguo; comparar origen Coolify y dominio. |
| Origen Next.js correcto, dominio distinto | Intercepción de Worker/túnel/regla/caché; sin comparar ambos lados no se puede atribuir inequívocamente a un Worker. |
| 302 a `cloudflareaccess.com` | Falta sesión o política de service token en Cloudflare Access. |
| `NEXT_ROUTE_NOT_FOUND` y marca Next.js | Ruta Next.js inexistente. |
| `DIRECTUS_CONFIGURATION_ERROR` | Faltan variables de ejecución en Coolify. |
| `DIRECTUS_CONNECTION_ERROR` | DNS, TLS o red entre contenedor y Directus. |
| `DIRECTUS_ACCESS_DENIED` | Token expirado o permisos insuficientes; Directus puede ocultar colecciones sin permiso. |
| `DIRECTUS_COLLECTION_NOT_FOUND` | Colección/ruta ausente; con políticas que ocultan recursos, comprobar también permisos. |
| `DIRECTUS_SCHEMA_MISMATCH` | Campo o relación incompatible; revisar la colección indicada en el diagnóstico. |
| 404 sin marca `X-EndoDB-Runtime` | El servidor esperado no atendió la petición; revisar Cloudflare y Coolify. |

Las respuestas de error nunca incluyen el cuerpo bruto de Directus, el token ni filas de `bd_pacientes`. El viewer y las estadísticas solo reciben las variables clínicas de `STUDY_FIELDS`; mantienen VEDA/VCC y paginación. La protección de acceso a datos clínicos depende además de Cloudflare Access y de bloquear el acceso directo al origen.

## Compatibilidad de la ingesta existente

La selección de la pantalla de carga proviene de `bd_sedes` y envía el UUID como `sede_id` al webhook. El JSON de flujo v3 suministrado no consume ese parámetro ni escribe `bd_estudios.sede`: todavía escribe `lugar_estudio` en el modelo anterior. Este PR no modifica n8n ni rellena sedes de forma ficticia. Antes de usar cargas nuevas, adaptar el flujo para validar que el UUID pertenece a la organización autorizada y guardar `bd_ingestas.sede` y `bd_estudios.sede` por cada procedimiento real. Hasta entonces, la relación de sede de los estudios nuevos no quedará vinculada por ese flujo. Los estudios anteriores con `sede = null` aparecen como «No informado»; no se infiere una sede a partir del antiguo `lugar_estudio`.

## Agregar sedes desde la pantalla de carga

El botón **Agregar sede** abre un formulario de nombre, código y dirección opcional. `POST /api/locations` verifica la firma, emisor y audiencia del JWT de Cloudflare Access, exige un correo administrador configurado, comprueba el origen de la solicitud y consulta duplicados dentro de la organización. El servidor fija `activo = true` y `organizacion` desde su configuración; nunca acepta esos campos del navegador. Después del alta, vuelve a leer `bd_sedes` y selecciona la sede. Si el token de lectura no puede verla, avisa que fue creada para evitar intentos duplicados.

Configurar en Coolify como **secretos de ejecución**: `ENDODB_ACCESS_TEAM_DOMAIN` (URL `https://<equipo>.cloudflareaccess.com`), `ENDODB_ACCESS_AUD` (AUD de la aplicación Access de EndoDB), `ENDODB_SITE_ADMIN_EMAILS` (lista de correos autorizados, separada por comas), `ENDODB_ORGANIZATION_ID` (UUID existente en `bd_organizaciones`) y `ENDODB_SITE_WRITE_TOKEN` (token separado, con permiso de **crear exclusivamente** en `bd_sedes` dentro de esa organización). Mantener `DIRECTUS_TOKEN` limitado a lectura, incluidos los campos `codigo`, `activo`, `organizacion` e `id` de `bd_sedes`. El token de escritura debe tener un preset/restricción de organización en Directus además de la validación de la aplicación. No usar un token administrador general.

Hasta que estén configuradas estas variables, el formulario responde con un error de configuración y no crea registros. En la inspección actual no se devolvieron organizaciones en `bd_organizaciones`; se necesita una organización real antes de habilitar el alta. Esta función añade sedes al selector de la aplicación; la vinculación de cada estudio con su sede **sigue dependiendo de actualizar el flujo n8n** descrito arriba.

En la inspección del esquema se verificó que `bd_sedes` existe, pero la credencial de inspección no devolvió sedes y una muestra de estudios existentes tenía `sede = null`. El token de Coolify no estaba disponible en el entorno local, por lo que la lectura efectiva de `/fields` y `/relations` con esa identidad debe comprobarse con `/api/diagnostics/directus` tras desplegar.
