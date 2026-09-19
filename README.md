# Embat Flow: salud financiera y decisiones de tesorería

El proyecto analiza movimientos bancarios y facturas para explicar la salud de
una empresa, proyectar su evolución, aplicar una política de financiación y
proponer revisiones de tesorería. La nota de salud no es una probabilidad de
impago ni una aprobación automática.

## Por dónde empezar

| Si quieres…                                        | Lee…                                                                                         |
| -------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Orientarte en la documentación                     | [Mapa de docs/](./docs/README.md)                                                            |
| Entender o explicar el producto a un cliente       | [Guía de módulos](./docs/product/modules-guide.md)                                           |
| Saber qué significa cada métrica                   | [Guía de métricas de scoring](./docs/engines/scoring-metrics.md)                             |
| Revisar el cálculo observado                       | [Motor de scoring](./docs/engines/scoring-engine.md)                                         |
| Comprender las previsiones y el modo sombra        | [Motor de forecast](./docs/engines/forecast-engine.md)                                       |
| Entender una oferta y sus controles                | [Motor de decisión](./docs/engines/decision-engine.md)                                       |
| Explicar recomendaciones y escenarios recuperables | [Playbook de tesorería](./docs/engines/treasury-playbook.md)                                 |
| Preparar una presentación                          | [Guion de demo](./docs/demo/README.md) y [casos](./docs/demo/use_cases/README.md)            |
| Consultar reglas y diferencias pendientes          | [SOURCE](./docs/product/SOURCE.md) y [auditoría](./docs/product/documentation-audit.md) |

Las especificaciones anteriores se conservan en [docs/history](./docs/history/README.md).
Las convenciones técnicas están en [AGENTS.md](./AGENTS.md) y el objetivo de
producto en [PRODUCT.md](./PRODUCT.md).

## Uso rápido

Necesitas Node 22, Corepack y Git LFS instalados. El setup comprueba las
herramientas, instala dependencias y prepara Prisma; no instala Node ni una
base de datos. Ejecuta desde la raíz:

```bash
git lfs install
git lfs pull
# Solo si todavía no tienes .env:
cp -n .env.example .env
# Completa DATABASE_URL, BETTER_AUTH_SECRET y BETTER_AUTH_URL en .env.
bash scripts/setup.sh
corepack pnpm pipeline:eval
```

El pipeline calcula scoring, forecast, decisión y submission con parámetros
congelados y escribe archivos locales. No necesita Python ni una conexión a
PostgreSQL para esos cálculos. Para ver la cartera, importa después el run en
una base con el esquema preparado, siguiendo las instrucciones de abajo:

```bash
corepack pnpm dev
```

La app usa Next.js 16, React 19, TypeScript 7, Prisma 7/PostgreSQL, TanStack
Query, Tailwind, shadcn/ui y Better Auth. Visita `/cartera` y la ficha de
empresa desde la cartera. Sin un run compatible importado, el panel no
sustituye los resultados por datos ficticios.

## Scripts

| Script                    | Qué hace                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                | Servidor de desarrollo (Turbopack)                                    |
| `pnpm build`              | Build de producción (standalone)                                      |
| `pnpm start`              | Sirve el build de producción                                          |
| `pnpm test`               | Tests (`node --test`, sin framework extra)                            |
| `pnpm db:setup`           | Aplica Prisma contra Neon e importa el scoring si hace falta          |
| `pnpm db:setup:force`     | Recalcula e importa el scoring aunque ya exista una ejecución         |
| `pnpm helmcode:check`     | Comprueba la API key de Helmcode (lista modelos + chat de prueba)     |
| `pnpm run lint`           | [oxlint](https://oxc.rs) (no ESLint, ver `AGENTS.md`)                 |
| `pnpm run lint:fix`       | oxlint con `--fix`                                                    |
| `pnpm run format`         | Prettier (con orden de clases de Tailwind)                            |
| `pnpm run typecheck`      | `tsc --noEmit`                                                        |
| `pnpm run knip`           | Detecta código y dependencias muertas                                 |
| `pnpm export:submission`  | Exporta `submission.csv` y `submission.jsonl` desde un run compatible |
| `pnpm pipeline:eval`      | Ejecuta inferencia congelada completa y genera la submission          |
| `pnpm prisma:seed`        | Seed de la base de datos (`prisma/seed.ts`)                           |
| `pnpm run auth:generate`  | Regenera `prisma/schema/auth.prisma` tras tocar `lib/core/auth.ts`    |
| `pnpm run rename-project` | Sustituye el nombre placeholder por el nombre real                    |

## Recalibración y backtests: trabajo opcional

La ejecución normal usa `corepack pnpm pipeline:eval`. Solo necesitas recalibrar
si quieres estudiar otra configuración. Los backtests comprueban resultados
contra observaciones posteriores o grupos reservados; no forman parte de la
submission por defecto.

Para recalibrar, usa una carpeta nueva y rutas de parámetros locales. No apuntes
estos comandos de ajuste a los ficheros congelados que quieras conservar:

```bash
export SCORING_OUT="tmp/recalibracion-$(date +%Y%m%d-%H%M%S)"
export SCORING_PARAMS="$SCORING_OUT/parameters.json"
export FORECAST_PARAMS="$SCORING_OUT/forecast-parameters.json"

corepack pnpm scoring:fit
corepack pnpm scoring:score
corepack pnpm forecast:fit
corepack pnpm forecast:run
corepack pnpm scoring:decide
corepack pnpm scoring:backtest
corepack pnpm forecast:backtest
```

Estos pasos trabajan en archivos y no requieren PostgreSQL. La ingesta se
rehace automáticamente si falta, está dañada o cambian los metadatos de entrada.
Usa el mismo directorio y parámetros durante toda la secuencia.

La importación se ejecuta por separado con `corepack pnpm scoring:import`:
escribe en PostgreSQL y materializa las vistas del panel. `scoring:snapshot`
rematerializa un run ya importado. El detalle de las métricas se explica en los
documentos de scoring, forecast y decisión.

## Ejecución reproducible y submission

La ejecución actual trabaja sobre el dataset incluido y usa los parámetros y
resultados de calibración precalculados en
[`artifacts/inference/scoreSolo-holding-v7/`](./artifacts/inference/scoreSolo-holding-v7/),
sin recalibrar durante el scoring. Un contrato, hash o versión incompatible
sigue siendo un error para evitar mezclar artefactos. El mismo flujo queda
preparado para recibir otro dataset, pero no necesita un entorno Python para
ejecutar scoring, forecast, decisión o exportación.

### Preparar el entorno

Se necesitan Node 22, Corepack y Git LFS. El gestor del proyecto es pnpm.
Desde la raíz del repositorio:

```bash
git lfs install
git lfs pull
corepack pnpm install --frozen-lockfile
```

También se puede preparar todo con el script reproducible:

```bash
bash scripts/setup.sh
```

El script comprueba Node y Corepack; deben estar instalados previamente. Usa la
versión de pnpm fijada en `package.json`, instala las
dependencias con el lockfile y genera el cliente Prisma. No conecta con la
base de datos ni cambia tablas; la configuración de base de datos se hace en
`.env`. Si `.env` todavía no existe, omite `prisma generate`; créalo en la
sección siguiente y vuelve a ejecutar `corepack pnpm prisma generate`.

El script deja varias versiones de pnpm disponibles mediante Corepack. Sus
órdenes `corepack install --global` también pueden cambiar la versión preferida
fuera de este repositorio; dentro manda `packageManager`. El proyecto usa
la versión declarada en `package.json` (`10.28.1`) y una versión secundaria
(`12.4.2` por defecto) puede utilizarse explícitamente sin cambiar la global:

```bash
corepack pnpm --version                 # 10.28.1 dentro de este proyecto
corepack pnpm@12.4.2 --version          # versión secundaria
corepack pnpm test
```

Si Corepack necesita descargar una versión, la máquina debe poder resolver
`registry.npmjs.org`. El script no ejecuta `pnpm` global directamente para
evitar que otra versión intente autoactualizarse o revalidar el lockfile.

### Configurar y comprobar Neon

Si todavía no tienes `.env`, copia el fichero de ejemplo y completa las variables locales. `.env` está
ignorado por Git y no debe compartirse:

```bash
cp -n .env.example .env
# Edita .env y pega la DATABASE_URL pooled de Neon.
# Genera también un secreto local para Better Auth:
openssl rand -base64 32
```

La URL debe incluir `sslmode=require` y `channel_binding=require`. Comprueba la
conectividad con una consulta de solo lectura:

```bash
set -a
. ./.env
set +a
psql "$DATABASE_URL" -X -v ON_ERROR_STOP=1 -Atqc 'select 1'
```

Después de cambiar el esquema, vuelve a generar el cliente con:

```bash
corepack pnpm prisma generate
```

### Validación completa sin escribir en Neon

Estas comprobaciones no modifican la base de datos:

```bash
corepack pnpm test
corepack pnpm run typecheck
corepack pnpm run lint
corepack pnpm build
export SCORING_OUT="tmp/scoring-check-$(date +%Y%m%d-%H%M%S)"
export SUBMISSION_OUT="$SCORING_OUT/submission"
corepack pnpm pipeline:eval
```

El último comando ejecuta ingesta, scoring, forecast, decisión y exportación
con los parámetros congelados, escribiendo únicamente en `tmp/`.

### Cargar el resultado precalculado en Prisma

Cuando la base ya tiene el esquema, se puede importar el run local sin
recalibrar ni ejecutar `db push`:

```bash
# En la misma terminal, conserva SCORING_OUT del paso anterior.
# En otra terminal, exporta la ruta del directorio donde generaste el run.
SCORING_PARAMS=artifacts/inference/scoreSolo-holding-v7/parameters.json \
FORECAST_PARAMS=artifacts/inference/scoreSolo-holding-v7/forecast-parameters.json \
corepack pnpm scoring:import
```

Comprueba las filas importadas con una consulta de solo lectura:

```bash
psql "$DATABASE_URL" -X -P pager=off -c "
SELECT
  (SELECT count(*) FROM score_runs) AS runs,
  (SELECT count(*) FROM company_month_scores) AS scores,
  (SELECT count(*) FROM company_month_forecasts) AS forecasts,
  (SELECT count(*) FROM company_month_decisions) AS decisions;
"
```

Para una base de desarrollo desechable, `corepack pnpm db:setup` aplica el
esquema y ejecuta todo el pipeline antes de importar. Incluye
`prisma db push --accept-data-loss`, por lo que puede reemplazar columnas o
datos existentes; no lo uses sobre una base compartida sin copia o aprobación.

La configuración mínima de Better Auth incluye `BETTER_AUTH_SECRET` y
`BETTER_AUTH_URL` (por ejemplo, `http://localhost:3000` en desarrollo).
`psql` es un cliente opcional para las comprobaciones SQL; el setup no lo instala.

Con datos importados, arranca la aplicación y revisa las rutas de cartera:

```bash
corepack pnpm dev
```

Consulta `/cartera`, `/empresa`, `/api/scoring/companies` y
`/api/scoring/runs/[runId]`. La interfaz usa el último run compatible de
Prisma; si la base está vacía, las rutas de scoring no tendrán filas que
mostrar.

### Regenerar categorías (opcional)

El runtime no depende de Python. Solo hace falta instalar Python 3.12 y las
dependencias de `analysis/` si se quiere recalcular la reclasificación de
categorías y rehacer la calibración desde los CSV:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r analysis/requirements.txt
.venv/bin/python analysis/08_categories.py
.venv/bin/python analysis/09_export_categories.py
```

El script de setup también lo automatiza con `bash scripts/setup.sh --with-categories`.
Esta opción es de análisis y no forma parte de la ejecución
normal ni de la submission precalculada.

### Ejecutar la evaluación y exportar

`pipeline:eval` ejecuta, sin invocar pnpm de forma recursiva, la secuencia
`autoingest → score → forecast → decisión → submission`. El forecast se
calcula siempre. Los parámetros incluidos mantienen Solo y Grupo en **modo
sombra**, sin efecto en decisión. La regla de conexión compara MAE y acierto de
banda; actualmente se calcula en ajuste, mientras el backtest reservado es un
informe separado. Véase [la limitación documentada](./docs/engines/forecast-engine.md#6-conexión-con-decisión-estado-real).

```bash
pnpm pipeline:eval
```

La salida por defecto es `output/submission.csv` y
`output/submission.jsonl`. Incluye score autónomo y de grupo, estados,
alertas, inflexiones, previsiones a tres meses, decisión, límite, plazo, TAE y
producto sugerido por RCA. Los valores ausentes son celdas vacías en CSV y
`null` en JSONL.

Se pueden usar rutas distintas sin editar el código:

```bash
SCORING_DATASET=/ruta/dataset \
SCORING_OUT=/ruta/run-inferencia \
SCORING_PARAMS=/ruta/parameters.json \
FORECAST_PARAMS=/ruta/forecast-parameters.json \
SUBMISSION_OUT=/ruta/output \
pnpm pipeline:eval
```

Si falta `ingest.json`, está corrupto o su fingerprint no coincide, el pipeline
reingesta automáticamente. Las empresas sin movimientos conservan sus filas
`sin_datos` y decisiones `cerrar`; ningún fallo global deja una submission
parcial porque los dos ficheros se escriben de forma atómica.

Para generar solo una submission desde un run ya calculado:

```bash
SCORING_OUT=/ruta/run \
SCORING_PARAMS=/ruta/parameters.json \
pnpm export:submission
```

El script imprime dos resúmenes: **corte final** (última fila de cada empresa,
incluida la suma de `LVigente`) e **histórico** (empresa-mes, donde la suma de
límites es exposición mensual acumulada), además de versiones, hashes, número
de empresas/meses y rutas absolutas. Septiembre de 2026 sigue excluido de
calibración y validación.

`corepack pnpm db:setup` es un bootstrap para una base de desarrollo:
aplica `prisma db push --accept-data-loss` y, si no encuentra un run completo
materializado, recalibra, ejecuta backtests e importa. No es el pipeline
congelado. La comprobación de existencia de ese script tampoco sustituye los
controles de compatibilidad del panel. Para una base existente con el esquema
correcto, importa el run precalculado con el comando anterior.

Las APIs de consulta incluyen `/api/scoring/companies`,
`/api/scoring/companies/[companyId]`, `/api/scoring/runs/[runId]` y
`/api/scoring/export`. Una versión explícita incompatible se rechaza con 409.

## Inferencia LLM con Helmcode (sponsor)

[Helmcode](https://helmcode.com) nos da inferencia OpenAI-compatible en la UE
(`deepseek-v4-flash` y `glm5.3`, 1M de contexto; también `qwen3.6`, `gemma4`,
`qwen3-embedding`, `rerank`, `whisper`, `kokoro`). Límites por key: 100 rpm,
5–10 peticiones concurrentes, 2M tokens/min.

### La key

**El repo es público: la key nunca va en el código ni en Git.** Se reparte por
canal privado y cada uno la pega en su `.env` local (ignorado por Git):

```bash
# .env
HELMCODE_API_KEY="sk-hke_..."           # la que te han pasado
HELMCODE_BASE_URL="https://api.helmcode.com/v1"
HELMCODE_MODEL="deepseek-v4-flash"
```

Reglas:

- No usar prefijo `NEXT_PUBLIC_`: la key solo se lee en servidor (Server
  Components, Route Handlers, Server Actions, scripts). El cliente
  `lib/integrations/helmcode.ts` importa `server-only` y rompe el build si se
  importa desde un Client Component.
- No pegarla en issues, PRs, capturas ni en el prompt de un agente de IA.
- Si se filtra, revocarla y crear otra en la consola
  (<https://cloud.helmcode.com/> → API Keys). Las keys son del workspace, no
  personales.
- En despliegue (Vercel/Docker/etc.) va como variable de entorno del servidor,
  igual que `DATABASE_URL`.

Comprobar que funciona: `pnpm helmcode:check`.

### Uso desde código

```ts
import { ask, chat } from "@/lib/integrations/helmcode";

// System + user en una llamada
const { content } = await ask("Resume este balance en dos frases", "Eres analista de riesgo.");

// Conversación completa con opciones
const result = await chat(
  [
    {
      role: "system",
      content: "Devuelve solo JSON con { riesgo: 'bajo'|'medio'|'alto', motivo: string }",
    },
    { role: "user", content: JSON.stringify(companyMetrics) },
  ],
  { model: "glm5.3", reasoningEffort: "medium", json: true, maxTokens: 300 },
);
const parsed = mySchema.parse(JSON.parse(result.content)); // valida siempre con zod
```

`chat` devuelve `{ content, reasoning?, model, finishReason?, usage? }`.
Errores HTTP llegan como `HelmcodeError` con `status` (401 key inválida, 402
sin plan/créditos, 429 rate limit). `isHelmcodeConfigured()` sirve para
degradar la feature si falta la key en lugar de romper la página.

Cualquier SDK OpenAI también funciona apuntando `baseURL` a
`process.env.HELMCODE_BASE_URL` y `apiKey` a `process.env.HELMCODE_API_KEY`.
Docs: [integraciones](https://helmcode.com/docs/integrations) ·
[modelos](https://helmcode.com/docs/models) ·
[rate limits](https://helmcode.com/docs/rate-limits).

## Herencia de la plantilla: crear otro proyecto

Esta sección se conserva para quien reutilice la base técnica. No forma parte
de la instalación ni de la ejecución de Embat Flow.

### Paso 0 (una sola vez): publicar esta plantilla en GitHub

Ya tienes un repo git local con un commit inicial (`git log` para
comprobarlo). Súbelo y márcalo como _template repository_ para poder usar
"Use this template" en cada proyecto nuevo. Dos formas, según tengas o no
[GitHub CLI](https://cli.github.com) instalado:

**Sin GitHub CLI (solo `git`, funciona siempre):**

1. Crea un repo vacío en <https://github.com/new> (sin README ni
   `.gitignore` — ya los tenemos) llamado, por ejemplo, `plantilla-nextjs`.
2. Conéctalo y súbelo:
   ```bash
   git remote add origin https://github.com/<tu-usuario>/plantilla-nextjs.git
   git push -u origin main
   ```
3. En GitHub: **Settings → General → Template repository** → marca la casilla.

**Con GitHub CLI** (instálalo antes con `winget install --id GitHub.cli -e`
y autentícate con `gh auth login`):

```bash
gh repo create plantilla-nextjs --private --source=. --push
gh api repos/{owner}/{repo} -X PATCH -f is_template=true
```

### Por cada proyecto nuevo

1. Copia la plantilla:
   - **Con template marcado en GitHub:** botón "Use this template" en la
     página del repo → nombre del repo nuevo → `git clone` del repo creado.
   - **Con GitHub CLI:**
     `gh repo create mi-proyecto --template <tu-usuario>/plantilla-nextjs --private --clone`.
   - **Sin GitHub:** copia la carpeta a mano y borra `.git` (`rm -rf .git && git init`).
2. Renombra el placeholder: `pnpm run rename-project -- "Mi Proyecto"`.
3. Rellena [PRODUCT.md](./PRODUCT.md) con el problema, los usuarios y el
   flujo core de este proyecto en concreto.
4. `pnpm install`, copia `.env.example` → `.env` con tus credenciales reales,
   `pnpm prisma generate`.
5. Abre el repo con tu agente de IA (Claude Code) y pídele que construya,
   apoyándose en `AGENTS.md` (cómo) + `PRODUCT.md` (qué). Recomendado: pídele
   primero que entre en modo plan para la arquitectura inicial antes de
   generar código.

## Estructura

```
app/                   rutas, layouts, API routes
  api/auth/[...all]/    handler catch-all de Better Auth
  api/tasks/route.ts    ejemplo de API route con validación zod
  sign-in/, sign-up/    formularios de referencia de Better Auth
  tasks/                ejemplo de página SSR con prefetch + HydrationBoundary
components/ui/         componentes shadcn/ui (generados, no editar a mano)
lib/core/               infraestructura: db.ts, react-query.ts, utils.ts (cn),
                        auth.ts (servidor), auth-client.ts (React)
lib/features/tasks/     ejemplo de patrón por-feature (queries + hooks)
lib/integrations/       clientes de APIs de terceros (helmcode.ts, solo servidor)
prisma/schema/          un archivo .prisma por dominio (auth.prisma generado
                        por `pnpm run auth:generate`, no editar a mano)
prisma/seed.ts          seed de desarrollo
scripts/                scripts de mantenimiento (tests, rename-project)
tools/oxlint/           plugin de lint propio (anti-slop), ver AGENTS.md
.agents/skills/         guía de rendimiento React/Next.js vendorizada (ver AGENTS.md)
```

## Despliegue

`Dockerfile` incluido (build standalone de Next.js + Prisma). `.github/workflows/ci.yml`
corre lint, typecheck y tests en cada push/PR — sin paso de deploy, porque eso
depende de la infraestructura de cada proyecto (Vercel, Coolify, VPS, etc.).
