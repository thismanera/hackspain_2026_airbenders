# Plantilla Next.js

Plantilla base para arrancar proyectos: Next.js 16 (App Router), Prisma 7
(Postgres, carpeta `prisma/schema/`), Tailwind 4, TanStack Query 5 (con SSR
avanzado), TypeScript 7, UI [shadcn/ui](https://ui.shadcn.com) y autenticación
con [Better Auth](https://better-auth.com).

Para las convenciones técnicas (qué patrones seguir, cómo se organiza `lib/`,
cómo añadir una feature) ve a [AGENTS.md](./AGENTS.md). Para el flujo de "usar
esta plantilla en un proyecto nuevo", sigue leyendo.

## Uso rápido

```bash
git lfs install
git lfs pull
pnpm install
pnpm db:setup
pnpm dev
```

`pnpm db:setup` crea `.env` si falta, levanta PostgreSQL, aplica el esquema
Prisma y carga el dataset del motor de scoring. Es idempotente: si ya existe
una ejecución completa, conserva el volumen y no vuelve a procesar los CSV.
Cada compañero ejecuta el mismo comando después de clonar el repositorio; no
se comparte ni se versiona un contenedor o volumen de Docker.

Abre [http://localhost:3000](http://localhost:3000) (sign in/up con Better
Auth) y [http://localhost:3000/tasks](http://localhost:3000/tasks) (ejemplo
end-to-end de Prisma + API route + TanStack Query con prefetch SSR).

## Scripts

| Script                    | Qué hace                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `pnpm dev`                | Servidor de desarrollo (Turbopack)                                    |
| `pnpm build`              | Build de producción (standalone)                                      |
| `pnpm start`              | Sirve el build de producción                                          |
| `pnpm test`               | Tests (`node --test`, sin framework extra)                            |
| `pnpm db:setup`           | Arranca Postgres, aplica Prisma e importa el scoring si hace falta    |
| `pnpm db:setup:force`     | Recalcula e importa el scoring aunque ya exista una ejecución         |
| `pnpm db:up`              | Arranca el Postgres local conservando sus datos                       |
| `pnpm db:down`            | Detiene Postgres; el volumen y sus datos se conservan                 |
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

## Motor de scoring v1 y decisión (recalibración opcional)

Con PostgreSQL activo y los CSV en `dataset/`, el scoring funciona con las
categorías del dataset y los parámetros precalculados. El CSV opcional de
categorías reclasificadas se puede generar con Python (ver la sección de
regeneración), pero no forma parte del runtime. Estos comandos solo son para
recalibrar manualmente; para ejecutar la versión congelada usa
`pnpm pipeline:eval`:

```bash
pnpm scoring:fit        # ingest por grupo, € y percentiles congelados
pnpm scoring:score      # company_month_score (docs/scoring-engine.md §10)
pnpm scoring:decide     # motor de decisión v1 (docs/decision-engine.md)
pnpm scoring:backtest   # lead time, recall y falsas alarmas para scoreSolo y scoreGrupo, más métricas de decisión
pnpm scoring:import     # Postgres
```

`scoring:decide` corre el motor v1 entero sobre `scores.jsonl`: elegibilidad por
seis puertas, límite y plazo máximo, menú de opciones (plazo, cantidad, TAE),
estado mes a mes con histéresis y reapertura, y techo de grupo con cross-default
(decide un grupo completo de una vez). Escribe `decisions.jsonl` y
`decision-parameters.json` (la versión del motor de decisión) en el directorio de
la ejecución. `scoring:backtest` añade a `backtest.json` un bloque `decision` con
las métricas del jurado (§14): exposición evitada, ingresos simulados,
oscilación, cierres falsos y lead time de cierre.

Los cinco comandos son secuenciales: cada uno lee la salida del anterior en
`tmp/scoring-v1/`. La primera ejecución (o cualquiera después de tocar los
CSV) necesita `SCORING_REINGEST=1 pnpm scoring:fit`, que releva los 472 MB de
`transactions.csv` y tarda unos minutos; las siguientes reutilizan las
particiones ya escritas. Variables de entorno útiles: `SCORING_DATASET`,
`SCORING_OUT`, `SCORING_CATEGORIES` y `SCORING_PARAMS`.

Los scripts se ejecutan con **Node 22**. Si usas [fnm](https://github.com/Schniz/fnm),
`fnm use 22` antes de lanzarlos (o `fnm exec --using=22 pnpm scoring:fit`).

## Ejecución reproducible y submission

La ejecución actual trabaja sobre el dataset incluido y usa los parámetros y
resultados de calibración precalculados en
[`artifacts/inference/scoreSolo-holding-v7/`](./artifacts/inference/scoreSolo-holding-v7/),
sin recalibrar durante el scoring. Un contrato, hash o versión incompatible
sigue siendo un error para evitar mezclar artefactos. El mismo flujo queda
preparado para recibir otro dataset, pero no necesita un entorno Python para
ejecutar scoring, forecast, decisión o exportación.

### Preparar el entorno

Se necesitan Node 22 y pnpm. Desde la raíz del repositorio:

```bash
git lfs install
git lfs pull
pnpm install
```

También se puede preparar todo con el script reproducible:

```bash
bash scripts/setup.sh
```

El script conserva varias versiones de pnpm mediante Corepack. El proyecto usa
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
calcula siempre; si sus métricas no superan el baseline queda marcado como
**modo sombra** y no modifica la decisión.

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

`pnpm db:setup` aplica el esquema con `prisma db push --accept-data-loss`:
recrea las tablas de score y elimina las columnas antiguas.

Normalmente basta con `pnpm db:setup`. Salida en `/api/scoring/companies`
(`rows[].scoreSolo` y `rows[].decision`), `/api/scoring/companies/[companyId]`,
`/api/scoring/runs/[runId]` y `/api/scoring/export`. Lógica y decisiones en
[docs/SOURCE.md](./docs/SOURCE.md),
[docs/scoring-engine.md](./docs/scoring-engine.md) y
[docs/decision-engine.md](./docs/decision-engine.md).

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

## Flujo recomendado para un proyecto nuevo

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
