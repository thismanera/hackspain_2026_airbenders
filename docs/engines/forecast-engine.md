# Motor de previsión: qué podría pasar en tres y seis meses

Revisión documental del 19-09-2026. Forecast revisión 2, vinculado exactamente
a la versión de parámetros de scoring `scoreSolo-holding-v7` que lo generó.
Para comenzar, consultar la [guía general](../product/modules-guide.md).

## 0. Qué hace

La previsión, o _forecast_, plantea una pregunta condicionada: «Si continuaran
los cambios recientes, ¿qué nota tendría esta empresa dentro de tres o seis
meses?». Proyecta sus variables y vuelve a calcular la nota con las reglas del
scoring. No suma sin más una tendencia al score final.

Calcula dos resultados: `scoreSoloPred`, para la empresa por sí misma, y
`scoreGrupoPred`, teniendo en cuenta las otras empresas del grupo. Sus
intervalos y estados de conexión se conservan por separado.

**Modo sombra** significa que el resultado se calcula y se puede consultar,
pero no influye en la decisión de crédito. Los parámetros congelados incluidos
mantienen ambos objetivos en ese modo.

## 1. Entradas

[forecastGroup](../../lib/features/forecast/engine.ts) recibe `ForecastGroupInput`:
filas `ScoreRow` de un grupo, flujos por empresa y parámetros ajustados.
También recibe los percentiles de scoring para volver a puntuar las variables.

Cada previsión usa referencias hasta su mes de origen. Un hueco mensual queda
como ausencia, no como dos meses consecutivos. Se rechazan filas de otro grupo,
meses fuera del calendario y claves empresa-mes duplicadas.

El contrato conserva flujos de cobros, pagos y servicio de deuda para proyectar
caja. Se mantienen confianza, cobertura y régimen de deuda de la fila de origen.

## 2. Parámetros

[FORECAST_PARAMS](../../lib/features/forecast/params.ts) define:

| Parámetro             | Valor                       | Significado                                                                   |
| --------------------- | --------------------------- | ----------------------------------------------------------------------------- |
| Horizontes            | 3 y 6 meses                 | Fechas a las que se proyecta                                                  |
| Ventana de tendencia  | 6 meses                     | Historia reciente examinada                                                   |
| Mínimo para tendencia | 3 cambios mensuales válidos | Corresponde al parámetro de 4 observaciones; los pares deben ser consecutivos |
| Amortiguación         | 1 / 1 / 1 / 0,5 / 0,5 / 0,5 | Se frena la extrapolación a partir del cuarto mes                             |
| Límites de proyección | p1 / p99                    | Referencias de valores extremos aprendidas en ajuste                          |
| Intervalos            | p10 / p90 del error         | Franja basada en errores observados del modelo                                |
| Dirección             | ±6 puntos                   | Mejora o deterioro previsto a tres meses                                      |
| Drivers               | 3 por objetivo y horizonte  | Mayores cambios previstos de aportación                                       |

`ForecastParameters` se guarda en un fichero propio; no dentro de los parámetros
ni de las filas de scoring. Contiene hash, versión de scoring, límites,
residuos, frecuencias de deterioro y conexión de Solo/Grupo.

## 3. Proyección de variables y recomposición

### 3.1 Tendencia

Para cada variable ordinaria se toman las diferencias entre meses vecinos con
dato en la ventana y se calcula su mediana. Con menos de tres diferencias
válidas, la tendencia es cero y se incluye en `sinTendencia`.

```text
valor futuro = valor actual + tendencia × suma de factores de amortiguación
```

Una tendencia de 2 unidades al mes añade 6 unidades a tres meses y 9 a seis.
El resultado se limita por p1/p99, ensanchando esos límites hasta el valor actual:
una variable ya fuera del rango no salta hacia dentro solo porque su tendencia sea cero.
Un valor actualmente ausente sigue ausente.

### 3.2 Reglas específicas

| Variable o atributo                        | Tratamiento                                                                                                                            |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| A2                                         | Recalcula la proporción de déficit en la ventana de seis meses que acaba en el horizonte, mezclando meses observados y caja proyectada |
| Racha de déficit                           | Cuenta los meses negativos proyectados y enlaza con la racha actual si procede                                                         |
| B2                                         | Solo aumenta si B1 actual está en 0,9 o más y el B1 proyectado cruza por debajo; no aumenta de nuevo solo por seguir bajo              |
| C5                                         | Mantiene el valor actual                                                                                                               |
| Confianza                                  | Se mantiene por variable                                                                                                               |
| Aplicabilidad, pesos y `hardcoreRevolving` | Se conserva la cobertura de origen al llamar a la agregación                                                                           |

Los flujos usan tendencias amortiguadas. La capacidad neta prevista toma la
diferencia de medias de cobros, pagos y servicio de deuda. **Detalle vigente:**
`mediaFlujoProyectada` promedia desde `max(0,t−5)` hasta `t+h`, omitiendo ausencias
históricas; puede reunir más de seis meses. No es la misma ventana deslizante
que usa A2. Esta diferencia está pendiente de revisión técnica.

### 3.3 Nota autónoma y grupo

[recompose.ts](../../lib/features/forecast/recompose.ts) llama a `aggregate`, por lo
que utiliza las mismas escalas y los tres regímenes de pesos A del scoring.
Después se proyectan las hermanas, se actualiza D2 con sus cambios autónomos
ponderados por D1 observado y se vuelve a calcular el ajuste con capacidades previstas.
D5 y las confianzas se mantienen observados; no se simulan nuevas transferencias.

La nota de grupo queda entre 0 y 100. `ajusteHoldingPred` es la diferencia
efectiva entre nota prevista de grupo y autónoma, después de limitarla.

### 3.4 Explicación

`cascadaPred` contiene 14 aportaciones A–C y una de `holding`. Las primeras
suman la nota autónoma; todas suman la nota de grupo, con tolerancia numérica.
Los tres drivers se ordenan por cambio absoluto de aportación respecto al origen.
`driversSolo` excluye holding; `driversGrupo` puede incluirlo.

Un driver significa «este cambio previsto aporta más puntos a la diferencia».
No demuestra qué decisión empresarial causará ese cambio.

## 4. Intervalos

Se calcula el error histórico `nota realizada − nota prevista`, separado por
horizonte, banda de origen y objetivo. Los percentiles 10 y 90 se suman a la
predicción y se limitan a 0–100. El ajuste fuerza el residuo inferior a ser ≤0
y el superior a ser ≥0; sin muestras utiliza cero.

Una franja estrecha no es automáticamente una previsión segura: puede reflejar
falta de muestras. La cobertura real del intervalo se mide en el backtest.
No debe prometerse que contendrá el 80 % de los resultados sin esa comprobación.

## 5. Dirección y frecuencia de deterioro

`direccionSoloPred` y `direccionGrupoPred` comparan la nota a tres meses con
su propia nota actual. Desde +6 se marca mejora; desde −6, deterioro.

`probDeterioroSolo6m` y `probDeterioroGrupo6m` usan frecuencias de episodios de
estrés operativo según banda actual y prevista. Si una celda tiene menos de
30 observaciones se intenta usar su banda actual completa; sin suficientes
observaciones, el resultado es nulo. El evento de caja es común a ambos objetivos.

Es una frecuencia histórica condicionada a esas bandas. No es una probabilidad
de impago de un préstamo ni una estimación individual validada de default.

## 6. Conexión con decisión: estado real

La regla numérica es independiente para Solo/Grupo:

```text
MAE de previsión < MAE de mantener la nota actual
acierto de banda de previsión ≥ acierto de mantener la nota actual
```

El segundo modelo de comparación se llama **baseline de persistencia**: supone
que en el futuro la nota será la misma que hoy. MAE mide puntos de error medio.

**Limitación vigente:** `scripts/forecast.ts fit` entrega a `fitForecast` los
grupos de entrenamiento; `targetParameters` calcula `conectado` con esos pares.
El script de backtest evalúa los grupos reservados, pero no actualiza después la
bandera. Por tanto, el código actual no implementa una autorización automática
basada en mejora fuera de muestra, aunque ese sea el criterio de producto deseado.

La calibración incluida declara:

| Objetivo |   MAE | MAE baseline | Acierto banda | Baseline banda | Conectado |
| -------- | ----: | -----------: | ------------: | -------------: | --------- |
| Solo     | 4,414 |        4,256 |       75,47 % |        76,41 % | No        |
| Grupo    | 4,069 |        3,890 |       77,43 % |        78,04 % | No        |

Fuente: [calibration.json](../../artifacts/inference/scoreSolo-holding-v7/calibration.json),
19-09-2026. Son cifras de ajuste, no resultados del conjunto reservado.
El baseline es mejor en las dos métricas de ambos objetivos. Se conserva el
modo sombra. `v2_modelo` es un valor admitido por el contrato, no un segundo
modelo implementado en el motor actual.

## 7. Ejecución

El uso habitual es `corepack pnpm pipeline:eval`, que ejecuta previsiones con
parámetros congelados. `forecast:run` escribe `forecasts.jsonl` y copia los
parámetros utilizados al directorio de la ejecución al terminar correctamente.

La recalibración explícita sigue `scoring:fit → scoring:score → forecast:fit →
forecast:run`, en un directorio nuevo. Los comandos y rutas comunes están en el
[README](../../README.md). No se debe ejecutar `fit` contra los artefactos congelados
si se pretende conservar la calibración entregada.

## 8. Contrato de salida

[ForecastRow](../../lib/features/forecast/types.ts) y su
[contrato Zod](../../lib/features/forecast/contracts.ts) contienen:

- Identificadores y versión de parámetros de forecast.
- `horizontes[3]` y `[6]`: notas, bandas e intervalos Solo/Grupo; ajuste del
  holding; cascada, drivers y rachas previstas.
- Direcciones, probabilidades operativas, variables sin tendencia y métodos por objetivo.

Existen alias históricos: en cada horizonte `scorePred`, `bandaPred`, `p10`,
`p90` y `drivers` apuntan a Grupo. En parámetros, los alias `residuos`, `pDet`,
`conectado` y `ajuste` apuntan a Solo. En una integración nueva se deben usar
los campos explícitos para evitar confundir objetivos.

Zod comprueba rangos e intervalos ordenados. La compatibilidad de hashes y
vínculo de scoring se comprueba adicionalmente en los scripts.

## 9. Backtest

`forecast:backtest` reserva los grupos de validación del scoring. Examina fechas
de origen septiembre de 2025–febrero de 2026 para h=3 y septiembre–noviembre de
2025 para h=6. Publica MAE, baseline, acierto de banda, cobertura de intervalos,
y comparación de decisiones con/sin previsión. Si las previsiones están en sombra,
no se espera un efecto preventivo distinto solo por pasarlas al motor.

El informe tiene bloques Solo/Grupo. Las comparaciones de decisiones que recibe
son comunes; no son dos experimentos aislados activando cada objetivo por separado.
Parte de los meses coincide temporalmente con el ajuste, aunque las empresas
pertenecen a grupos reservados. Septiembre de 2026 no se usa como observación.

## 10. Pruebas

[trend.test.ts](../../lib/features/forecast/trend.test.ts) y
[engine.test.ts](../../lib/features/forecast/engine.test.ts) cubren tendencias,
huecos, casos sin historia suficiente, proyecciones duales, holding y contratos.
Las pruebas de decisión comprueban que el modo desconectado no altera la oferta.

## 11. Límites y trabajo pendiente

Antes de conectar un objetivo por su capacidad predictiva, hace falta resolver
la separación entre ajuste y validación descrita en §6. También deben revisarse
la ventana de capacidad del holding y la interpretación de probabilidades con
seguimiento incompleto. Se registran en la [auditoría](../product/documentation-audit.md).
Este documento describe el comportamiento actual y no modifica parámetros ni métricas.
