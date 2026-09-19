# Documentación

Mapa de lo que hay en `docs/`. Empieza por el rol, no por el fichero.

| Si quieres… | Lee |
| --- | --- |
| Explicar el producto a un compañero o cliente | [Guía de módulos](./product/modules-guide.md) |
| Saber qué regla manda y qué está pendiente | [SOURCE](./product/SOURCE.md) y [auditoría](./product/documentation-audit.md) |
| Entender cómo se calcula cada número | [Motores](./engines/) y [métricas](./engines/scoring-metrics.md) |
| Preparar la demo | [Guion de 90 s](./demo/README.md) y [casos](./demo/use_cases/README.md) |
| Consultar specs retiradas | [history/](./history/README.md) |
| Ver planes de implementación ya ejecutados | [superpowers/plans/](./superpowers/plans/) |

`superpowers/` no se mueve: es la convención de los planes. `history/` tampoco: es el archivo, no la spec vigente.

## Carpetas

| Carpeta | Contenido |
| --- | --- |
| [`product/`](./product/) | SOURCE, guía de módulos, auditoría documentación ↔ código |
| [`engines/`](./engines/) | Scoring, métricas, forecast, decisión, playbook RCA |
| [`demo/`](./demo/) | Guion de 90 s, 17 casos, capturas |
| [`history/`](./history/) | Copias anteriores al 19-09-2026 |
| [`superpowers/`](./superpowers/) | Planes de trabajo históricos |
| [`artifacts/`](./artifacts/) | Resultados v0.2 y material de apoyo, no specs |
