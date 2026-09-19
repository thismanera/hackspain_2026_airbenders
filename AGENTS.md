# AGENTS.md

Convenciones de este proyecto para cualquier agente de IA (Claude Code, Cursor,
Copilot, Gemini...) o humano que vaya a escribir código aquí. Es la fuente de
verdad tool-agnostic; `CLAUDE.md` solo apunta aquí para evitar duplicar reglas.

> Antes de pedirle a un agente que "construya el proyecto", rellena
> [`PRODUCT.md`](./PRODUCT.md) con el problema, los usuarios y el flujo core.
> Este archivo (`AGENTS.md`) explica **cómo** construir; `PRODUCT.md` explica
> **qué** construir.

## Stack

Next.js 16 (App Router), React 19, TypeScript 7, Prisma 7 (Postgres),
TanStack Query 5, Tailwind 4, UI con [shadcn/ui](https://ui.shadcn.com),
autenticación con [Better Auth](https://better-auth.com), estado de query
params con [nuqs](https://nuqs.dev). Gestor de paquetes: **pnpm** (no uses
npm/yarn, el lockfile es `pnpm-lock.yaml`).

## Estructura del proyecto

- `app/` — rutas, layouts, API routes.
- `lib/core/` — infraestructura transversal: `db.ts` (singleton de Prisma),
  `react-query.ts` (`getQueryClient`, patrón SSR), `utils.ts` (`cn` desde `cnfast`).
- `lib/features/<feature>/` — lógica colocada por feature (`types.ts`,
  `queries.ts`, `hooks.ts`). Es el patrón por defecto para código nuevo.
- `prisma/schema/` — un archivo `.prisma` por dominio (no un `schema.prisma`
  único). `main.prisma` solo tiene el bloque `generator`/`datasource`.
- `components/ui/` — componentes shadcn/ui generados. No los edites a mano
  salvo necesidad real; añade nuevos con `pnpm dlx shadcn add <componente>`.
- `dataset/` — los nueve ficheros del reto, en Git LFS. Solo lectura.
- `analysis/` — análisis de datos en Python, independiente del stack de Next.
  Ver la sección de abajo.

Referencia viva del patrón completo (Prisma + TanStack Query SSR + nuqs +
Suspense) en modelo `Task`:
[`prisma/schema/tasks.prisma`](./prisma/schema/tasks.prisma) +
[`app/api/tasks/route.ts`](./app/api/tasks/route.ts) +
[`lib/features/tasks/`](./lib/features/tasks/) +
[`app/tasks/page.tsx`](./app/tasks/page.tsx) +
[`app/tasks/tasks-client.tsx`](./app/tasks/tasks-client.tsx).

## Reglas críticas

- **Next.js 16 async APIs:** siempre `await` `cookies()`, `headers()`,
  `draftMode()`, `props.params` y `props.searchParams`.
- **Estado y datos:** evita `useEffect` (ver sección de rendimiento más abajo).
  Usa TanStack Query para todo fetching/caching, no `useState` + `useEffect` a mano.
- **SSR + TanStack Query:** para páginas que necesitan datos al cargar, sigue
  el patrón de `app/tasks/page.tsx` — `getQueryClient()` +
  `prefetchQuery` + `<HydrationBoundary>`, con el mismo `queryKey` que el hook
  cliente usa. Ver la [guía oficial de SSR avanzado](https://tanstack.com/query/latest/docs/framework/react/guides/advanced-ssr).
- **UI:** usa solo componentes shadcn/ui (`components/ui`), nunca `@base-ui/react`
  directamente (es la librería de primitivas que usa el preset `base-nova`, el
  default actual de shadcn). Prefiere `gap` con flex/grid antes que `space-y`/`space-x`.
- **`Button` con `render`:** al pasar un elemento que no es un `<button>` real
  (p. ej. `<Button render={<Link href="..." />}>`), añade también
  `nativeButton={false}` — si no, Base UI avisa en consola de que rompe la
  semántica nativa del botón (ver `app/page.tsx`).
- **CSS de Base UI:** `body` ya tiene `isolation: isolate` (contexto de
  apilamiento propio para que los popups — Dialog, Popover, Tooltip, Toast —
  queden siempre por encima, sin pelearse con el `z-index` del resto de la
  página) y `position: relative` (necesario para los backdrops en iOS 26+
  Safari) en `app/globals.css`, tal como recomienda la
  [guía oficial de Base UI](https://base-ui.com/react/overview/quick-start).
  No los quites.
- **Toaster:** `<Toaster />` va montado como hermano de `{children}`, no
  envolviéndolo — es un componente de renderizado (portal), no un context
  provider que necesite envolver el árbol (ver `app/providers.tsx` y la
  [doc del componente Toast](https://ui.shadcn.com/docs/components/base/toast)).
- **Clases condicionales:** usa `cn` de `@/lib/core/utils` (re-exporta
  `cnfast`), no concatenación manual ni `clsx` directo.
- **TypeScript:** evita `enum` (usa const maps / union types). Prefiere
  `function` declarativa en vez de `const fn = () =>` para funciones de nivel
  superior. Importa siempre con el alias `@/*`.
- **Prisma:** nunca instancies `PrismaClient` fuera de `lib/core/db.ts` —
  importa el singleton `prisma` desde ahí. Tipos del cliente generado en
  `@/generated/prisma/client`. Añade modelos nuevos como archivo propio en
  `prisma/schema/<dominio>.prisma`, nunca amontonados en `main.prisma`.
- **Validación:** valida el body de cualquier API route con `zod` (ver
  `app/api/tasks/route.ts`).

## Rendimiento y patrones de React/Next.js

Guía completa (45 reglas con ejemplos, de Vercel Engineering) vendorizada en
[`.agents/skills/vercel-react-best-practices/`](./.agents/skills/vercel-react-best-practices/SKILL.md)
— consúltala antes de escribir fetching de datos, componentes con estado, o
cualquier código sensible a rendimiento. Resumen de lo más importante:

- **Evita `useEffect`** salvo para sincronizar con un sistema externo real
  (DOM, `localStorage`, una suscripción externa). Antes de escribir uno, lee
  ["You Might Not Need an Effect"](https://react.dev/learn/you-might-not-need-an-effect).
  Fetching de datos → TanStack Query, nunca `useState` + `useEffect` a mano.
- **Evita re-renders innecesarios:** `useState(() => calcularCaro())` (lazy
  init) para valores caros de calcular; `setX((prev) => ...)` funcional para
  callbacks estables; deriva estado en el render (`const isEmpty = items.length === 0`)
  en vez de guardarlo en otro `useState` sincronizado a mano; no suscribas un
  componente a estado que solo lees dentro de un callback/evento.
- **Next.js 16 / Server Components:** paraleliza fetches independientes
  (`Promise.all`, no `await` en cadena de cosas que no dependen entre sí),
  usa `React.cache()` para deduplicar dentro del mismo request, streamea
  secciones lentas con `<Suspense>` en vez de bloquear toda la página con un
  `await` al principio del Server Component.
- **Bundle:** `next/dynamic` para componentes pesados que no son above-the-fold;
  importa símbolos directos (`import { Button } from "lib/x"`, no barrels
  `index.ts` que reexportan todo); difiere analytics/scripts de terceros a
  después de la hidratación.
- **TanStack Query:** sigue el patrón de `lib/features/tasks/` — query key
  factory tipada, `staleTime`/`gcTime` explícitos por endpoint, e invalidación
  específica en el `onSuccess` de cada mutación (`invalidateQueries({ queryKey: [...] })`
  con la key concreta, no una invalidación global sin key).

## Parámetros de búsqueda en la URL (nuqs)

Para cualquier estado que deba sobrevivir a un refresh o ser compartible por
URL (filtros, búsqueda, paginación, pestaña activa) usa **nuqs**, no
`useState`. `<NuqsAdapter>` ya envuelve la app en `app/layout.tsx`.

- Define los parsers **una sola vez** por feature, en un archivo
  `search-params.ts` que se importa tanto desde el servidor como desde el
  cliente (ver [`lib/features/tasks/search-params.ts`](./lib/features/tasks/search-params.ts)):
  ```ts
  import { createLoader, parseAsString } from "nuqs/server";

  export const tasksSearchParams = { q: parseAsString.withDefault("") };
  export const loadTasksSearchParams = createLoader(tasksSearchParams);
  ```
- **Server Component** (`page.tsx`): `await loadTasksSearchParams(searchParams)`
  y úsalo para el `prefetchQuery` — el `queryKey` de TanStack Query debe
  incluir el valor (`["tasks", q]`), igual que en `lib/features/tasks/queries.ts`.
- **Client Component**: `useQueryStates(tasksSearchParams)` de `"nuqs"` (no
  `"nuqs/server"`) — mismo objeto de parsers, así servidor y cliente nunca se
  desincronizan.
- Envuelve en `<Suspense>` el Client Component que lee el estado de nuqs
  dentro de un Server Component que ya hizo `await` de los `searchParams`
  (ver `app/tasks/page.tsx`) — es el patrón que documenta la
  [guía server-side de nuqs](https://nuqs.dev/docs/server-side) para no
  bloquear el shell estático de la página.

## Autenticación (Better Auth)

- `lib/core/auth.ts` — instancia servidor (`betterAuth()`), usa el mismo
  singleton `prisma` de `lib/core/db.ts` vía `prismaAdapter`. Nunca crees una
  segunda instancia de `betterAuth()`.
- `lib/core/auth-client.ts` — cliente React (`authClient`, `useSession`,
  `signIn`, `signUp`, `signOut`), para usar en Client Components.
- `app/api/auth/[...all]/route.ts` — handler catch-all, no lo muevas de sitio.
- **Server** (Server Components, Route Handlers, Server Actions): comprueba
  la sesión con
  ```ts
  const session = await auth.api.getSession({ headers: await headers() });
  ```
- **Client**: usa el hook `useSession()` de `@/lib/core/auth-client` (ver
  `app/page.tsx`). Formularios de referencia en `app/sign-in/page.tsx` y
  `app/sign-up/page.tsx`.
- **Proteger rutas**: Next.js 16 renombró `middleware.ts` a `proxy.ts`. Si el
  proyecto necesita rutas protegidas, añade un `proxy.ts` en la raíz que
  llame a `auth.api.getSession` y redirija si no hay sesión — no hay uno en
  la plantilla porque qué proteger depende de cada proyecto.
- **Cambiar el modelo de datos de auth** (añadir campos, proveedores OAuth,
  plugins con sus propias tablas): edita `lib/core/auth.ts` y regenera con
  `pnpm run auth:generate` — **no edites `prisma/schema/auth.prisma` a
  mano**, se sobrescribe. Después `pnpm prisma generate`.
- Variables de entorno requeridas: `BETTER_AUTH_SECRET` (32+ caracteres,
  genera una con `openssl rand -base64 32`) y `BETTER_AUTH_URL`.

## Cómo añadir una feature nueva

1. Modelo(s) en `prisma/schema/<feature>.prisma` → `pnpm prisma generate`.
2. `app/api/<feature>/route.ts` (valida input con `zod`).
3. `lib/features/<feature>/{types,queries,hooks}.ts` — y `search-params.ts`
   si la feature tiene filtros/paginación que deban vivir en la URL.
4. `app/<feature>/page.tsx` (Server Component: parsea `searchParams` con nuqs
   si aplica → prefetch + `HydrationBoundary`).
5. `app/<feature>/<feature>-client.tsx` (Client Component con los hooks,
   envuelto en `<Suspense>` desde `page.tsx` si lee estado de nuqs).

## Cómo crecer `lib/` más allá de `core` + `features`

`lib/features/<feature>` es el punto de partida para todo. Si un proyecto
crece lo suficiente, divide **solo cuando aparezca la necesidad real** (no antes):

- `lib/domain/` — reglas de negocio puras, sin I/O.
- `lib/services/` — capa de acceso a BD/colas/email/etc.
- `lib/integrations/` — clientes de APIs de terceros.
- `lib/shared/` — helpers cross-feature (parsers de query params, etc.).
- `lib/api/` — helpers compartidos de API routes (guards de auth, forma de respuesta).

No crees estas carpetas vacías de antemano — añádelas la primera vez que
haga falta, igual que ha ido evolucionando la estructura en el proyecto de
producción del que sale esta plantilla.

## Testing y calidad

- `pnpm test` — corre `scripts/run-tests.mjs` (`node --test` + `tsx`, sin
  framework adicional; recoge cualquier `*.test.ts` bajo `app/` o `lib/`).
- `pnpm run lint` / `pnpm run lint:fix` — [oxlint](https://oxc.rs/docs/guide/usage/linter.html),
  no ESLint (ver sección siguiente).
- `pnpm run typecheck` — `tsc --noEmit`.
- `pnpm run format` — Prettier (con `prettier-plugin-tailwindcss`, ordena
  clases de Tailwind automáticamente).
- `pnpm run knip` — detecta código/dependencias muertas.

El guardado automático (`formatOnSave`) está desactivado a propósito
(`.vscode/settings.json`) — corre `pnpm run format`/`pnpm run lint` de forma
explícita.

## Análisis de datos (`analysis/`, Python)

Vive aparte del stack de Next y no comparte herramientas con él: ni oxlint ni
Prettier tocan esta carpeta.

```bash
python -m venv .venv
.venv/Scripts/python.exe -m pip install -r analysis/requirements.txt
```

Los scripts van numerados por orden de dependencia. `01_panel.py` construye el
panel empresa-mes (~90 s) del que vive todo lo demás; el resto lee su salida.
`fx.py` es un módulo, no un script: contiene la tabla de tipos de cambio a
euros y se importa desde el panel.

Reglas de esta carpeta:

- **Nada de importes sin normalizar.** `exchange_rate` del dataset no convierte
  a EUR; usa `fx.to_eur`. Las transacciones heredan la divisa de su cuenta
  bancaria vía `product_id`.
- **Los `.parquet` y `metrics.json` son artefactos derivados**, no fuentes. Los
  primeros están en `.gitignore` y se regeneran con `01_panel.py`.
- **Las cifras de `analysis/FINDINGS.md` se generan**, no se escriben a mano.
  Los scripts las emiten a `metrics.json` con `report.emit()` y
  `06_report.py` las inyecta en los bloques `<!-- AUTO:... -->`. Si cambias el
  pipeline, vuelve a lanzarlo; `06_report.py --check` falla si el documento se
  ha quedado atrás.

Antes de construir features nuevas, lee
[`analysis/FINDINGS.md`](./analysis/FINDINGS.md): documenta las trampas del
dataset (fechas de pago rellenadas, `status` y saldos que son foto final y no
histórico, trasvases de caja dentro del grupo que inflan casi la mitad del
volumen y que no se pueden filtrar por categoría, mes de septiembre de 2026
truncado, CSV sin aleatorizar) y ahorra repetir errores que ya hemos cometido.

## Linting (oxlint, no ESLint)

Este proyecto usa [oxlint](https://oxc.rs) en vez de ESLint — es lo que usa
gestanex también, y a diferencia de `typescript-eslint`, funciona sin
problemas con TypeScript 7.

- `.oxlintrc.json` — configuración. Solo la categoría `correctness` está en
  `error`; el resto están apagadas a propósito (`suspicious`, `pedantic`,
  `perf`, `style`, `restriction`) para evitar ruido de estilo que ya cubre
  Prettier.
- `components/ui/**` está en `ignorePatterns` — son componentes generados por
  shadcn (código vendor, no tuyo); algunos usan patrones ARIA (`role="group"`,
  etc.) que disparan falsos positivos del plugin `jsx-a11y` al analizarlos
  fuera de contexto de uso. No los edites para "arreglar" el lint.
- **`tools/oxlint/anti-slop/`** — un plugin de oxlint propio (vendorizado de
  gestanex, es genérico y no específico de ningún proyecto) que detecta
  patrones típicos de código generado por IA de baja calidad: aserciones de
  tipo encadenadas, parámetros/retornos `unknown` sin parsear en el borde,
  diccionarios `Record<string, unknown>` sin contrato, `Reflect.apply`/`get`
  innecesarios, etc. La mayoría son `warn` (avisan, no bloquean el lint) —
  revísalos con criterio, no los silencies sin más.
- Extensión de VS Code recomendada: `oxc.oxc-vscode` (ver `.vscode/extensions.json`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
