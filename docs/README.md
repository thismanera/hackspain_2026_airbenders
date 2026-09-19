# Documentación

## Para el jurado

Empieza aquí. Cuatro lecturas; el resto de esta carpeta no hace falta.

1. [Paquete de entrega](./product/para-el-jurado.md) — pitch, qué hay, qué no afirmar, demo.
2. [Guía de módulos](./product/modules-guide.md) — scoring, forecast, decisión, playbook.
3. [Métricas](./engines/scoring-metrics.md) — §1 y §2.
4. [Casos de uso](./demo/README.md) — introducción y las dos fichas de demo.

## Mapa interno

| Si quieres…                                  | Lee                                                                           |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| Brief de producto (quién, reglas, pantallas) | [PRODUCT](./product/PRODUCT.md)                                               |
| Saber qué regla manda y qué está pendiente   | [SOURCE](./product/SOURCE.md) y [auditoría](./product/documentation-audit.md) |
| Entender cómo se calcula cada número         | [Motores](./engines/)                                                         |
| Las dos fichas de demo                       | [Casos](./demo/use_cases/README.md)                                            |
| Casos factibles no grabados                  | [Factibles](./demo/use_cases_factibles/README.md)                              |
| Specs retiradas                              | [history/](./history/README.md)                                               |
| Planes ya ejecutados                         | [superpowers/plans/](./superpowers/plans/)                                    |

## Qué queda en la raíz (a propósito)

No se mueven a `docs/`. GitHub, agentes e Impeccable los buscan ahí.

| Fichero                   | Por qué se queda                                             |
| ------------------------- | ------------------------------------------------------------ |
| `README.md`               | Portada del repo y cómo arrancar                             |
| `PRODUCT.md`              | Puntero a `docs/product/PRODUCT.md`                          |
| `DESIGN.md`               | Tokens del sistema visual; Impeccable lo descubre en la raíz |
| `AGENTS.md` / `CLAUDE.md` | Convenciones para agentes                                    |
| `CONTRIBUTING.md`         | Flujo de PRs                                                 |
| `analysis/FINDINGS.md`    | Lo genera el pipeline Python; no es spec de producto         |

## Carpetas

| Carpeta                          | Contenido                                            |
| -------------------------------- | ---------------------------------------------------- |
| [`product/`](./product/)         | Entrega, PRODUCT, SOURCE, guía de módulos, auditoría |
| [`engines/`](./engines/)         | Scoring, métricas, forecast, decisión, playbook RCA  |
| [`demo/`](./demo/)               | Introducción, 2 casos grabados y 6 factibles         |
| [`history/`](./history/)         | Copias anteriores al 19-09-2026                      |
| [`superpowers/`](./superpowers/) | Planes de trabajo históricos                         |
