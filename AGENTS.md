# AGENTS.md

Guía de trabajo de este repo para el equipo y para los agentes de IA que
escriban código en él. Si eres un agente: lee esto entero antes de tocar nada.

La regla que no se salta nadie: **todo cambio sale de una rama creada desde
`main`**. Nunca se hace push directo a `main`.

## Flujo de trabajo

Antes de empezar cualquier tarea, por pequeña que sea:

```bash
git switch main
git pull --ff-only
git switch -c feat/nombre-corto
```

Prefijos de rama según el tipo de cambio: `feat/` para funcionalidad nueva,
`fix/` para arreglos, `chore/` para mantenimiento y dependencias, `docs/` para
documentación.

Reglas del resto del ciclo:

1. PRs pequeños. Es mejor tres PRs de cien líneas que uno de trescientas,
   sobre todo en hackathon, donde el que revisa tiene dos minutos.
2. Rellena la plantilla de PR (`.github/REQUEST_TEMPLATE.md`): qué, por qué,
   cómo se prueba y capturas si hay UI.
3. Un compañero revisa antes de mezclar. Nadie mezcla su propio PR.
4. Squash merge, y se borra la rama después.
5. Nunca se commitean secretos. El `.env` se queda fuera; si añades una
   variable nueva, documéntala en `.env.example` con un valor de ejemplo.
6. Antes de abrir el PR: `pnpm run lint` y `pnpm run typecheck` en verde.
   Todavía no hay workflow de CI en `.github/`, así que de momento esto se
   comprueba en local; el que lo monte, que actualice este punto.

Si necesitas trabajar sobre algo que aún está en el PR de otro, sal de su rama
y no de `main`, pero dilo en el PR para que se mezclen en orden.

## Puesta en marcha

```bash
corepack enable pnpm   # en Windows, si no tienes pnpm en el PATH
pnpm install
cp .env.example .env   # rellena DATABASE_URL con tu Postgres real
pnpm prisma generate
pnpm dev
```

`BETTER_AUTH_SECRET` se genera con `openssl rand -base64 32`. La app arranca en
<http://localhost:3000>.

## Comandos

| Comando              | Qué hace                                  |
| -------------------- | ----------------------------------------- |
| `pnpm dev`           | Servidor de desarrollo (Turbopack)        |
| `pnpm build`         | Build de producción (standalone)          |
| `pnpm start`         | Sirve el build de producción              |
| `pnpm test`          | Tests con `node --test` (ver nota abajo)  |
| `pnpm run lint`      | oxlint (este repo no usa ESLint)          |
| `pnpm run lint:fix`  | oxlint con `--fix`                        |
| `pnpm run format`    | Prettier con orden de clases de Tailwind  |
| `pnpm run typecheck` | `tsc --noEmit`                            |
| `pnpm run knip`      | Detecta código y dependencias muertas     |
| `pnpm prisma:seed`   | Seed de desarrollo (`prisma/seed.ts`)     |
| `pnpm run auth:generate` | Regenera `prisma/schema/auth.prisma`  |

Ojo con dos scripts heredados de la plantilla: `pnpm test` y
`pnpm run rename-project` apuntan a `scripts/run-tests.mjs` y
`scripts/rename-project.mjs`, y esa carpeta no está en el repo. Fallan hasta
que alguien la traiga o cambie el script.

## Convenciones del código

`app/` tiene rutas, layouts y API routes. Las API routes validan la entrada con
zod antes de tocar la base de datos; mira `app/api/tasks/route.ts` como
referencia.

`lib/core/` es infraestructura compartida: cliente de Prisma (`db.ts`),
configuración de TanStack Query (`react-query.ts`), `cn` (`utils.ts`) y Better
Auth en servidor (`auth.ts`) y cliente (`auth-client.ts`).

`lib/features/<feature>/` es el patrón por feature: `queries.ts` con la función
de fetch y la queryKey, `hooks.ts` con los hooks de cliente, `types.ts` con los
DTO. La función de fetch se comparte entre el prefetch de servidor y el hook de
cliente a propósito, para que la queryKey coincida y `HydrationBoundary` pueda
entregar los datos sin refetch; si las separas, rompes la hidratación.

`components/ui/` lo genera shadcn. No se edita a mano: si necesitas variar un
componente, envuélvelo o crea uno propio fuera de esa carpeta.

`prisma/schema/` lleva un fichero `.prisma` por dominio. `auth.prisma` está
generado por `pnpm run auth:generate` y tampoco se edita a mano.

## CLI de hackspain

La organización da una CLI que usa la misma cuenta y los mismos datos que el
dashboard web: equipo, retos, entrega, feed y watcher. Todo el equipo la tiene
instalada; esta sección es la referencia para no ir preguntando.

### Instalación

En Windows se descarga `hackspain-windows-x64.exe` de la página de releases, se
renombra a `hackspain.exe` y se deja en una carpeta que esté en el `PATH`. En
macOS y Linux:

```bash
curl -fsSL https://hackspain.com/install.sh | sh
hackspain update   # más adelante, para la última versión
```

### Sesión

```bash
hackspain                      # dónde estás y qué toca hacer (menú interactivo)
hackspain auth login           # abre /cli-auth para aprobar el dispositivo
hackspain auth login --email … --code …   # alternativa con código de 8 dígitos
hackspain auth status
hackspain auth logout
hackspain open [feed|teams|perks|…]       # abre el dashboard ya logueado
```

### Equipo

El dueño comparte un código de invitación de 8 caracteres y el resto se une con
él.

```bash
hackspain team create <nombre> [-m github:usuario -m alguien@correo.com]
hackspain team join <codigo>
hackspain team show            # o "list" para ver todos los equipos
hackspain team code [--regenerate]
hackspain team repo <url>      # vincula el repo público; su actividad va al feed
hackspain stack set nextjs prisma postgres vercel
hackspain team leave | transfer [miembro] | dissolve
```

El repo tiene que ser **público antes** de vincularlo con `team repo`.

### Retos y entrega

Un proyecto por equipo, y te puedes apuntar a tantos retos como quieras. La
entrega congela todo, así que conviene guardar borradores pronto y a menudo.

```bash
hackspain track list
hackspain track register <slug>     # nuestro reto: X Ray, de Embat
hackspain track unregister <slug>
hackspain track move <origen> <destino>
hackspain submit --draft            # borrador, se puede repetir
hackspain submit                    # entrega definitiva: congela
hackspain project show              # o "list"
```

### Feed, perks y milestones

```bash
hackspain feed [-n 20] [--before …]
hackspain post "texto" [--image foto.jpg]   # ≤500 caracteres, imagen ≤5 MB
hackspain perk list                          # reclamar se hace en el dashboard
hackspain milestone add firstCommit|firstBuild|firstDemo|custom [--label …]
hackspain milestone list [--all]
```

### Watcher

Pensado para dejarlo abierto en su propia terminal todo el fin de semana.
Detecta los harnesses de IA (Claude Code, Codex, Gemini CLI, Cursor y demás),
enseña el feed y los avisos de la organización, y reporta uso. No envía prompts
ni rutas completas de tu máquina.

```bash
hackspain watch [--interval 30] [--no-upload] [--once]
hackspain telemetry stats
```

Dentro del watcher: `q` sale, `p` pausa, `↑↓` recorren el feed y `g` vuelve al
directo.

### Para scripts

Cualquier comando con `--json` imprime un único objeto JSON por stdout y
desactiva los prompts; el resto va a stderr.

```bash
hackspain --json team show
hackspain --json feed -n 5
```

Códigos de salida: `0` todo bien, `1` error del servidor o genérico, `2` error
de uso, `3` sin sesión o sesión caducada, `4` aún no elegible (sin equipo, sin
onboarding o fuera de la ventana de la hackathon), `5` backend inalcanzable,
`130` interrumpido con Ctrl+C.

### Rutinas del equipo

Cosas que conviene no dejar para el final:

1. Vincular este repo con `hackspain team repo` en cuanto sea público, para que
   los commits y PRs aparezcan en el feed.
2. Declarar el stack con `hackspain stack set`.
3. Tener `hackspain watch` abierto en una terminal durante todo el fin de
   semana.
4. Guardar un `hackspain submit --draft` desde el primer día y actualizarlo, en
   vez de escribir la entrega entera el domingo por la noche.
5. Registrar los hitos (`firstCommit`, `firstBuild`, `firstDemo`) según pasan.
