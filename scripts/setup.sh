#!/usr/bin/env bash

set -Eeuo pipefail

# Bootstrap reproducible para desarrollo e inferencia sobre el dataset incluido.
# El runtime del scoring es Node; Python solo se necesita para regenerar la
# reclasificación opcional de categorías desde cero.

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_PNPM_VERSION="${PROJECT_PNPM_VERSION:-}"
SECONDARY_PNPM_VERSION="${SECONDARY_PNPM_VERSION:-12.4.2}"
PYTHON_BIN="${PYTHON_BIN:-}"
RUN_CATEGORIES=0

log() {
  printf '[setup] %s\n' "$*"
}

fail() {
  printf '[setup] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Uso: bash scripts/setup.sh [--with-categories]

Prepara Node/Corepack, las dos versiones de pnpm y las dependencias del
proyecto. El pipeline usa los parámetros y resultados precalculados del
dataset actual y no necesita Python. Con --with-categories se instala el
entorno Python opcional y se regenera analysis/transaction_categories.csv.

Variables opcionales:
  PROJECT_PNPM_VERSION    versión del proyecto (por defecto 10.28.1)
  SECONDARY_PNPM_VERSION  versión secundaria cacheada (por defecto 12.4.2)
  PYTHON_BIN              ejecutable Python para --with-categories
EOF
}

for argument in "$@"; do
  case "$argument" in
    --with-categories) RUN_CATEGORIES=1 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "opción desconocida: $argument" ;;
  esac
done

cd "$ROOT_DIR"

command -v node >/dev/null 2>&1 || fail "Node.js no está instalado; se requiere Node 22."
NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
(( NODE_MAJOR >= 22 )) || fail "se requiere Node 22 o superior (encontrado $(node --version))."
command -v corepack >/dev/null 2>&1 || fail "Corepack no está disponible con este Node.js."
if [[ -z "$PROJECT_PNPM_VERSION" ]]; then
  PROJECT_PNPM_VERSION="$(node -p 'const p=require("./package.json"); String(p.packageManager || "").replace(/^pnpm@/, "")')"
fi
[[ -n "$PROJECT_PNPM_VERSION" ]] || fail "package.json no declara packageManager pnpm@..."

USER_HOME="${HOME:-$(cd ~ && pwd)}"
export COREPACK_HOME="${COREPACK_HOME:-${USER_HOME}/.cache/node/corepack}"
mkdir -p "$COREPACK_HOME"

log "Node $(node --version)"
log "Activando shims de Corepack en lugar de sustituir pnpm global."
corepack enable

log "Cacheando pnpm ${PROJECT_PNPM_VERSION} para este proyecto."
corepack install --global "pnpm@${PROJECT_PNPM_VERSION}"
if [[ "$SECONDARY_PNPM_VERSION" != "$PROJECT_PNPM_VERSION" ]]; then
  log "Cacheando también pnpm ${SECONDARY_PNPM_VERSION}."
  corepack install --global "pnpm@${SECONDARY_PNPM_VERSION}"
fi

# `corepack pnpm` lee packageManager y selecciona 10.28.1 dentro de este repo,
# aunque la versión secundaria (12.x) siga disponible para otros proyectos.
PROJECT_PNPM="$(corepack pnpm --version)"
[[ "$PROJECT_PNPM" == "$PROJECT_PNPM_VERSION" ]] ||
  fail "Corepack seleccionó pnpm ${PROJECT_PNPM}; se esperaba ${PROJECT_PNPM_VERSION}."
log "pnpm del proyecto: ${PROJECT_PNPM}"
log "pnpm secundario: ejecutar `corepack pnpm@${SECONDARY_PNPM_VERSION} --version`."

log "Instalando dependencias JavaScript con pnpm ${PROJECT_PNPM_VERSION}."
corepack pnpm install --frozen-lockfile
if [[ -f .env ]]; then
  log "Generando el cliente Prisma (sin modificar la base de datos)."
  corepack pnpm prisma generate
else
  log "No hay .env; se omite Prisma generate hasta configurar DATABASE_URL."
fi

if (( RUN_CATEGORIES )); then
  if [[ -z "$PYTHON_BIN" ]]; then
    if command -v python3 >/dev/null 2>&1; then
      PYTHON_BIN="$(command -v python3)"
    elif command -v python >/dev/null 2>&1; then
      PYTHON_BIN="$(command -v python)"
    else
      fail "--with-categories requiere Python 3.12; omite la opción para usar solo Node."
    fi
  fi
  PYTHON_MAJOR="$("$PYTHON_BIN" -c 'import sys; print(sys.version_info.major)')"
  PYTHON_MINOR="$("$PYTHON_BIN" -c 'import sys; print(sys.version_info.minor)')"
  (( PYTHON_MAJOR == 3 && PYTHON_MINOR >= 12 )) ||
    fail "--with-categories requiere Python 3.12 o superior (encontrado $($PYTHON_BIN --version))."
  if [[ ! -x .venv/bin/python ]]; then
    log "Creando .venv con ${PYTHON_BIN}."
    "$PYTHON_BIN" -m venv .venv
  fi
  log "Instalando dependencias Python desde analysis/requirements.txt."
  .venv/bin/python -m pip install --upgrade pip
  .venv/bin/python -m pip install -r analysis/requirements.txt
  log "Generando categorías deterministas del dataset."
  .venv/bin/python analysis/08_categories.py
  .venv/bin/python analysis/09_export_categories.py
fi

log "Verificando herramientas."
corepack pnpm --version
if (( RUN_CATEGORIES )); then
  .venv/bin/python -c 'import numpy, pandas; print(f"numpy {numpy.__version__}; pandas {pandas.__version__}")'
fi
log "Entorno preparado. Ejecuta `corepack pnpm test` o `corepack pnpm pipeline:eval`."
