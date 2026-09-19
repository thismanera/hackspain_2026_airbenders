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

| Script                    | Qué hace                                                           |
| ------------------------- | ------------------------------------------------------------------ |
| `pnpm dev`                | Servidor de desarrollo (Turbopack)                                 |
| `pnpm build`              | Build de producción (standalone)                                   |
| `pnpm start`              | Sirve el build de producción                                       |
| `pnpm test`               | Tests (`node --test`, sin framework extra)                         |
| `pnpm db:setup`           | Arranca Postgres, aplica Prisma e importa el scoring si hace falta |
| `pnpm db:setup:force`     | Recalcula e importa el scoring aunque ya exista una ejecución      |
| `pnpm db:up`              | Arranca el Postgres local conservando sus datos                    |
| `pnpm db:down`            | Detiene Postgres; el volumen y sus datos se conservan              |
| `pnpm run lint`           | [oxlint](https://oxc.rs) (no ESLint, ver `AGENTS.md`)              |
| `pnpm run lint:fix`       | oxlint con `--fix`                                                 |
| `pnpm run format`         | Prettier (con orden de clases de Tailwind)                         |
| `pnpm run typecheck`      | `tsc --noEmit`                                                     |
| `pnpm run knip`           | Detecta código y dependencias muertas                              |
| `pnpm prisma:seed`        | Seed de la base de datos (`prisma/seed.ts`)                        |
| `pnpm run auth:generate`  | Regenera `prisma/schema/auth.prisma` tras tocar `lib/core/auth.ts` |
| `pnpm run rename-project` | Sustituye el nombre placeholder por el nombre real                 |

## Motor de scoring v1 y decisión

Con PostgreSQL activo, los CSV en `dataset/` y (opcional) el CSV de
categorías reclasificadas generado con
`.venv\Scripts\python.exe analysis\08_categories.py && .venv\Scripts\python.exe analysis\09_export_categories.py`
(deja `analysis/transaction_categories.csv`, que la ingesta recoge sola si
existe):

```bash
pnpm scoring:fit        # ingest por grupo, € y percentiles congelados
pnpm scoring:score      # company_month_score (docs/scoring-engine.md §10)
pnpm scoring:decide     # decisión legacy sobre las filas del score (docs/decision-engine.md)
pnpm scoring:backtest   # lead time, recall, falsas alarmas sobre validación
pnpm scoring:import     # Postgres
```

Los cinco comandos son secuenciales: cada uno lee la salida del anterior en
`tmp/scoring-v1/`. La primera ejecución (o cualquiera después de tocar los
CSV) necesita `SCORING_REINGEST=1 pnpm scoring:fit`, que releva los 472 MB de
`transactions.csv` y tarda unos minutos; las siguientes reutilizan las
particiones ya escritas. Variables de entorno útiles: `SCORING_DATASET`,
`SCORING_OUT`, `SCORING_CATEGORIES` y `SCORING_PARAMS`.

Los scripts se ejecutan con **Node 22**. Si usas [fnm](https://github.com/Schniz/fnm),
`fnm use 22` antes de lanzarlos (o `fnm exec --using=22 pnpm scoring:fit`).

Normalmente basta con `pnpm db:setup`. Salida en `/api/scoring/companies`
(`rows[].score` y `rows[].decision`), `/api/scoring/companies/[companyId]`,
`/api/scoring/runs/[runId]` y `/api/scoring/export`. Lógica y decisiones en
[docs/SOURCE.md](./docs/SOURCE.md),
[docs/scoring-engine.md](./docs/scoring-engine.md) y
[docs/decision-engine.md](./docs/decision-engine.md).

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
