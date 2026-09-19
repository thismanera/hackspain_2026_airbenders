# Motor de previsión dual — especificación para desarrollo v1.0

> Estado implementado: parámetros de forecast revisión 2, vinculados a
> `scoreSolo-holding-v7`. El ajuste de conexión se recalibra después de cada cambio de
> contrato y no reutiliza artefactos de versiones anteriores.

> Implementa §2 de [`SOURCE.md`](./SOURCE.md) (decisiones 34-38, validadas
> 19-09-2026). Se sitúa entre [`scoring-engine.md`](./scoring-engine.md) y
> [`decision-engine.md`](./decision-engine.md). Determinista en v1, sin
> modelo entrenado. Si algo aquí contradice a `SOURCE.md`, manda
> `SOURCE.md`.

```text
company_month_score ─▶ FORECAST ─▶ company_month_forecast ─▶ decision-engine
      (§1)                              (§8)
```

La implementación actual conserva dos objetivos independientes: `scoreSolo` (capacidad
autónoma) y `scoreGrupo` (capacidad dentro del holding). Ambos se calculan y persisten en
cada ejecución. Cada objetivo se conecta a decisión únicamente si mejora fuera de muestra al
baseline de persistencia en MAE y al menos igual en acierto de banda; si no, aparece como
**modo sombra** y no modifica la oferta. La conexión se decide por separado para Solo y Grupo:
`MAE < MAE_baseline` y `acierto_banda ≥ acierto_banda_baseline`.

El forecast no es una probabilidad de impago. `probDeterioro*` describe estrés operativo
observado y debe leerse junto con confianza, estado, puertas y la condición de aval.

## 0.1 Pipeline reproducible

La salida local se construye en este orden, con un `SCORING_OUT` nuevo para cada validación:

```text
scoring:fit → scoring:score → forecast:fit → forecast:run →
scoring:decide → scoring:backtest → forecast:backtest → scoring:import
```

La importación exige que las versiones de scoring y forecast coincidan. Una ejecución explícita
incompatible se rechaza con HTTP 409 en las APIs de consulta y exportación.

## 0. Qué hace

Por cada empresa y cierre de mes `t`, proyecta el score a `t+3` y `t+6`:

1. `score_pred_h`, `banda_pred_h`, intervalo p10/p90 (§3-4).
2. Cascada prevista y los 3 drivers del cambio (§3.4).
3. `direccion_pred` y `prob_deterioro_6m` (§5).

Lo que **no** hace: decidir. Decisión lee la previsión y solo la usa para
endurecer (decision-engine §5, §6, §8).

## 1. Entradas

De `company_month_score` (scoring §10), filas `t−5 … t` de la empresa y de
sus hermanas:

| Campo                                                | Uso                                             |
| ---------------------------------------------------- | ----------------------------------------------- |
| `variables[].valor_bruto`, `conf` por variable       | serie a proyectar                               |
| `score_solo`, `score`, `confianza`, `subscore_A/B/C` | punto de partida y baseline                     |
| `racha_B2`, `racha_deficit`                          | rachas proyectadas                              |
| `D1, D2, D3, D5`, `score_solo` de hermanas           | aval previsto                                   |
| `version_parametros`                                 | percentiles congelados para recomputar subnotas |

De `company_month_flows` (scoring §4.1): `cobros_op`, `pagos_op` mensuales
para proyectar `caja_op` y la racha de déficit.

## 2. Parámetros (versionados, mismo fichero que scoring)

| Parámetro                              | Valor                                                         | Decisión |
| -------------------------------------- | ------------------------------------------------------------- | -------- |
| `revision`                             | 2                                                             | contrato |
| `horizontes` (meses)                   | 3, 6                                                          | 34       |
| `ventana_tendencia` (meses)            | 6                                                             | 35       |
| `min_meses_tendencia`                  | 4                                                             | 35       |
| `amortiguacion[h]`                     | 1,0 para h = 1..3 · 0,5 para h = 4..6                         | 35       |
| `clip_proyeccion`                      | valor proyectado acotado a [p1, p99] de la variable en ajuste | 35       |
| `umbral_direccion`                     | 6 (mismo que scoring)                                         | 10       |
| tabla `p10[h][banda]`, `p90[h][banda]` | residuos en ajuste (§4)                                       | 36       |
| tabla `P_det[banda_t][banda_pred_3m]`  | frecuencia del evento en ajuste (§5)                          | 36       |

## 3. Método v1: proyección determinista de variables

### 3.1 Tendencia robusta por variable

Para cada variable `v` con valor bruto `x_v(m)`, `m ∈ {t−5 … t}`:

```text
deltas      = [x_v(m) − x_v(m−1)  para m con ambas observaciones]
if len(deltas) < min_meses_tendencia − 1:   # menos de 4 meses observados
    tendencia_v = 0 ; sin_tendencia_v = true
else:
    tendencia_v = mediana(deltas)             # robusta: un mes extremo no manda
```

Variables `NA` en `t` → siguen `NA` en la proyección (subnota 50, conf 0).

### 3.2 Proyección

```text
x_v(t+h) = clip( x_v(t) + Σ_{i=1..h} tendencia_v × amortiguacion[i] , p1_v, p99_v )
```

Amortiguación: la tendencia se aplica entera 3 meses y a la mitad los 3
siguientes. Una caída del 4 %/mes no se extrapola 6 meses en línea recta.

Excepciones a la regla general:

| Variable                           | Proyección                                                                                                                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| B2 racha                           | sin tendencia: `racha_pred = racha(t)`. Solo sube si `B1` proyectado cae por debajo de 0,9: entonces `racha_pred = racha(t) + 1`                      |
| A2 meses en déficit, racha_deficit | se recalculan sobre `caja_op` proyectado: `caja_op(t+i) = cobros_op(t) + i·tend_cobros − (pagos_op(t) + i·tend_pagos)`; la ventana de 6 meses desliza |
| C5 volatilidad                     | constante (`x(t)`): la dispersión no tiene tendencia útil en 6 puntos                                                                                 |
| conf_v                             | constante (`conf_v(t)`): no se inventa confianza futura                                                                                               |
| D2 score del resto                 | se proyecta `score_solo` de cada hermana por el mismo método y se recompone D2; D3, D5 constantes                                                     |

### 3.3 Recomposición

Con los `x_v(t+h)` proyectados se ejecutan las mismas funciones de scoring
§6-7 (subnota con percentiles congelados, nota efectiva, subscores,
`score_solo`, `aval_grupo`, `score`). Resultado: `score_pred_h`,
`banda_pred_h` (bandas de decision-engine §4), `cascada_pred_h[15]`.

### 3.4 Drivers

```text
delta_v     = aportacion_v(t+h) − aportacion_v(t)
drivers_h   = las 3 variables con mayor |delta_v|, con signo y valores bruto actual → previsto
```

Plantilla: _"Si los cobros siguen cayendo un 4 %/mes (A1 15 % → 6 %) y la
disposición de línea sube (A5 18 % → 31 %), en 3 meses el score baja de 68
a 55: banda C."_

## 4. Intervalo: residuos del backtest, no supuestos

Sobre el conjunto de ajuste (split por grupo de scoring §11), meses con
`t+h ≤ 2026-02`:

```text
e_h(empresa, t) = score(t+h) − score_pred_h(t)
p10[h][b], p90[h][b] = percentiles 10 y 90 de e_h entre filas con banda(t) == b
intervalo_h = [score_pred_h + p10[h][b], score_pred_h + p90[h][b]]  acotado a [0, 100]
```

Se guardan en `version_parametros`. En validación se comprueba que el
intervalo contiene el realizado ~80 % de las veces (§9).

## 5. Dirección prevista y probabilidad de deterioro

```text
direccion_pred = mejora    si score_pred_3m − score(t) ≥ +6
               = deterioro si ≤ −6
               = estable   en otro caso

P_det[b_t][b_pred] = #{(empresa, t) en ajuste : banda(t) = b_t, banda_pred_3m(t) = b_pred, evento_deterioro en (t, t+6]}
                     / #{(empresa, t) en ajuste : banda(t) = b_t, banda_pred_3m(t) = b_pred}
prob_deterioro_6m  = P_det[banda(t)][banda_pred_3m]
```

`evento_deterioro` es el de scoring §13. Tabla 4×4; celdas con menos de 30
observaciones heredan la fila. No es una probabilidad de impago: se dice en
la ficha.

## 6. v2: modelo entrenado, solo si el backtest lo justifica

Condición para conectar cada objetivo: en validación, su MAE a 3 meses debe ser
estrictamente menor que el baseline de persistencia **y** su acierto de banda
igual o mayor. Si no, se persiste y se muestra como modo sombra.

Receta (de `analysis/FINDINGS.md` §7, Alex): features en `t` (valores
brutos, subnotas, tendencias, rango percentil por mes de calendario,
indicadores de disponibilidad) → objetivo `score(t+3)`; booster con nulos
nativos; `GroupKFold` por `group_id`; holdout temporal y de arranque en frío.
Explicación por contribuciones de features mapeadas a las 14 variables.
Mismo contrato de salida (§8). Coordinar con Alex antes de empezar.

## 7. Orden de ejecución

```text
para cada mes t:
    para cada empresa con ≥ 1 fila:
        tendencias → x(t+3), x(t+6) → recomposición → score_pred, banda_pred, cascada_pred, drivers
    hermanas: score_solo_pred → D2_pred → aval_pred (necesita todas las empresas del grupo proyectadas)
    intervalo, direccion_pred, prob_deterioro_6m
    persistir company_month_forecast[t]
```

Regla de oro: la previsión en `t` usa solo filas `≤ t`. Las tablas de
residuos y `P_det` se calculan una vez en ajuste y se congelan.

## 8. Contrato de salida: `company_month_forecast`

Una fila por `company_id` × `mes`. Los objetivos autónomo y holding se
persisten juntos, pero mantienen conexión y métricas independientes.

```text
▶ company_id, mes, version_parametros
▶ scoreSolo_pred_3m/6m, scoreGrupo_pred_3m/6m, bandas e intervalos p10/p90
▶ direccionSolo_pred, direccionGrupo_pred, probDeterioroSolo6m/probDeterioroGrupo6m
  ajusteHolding_pred, cascada_pred_3m/6m[15]  {id, valor_bruto_pred, subnota_pred, aportacion_pred}
  driversSolo_3m/6m[3], driversGrupo_3m/6m[3] {id, valor_actual, valor_pred, delta_aportacion}
  racha_deficit_pred_3m, racha_B2_pred_3m
  sin_tendencia[]                               variables con < 4 meses
  metodoSolo, metodoGrupo                       "v1_proyeccion" | "v2_modelo" | "desconectado"
```

## 9. Backtest (decisión 38)

Sobre validación, `t ∈ 2025-09 … 2026-02` para h = 3 y `2025-09 … 2025-11`
para h = 6:

| Métrica                          | Definición                                                          | Exigencia                                          |
| -------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------- |
| `MAE_h`                          | media del error absoluto entre `score(t+h)` y `score_pred_h(t)`     | < MAE del baseline ingenuo `score_pred = score(t)` |
| `acierto_banda_h`                | % filas con `banda(t+h) == banda_pred_h(t)`                         | > baseline                                         |
| `cobertura_intervalo`            | % filas con `score(t+h) ∈ intervalo_h`                              | 75-85 %                                            |
| `lead_time_con_prevision`        | decision-engine §14, ejecutando decisión con y sin previsión        | mejora en meses: es el argumento                   |
| `falsas_reducciones_preventivas` | reducciones preventivas sin evento en 6 m / reducciones preventivas | reportar; si > 40 % subir `reducir_prev_meses`     |

Si un objetivo no bate al baseline ingenuo en ambas métricas, ese objetivo
queda en modo sombra y decisión ignora su banda prevista. El otro objetivo
puede conectarse de forma independiente.

## 10. Fixtures y tests

Fixtures en `fixtures/forecast/`, con los mismos percentiles fijos que
scoring §12.

| Fixture             | Serie (6 meses)                                                   | Esperado                                                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tendencia_bajista` | cobros 100 k → 80 k (−4 k/mes), pagos 85 k fijos                  | A1 baja 0,15 → 0,03 en t+3 · `caja_op` negativa en t+5 → `racha_deficit_pred_3m = 0`, en 6 m = 2 · `score_pred_3m` < `score(t)` − 6 → `direccion_pred = deterioro` · drivers: A1, A2, A4 |
| `estable`           | todo constante                                                    | `score_pred_h == score(t)` exacto · drivers con delta 0                                                                                                                                  |
| `rebote`            | 5 meses constantes, último mes cobros +40 %                       | mediana de deltas = 0 → `score_pred_3m == score(t)`; el mes extremo no manda                                                                                                             |
| `historial_corto`   | 3 meses                                                           | `sin_tendencia` = todas · `score_pred == score(t)` · flag visible                                                                                                                        |
| `grupo_arrastre`    | filial constante, hermana con tendencia bajista fuerte, D5 = 0,15 | `D2_pred` < `D2` · `aval_pred` < `aval` · `score_pred` baja aunque la filial no cambie                                                                                                   |

Tests de propiedades:

1. `score_pred_h ∈ [0, 100]`; `p10 ≤ score_pred ≤ p90`.
2. Tendencia cero en todas las variables ⇒ `score_pred_h == score(t)` (tolerancia 1e-6).
3. No fuga: previsión de `t = 2026-02` idéntica con CSV truncados a `2026-02-28`.
4. Mismo input ⇒ misma salida.
5. En ajuste, `MAE_3` de v1 < `MAE_3` del baseline ingenuo; si falla, el test avisa y `metodo = "desconectado"`.
6. Los 5 fixtures dan lo esperado.

## 11. Fuera de alcance v1

Modelo entrenado (v2 condicionado) · previsión de facturas individuales ·
escenarios manuales ("qué pasa si pierdo al cliente X") · horizontes > 6 m.
