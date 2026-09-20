# Correspondencia entre documentación y código

Revisión del 19-09-2026. Este registro recoge diferencias encontradas al preparar
las guías. No cambia algoritmos, parámetros, artefactos ni datos. Su propósito
es evitar que una explicación comercial presente como disponible algo pendiente.

## Diferencias que requieren trabajo posterior

| Prioridad | Hallazgo comprobado                                                                                                                      | Evidencia                                                                                                                                              | Cómo explicarlo ahora                                                                                                                  |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| Alta      | La conexión del forecast se decide en ajuste, no en el backtest de grupos reservados                                                     | `scripts/forecast.ts: doFit` usa `trainGroups`; `forecast/fit.ts: targetParameters` fija `conectado`; `doBacktest` escribe un informe sin actualizarlo | Los parámetros actuales están en sombra; antes de autorizar conexión por mejora fuera de muestra hay que cambiar ese proceso           |
| Alta      | `deltaGrupo` no contiene siempre el cambio de la aportación holding                                                                      | `scoring/engine.ts` asigna `factorGrupo.delta`; el ganador también puede ser A–C                                                                       | Para descomponer, calcular `aportacionGrupo(t) − aportacionGrupo(t−1)`; no usar ese campo como delta exclusivo                         |
| Alta      | No hay clasificador bancario de aversión al riesgo implementado en RCA                                                                   | `rca/types.ts`, `contracts.ts` y `engine.ts` solo exponen el análisis post-inflexión                                                                   | Mostrar evidencia de tesorería; conservar las etiquetas bancarias como propuesta                                                       |
| Alta      | `DecisionRow` representa acciones del motor, no decisiones observadas de la empresa                                                      | `decision/engine.ts` construye las acciones a partir de reglas                                                                                         | No atribuir prudencia o tolerancia de la dirección a una ampliación recomendada por el propio motor                                    |
| Media     | La capacidad proyectada no usa la misma ventana móvil de seis meses que A2                                                               | `forecast/project.ts: mediaFlujoProyectada` promedia de `max(0,t−5)` a `t+h`; `a2Pred` usa la ventana que termina en `t+h`                             | Documentar ambas ventanas; revisar si esa diferencia es la intención de producto                                                       |
| Media     | El nombre `gapCicloDias` sugiere un ciclo completo, pero resta retrasos respecto al vencimiento                                          | `scoring/variables.ts: medianDelay`; `engine.ts: C3dias − B3.raw`                                                                                      | Llamarlo «diferencia entre retrasos de cobro y pago»; no DSO−DPO ni ciclo de conversión de caja                                        |
| Media     | La reconstrucción de C4 utiliza un estado final de factura                                                                               | `variables.ts: paidAt`, `C4Estimado`                                                                                                                   | Considerar la limitación histórica al interpretar morosidad o evaluar resultados                                                       |
| Media     | La preparación de divisas toma información del dataset en la ingesta                                                                     | `ingest.ts`, `fx.ts`                                                                                                                                   | Separar procedencia de las tasas y período de ajuste; evitar afirmar ausencia absoluta de información posterior en toda la preparación |
| Media     | RCA admite que cambie la confianza durante el período comparable                                                                         | `rca/engine.ts: hasComparableEvidence` exige dato, aplicabilidad y peso estable, pero no confianza estable                                             | El cambio de aportación puede incluir variaciones de evidencia, no solo mejora económica                                               |
| Media     | La probabilidad operativa se ajusta con eventos hasta el corte, sin exigir seguimiento completo de seis meses para cada par a tres meses | `forecast/fit.ts: targetParameters`, `fitForecast`                                                                                                     | No tratar esa frecuencia como una probabilidad individual validada ni una PD                                                           |

Las rutas de módulos de la tabla parten de `lib/features/`.
No basta con que un test pase para resolver una diferencia entre intención de
producto y código: primero hay que acordar la regla, implementarla y volver a evaluar.

## Aclaraciones documentales ya aplicadas

- `scoreSolo` es autónomo; `scoreGrupo` pertenece a esa misma empresa, no al consolidado.
- Los alias de `DecisionInput`, forecast, CSV y los nombres físicos de Prisma se documentan; no se eliminan por parecer antiguos.
- La puerta de «estado» de decisión compara una nota. El aval puede superar debilidad de nota o pilar A, pero no el resto de controles duros.
- `naturaleza`, `patronTrayectoria`, `diagnosticoMejora` e inflexión son conceptos distintos.
- B2 usa una escala discreta de rachas, no p5/p95.
- C5 usa hasta doce meses observados, con mínimo seis.
- Sin deuda, la confianza de A sigue la excepción de media simple A1/A2.
- Hardcore revolving observa disposiciones y amortizaciones; no reconstruye saldos.
- Los escenarios recuperables RCA son aritméticos. El de grupo no recompone el modelo del holding.
- La demo identifica cifras ficticias y no ofrece etiquetas bancarias como si fueran resultados implementados.

## Procedencia de cifras

[`calibration.json`](../../artifacts/inference/scoreSolo-holding-v7/calibration.json)
conserva las versiones, hashes, fingerprint, recuentos y métricas de ajuste del
forecast. En la carpeta congelada revisada hay parámetros de scoring, parámetros
de forecast y ese resumen; no contiene todos los informes históricos de backtest.

Una AUC de un análisis anterior no debe citarse como resultado de la versión
actual sin el informe correspondiente. Los runs locales pueden conservar informes
adicionales, pero deben identificarse por ruta, versión y muestra.

## Comprobación de esta revisión

Se revisan enlaces y formato de los documentos modificados y se ejecutan tests,
typecheck, lint y build. Estas comprobaciones no recalibran el motor ni resuelven
las diferencias anteriores. La ejecución congelada, los pesos y las métricas
persistidas se conservan; no se importa información en una base compartida.

Los textos anteriores se han conservado en el [archivo histórico](../history/README.md).

Resultados de esta revisión:

| Comprobación         | Resultado                                                                                                                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test`          | Correcto; el ejecutor informa 39 archivos de pruebas, sin fallos                                                                               |
| `pnpm run typecheck` | Correcto, proyecto principal y scripts                                                                                                         |
| `pnpm run lint`      | Sin errores; 81 advertencias del código existente                                                                                              |
| Formato              | Prettier aplicado únicamente a los documentos modificados                                                                                      |
| Enlaces              | Rutas locales y anclas verificadas en la documentación revisada                                                                                |
| `pnpm build`         | Bloqueado por el entorno: Turbopack falla al abrir un puerto local (`Operation not permitted`); también ocurre al reintentar fuera del sandbox |

El fallo de build no se presenta como una validación aprobada. No se han
cambiado los motores para intentar resolver una restricción del entorno.
