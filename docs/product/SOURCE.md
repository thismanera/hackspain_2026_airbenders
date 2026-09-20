# SOURCE: mapa de reglas y documentación vigente

Revisión del 19-09-2026. Este documento indica dónde consultar cada decisión y
separa el comportamiento implementado de las propuestas. Las decisiones y
cifras anteriores se conservan en el [registro histórico](../history/2026-09-19-SOURCE.md).

## Qué hace el producto

Ayuda a comprender la tesorería de una empresa, anticipar posibles tensiones,
aplicar una política de financiación y proponer revisiones concretas de caja.
El scoring mide salud; decisión determina importe, plazo y precio. La previsión
no tiene por sí sola autoridad para conceder financiación.

Para explicar el producto a un compañero, cliente o jurado, comenzar por
[para el jurado](./para-el-jurado.md) y la [guía de módulos](./modules-guide.md).
Para entender las cifras, usar la [guía de métricas](../engines/scoring-metrics.md).

## Responsabilidades y fuentes

| Área                   | Documento vigente                                  | Referencias ejecutables                                                      |
| ---------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------- |
| Scoring                | [scoring-engine.md](../engines/scoring-engine.md)           | `scoring/params.ts`, `variables.ts`, `aggregate.ts`, `group.ts`, `engine.ts` |
| Previsión              | [forecast-engine.md](../engines/forecast-engine.md)         | `forecast/project.ts`, `engine.ts`, `fit.ts`, `params.ts`                    |
| Decisión               | [decision-engine.md](../engines/decision-engine.md)         | `decision/input.ts`, `params.ts`, `eligibility.ts`, `action.ts`, `engine.ts` |
| RCA/playbook           | [treasury-playbook.md](../engines/treasury-playbook.md)     | `rca/types.ts`, `contracts.ts`, `engine.ts`                                  |
| Ejecución              | [README](../../README.md)                             | `scripts/setup.sh`, `evaluate.ts`, `scoring-io.ts`                           |
| Diferencias pendientes | [documentation-audit.md](./documentation-audit.md) | Hallazgos de lectura del código                                              |

Las rutas de módulos parten de `lib/features/`. Los tipos describen campos,
Zod valida contratos y los tests cubren comportamientos. Si código y diseño no
coinciden, se registra la diferencia: no se cambia una regla de negocio para
hacerla coincidir con una frase de documentación.

## Contratos vigentes

- Scoring: `scoreSolo-holding-v7`, con hash de reglas y versión de ajuste.
- `scoreSolo`: única nota autónoma de `ScoreRow`.
- `scoreGrupo`: nota de esa empresa ajustada por holding, limitada a 0–100.
- `ajusteHolding`: aportación efectiva limitada a −30/+20; no se usa `avalGrupo`.
- `estadoSolo` y `estadoGrupo`: diagnósticos distintos de las bandas de crédito.
- `ForecastRow`: contrato separado, con horizontes 3/6 y objetivos Solo/Grupo.
- `DecisionRow`: resultado de política con límite recomendado y vigente separados.
- RCA: `AnalisisPostInflexion`, separado de scoring, previsión y decisión.

El alias `score` de `DecisionInput`, la columna física Prisma `score` mapeada a
`scoreSolo`, los alias históricos de forecast y `estado` de submission son
usos legítimos que aún existen. No deben eliminarse solo por su nombre.

## Reglas que deben conservarse al explicar el producto

1. La confianza expresa evidencia disponible, no probabilidad de acierto.
2. La nota no equivale a aprobación ni probabilidad de impago.
3. El holding se explica por separado; una oferta apoyada exige las condiciones
   de aval y no supera los controles de incumplimiento, clientes o falta de datos.
4. Un forecast en sombra se calcula, pero no modifica la política.
5. Una alerta EWI propone revisión interna; no certifica Stage 2 regulatorio.
6. El playbook describe cambios, no prueba decisiones ni causalidad de gestión.
7. La oportunidad empresarial precede al producto financiero sugerido.
8. Las cifras de demo son ilustrativas; las métricas reales requieren artefacto,
   versión, muestra y fecha de corte.

## Datos, ejecución y persistencia

El calendario observado va de septiembre de 2024 a agosto de 2026. Septiembre
de 2026 está truncado y excluido. Las previsiones generadas desde agosto pueden
apuntar a fechas posteriores; no son observaciones añadidas al dataset.

`pipeline:eval` usa parámetros congelados, escribe resultados locales y exporta
submission. No ejecuta `fit`, backtests ni importación. Python solo se utiliza
en el análisis opcional de categorías. El fingerprint actual usa metadatos de
ficheros; las versiones de parámetros usan hashes de sus contenidos/configuración.

La cartera lee snapshots en Prisma. La selección por defecto busca ejecuciones
compatibles y completas; las APIs de scoring rechazan versiones explícitas
incompatibles con 409. Sin una ejecución disponible no se sustituye la cartera
por datos ficticios. La importación es un paso explícito que escribe en base de datos.

## Estado de la validación y propuestas

El scoring separa grupos de ajuste y validación. No toda la ventana de evaluación
es posterior al período de ajuste. El forecast compara dos objetivos y dispone
de backtest reservado, pero actualmente fija `conectado` con métricas de ajuste.
Los artefactos congelados mantienen ambos objetivos desconectados.

La postura bancaria de aversión al riesgo sigue pendiente. No se puede deducir
conducta de gestión a partir de las propias recomendaciones del algoritmo.
La [auditoría](./documentation-audit.md) incluye estas diferencias y las relativas
a `deltaGrupo`, ventanas de forecast y nombres de métricas.

## Cómo mantener estos documentos

Al cambiar una regla: revisar parámetros y versiones, tipos/Zod, tests y el
documento técnico correspondiente. Actualizar la guía de métricas si cambia
el significado de una cifra. Regenerar resultados solo en una ejecución nueva
cuando proceda; no presentar métricas antiguas como si validaran la nueva regla.
Mantener los ejemplos ficticios identificados y comprobar su aritmética.
