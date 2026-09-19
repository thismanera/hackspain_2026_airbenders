# Motor de previsión — especificación para desarrollo v1.0

> Implementa §2 de [`SOURCE.md`](./SOURCE.md) (decisiones 34-38, validadas
> 19-09-2026). Se sitúa entre [`scoring-engine.md`](./scoring-engine.md) y
> [`decision-engine.md`](./decision-engine.md). Determinista en v1, sin
> modelo entrenado. Si algo aquí contradice a `SOURCE.md`, manda
> `SOURCE.md`.

```text
company_month_score ─▶ FORECAST ─▶ company_month_forecast ─▶ decision-engine
      (§1)                              (§8)
```

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

| Campo | Uso |
| --- | --- |
| `variables[].valor_bruto`, `conf` por variable | serie a proyectar |
| `score_solo`, `score`, `confianza`, `subscore_A/B/C` | punto de partida y baseline |
| `racha_B2`, `racha_deficit` | rachas proyectadas |
| `D1, D2, D3, D5`, `score_solo` de hermanas | aval previsto |
| `version_parametros` | percentiles congelados para recomputar subnotas |

De `company_month_flows` (scoring §4.1): `cobros_op`, `pagos_op` mensuales
para proyectar `caja_op` y la racha de déficit.

## 2. Parámetros (versionados, mismo fichero que scoring)

| Parámetro | Valor | Decisión |
| --- | --- | --- |
| `horizontes` (meses) | 3, 6 | 34 |
| `ventana_tendencia` (meses) | 6 | 35 |
| `min_meses_tendencia` | 4 | 35 |
| `amortiguacion[h]` | 1,0 para h = 1..3 · 0,5 para h = 4..6 | 35 |
| `clip_proyeccion` | valor proyectado acotado a [p1, p99] de la variable en ajuste | 35 |
| p1/p99 por variable | ajuste propio del forecast sobre las mismas muestras que scoring §11 | 35 |
| `umbral_direccion` | 6 (mismo que scoring) | 10 |
| tabla `p10[h][banda]`, `p90[h][banda]` | residuos en ajuste (§4) | 36 |
| tabla `P_det[banda_t][banda_pred_3m]` | frecuencia del evento en ajuste (§5) | 36 |

El clip se ensancha hasta `x(t)`: una variable ya fuera de [p1, p99] con
tendencia cero no se mueve.

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

| Variable | Proyección |
| --- | --- |
| B2 racha | sin tendencia: `racha_pred = racha(t)`. Solo sube si `B1` proyectado cae por debajo de 0,9: entonces `racha_pred = racha(t) + 1` |
| A2 meses en déficit, racha_deficit | se recalculan sobre `caja_op` proyectado: `caja_op(t+i) = (cobros_op(t) + tend_cobros · Σ_{j≤i} amortiguacion[j]) − (pagos_op(t) + tend_pagos · Σ_{j≤i} amortiguacion[j])` (misma amortiguación que las variables); la ventana de 6 meses desliza |
| C5 volatilidad | constante (`x(t)`): la dispersión no tiene tendencia útil en 6 puntos |
| conf_v | constante (`conf_v(t)`): no se inventa confianza futura |
| D2 score del resto | se proyecta `score_solo` de cada hermana por el mismo método y se recompone D2; D3, D5 constantes. `D2_pred = D2 + media ponderada por D1 de (score_solo_pred − score_solo)` de las hermanas; D2 nulo sigue nulo |

### 3.3 Recomposición

Con los `x_v(t+h)` proyectados se ejecutan las mismas funciones de scoring
§6-7 (subnota con percentiles congelados, nota efectiva, subscores,
`score_solo`, `aval_grupo`, `score`). Resultado: `score_pred_h`,
`banda_pred_h` (bandas de decision-engine §4), `cascada_pred_h[15]`.

### 3.4 Drivers

```text
delta_v     = aportacion_v(t+h) − aportacion_v(t)
drivers_h   = las 3 entradas (14 variables o `grupo`) con mayor |delta_v|, con signo y valores bruto actual → previsto
```

Plantilla: *"Si los cobros siguen cayendo un 4 %/mes (A1 15 % → 6 %) y la
disposición de línea sube (A5 18 % → 31 %), en 3 meses el score baja de 68
a 55: banda C."*

## 4. Intervalo: residuos del backtest, no supuestos

Sobre el conjunto de ajuste (split por grupo de scoring §11), meses con
`t+h ≤ 2026-02`:

```text
e_h(empresa, t) = score(t+h) − score_pred_h(t)
p10[h][b], p90[h][b] = percentiles 10 y 90 de e_h entre filas con banda(t) == b
intervalo_h = [score_pred_h + p10[h][b], score_pred_h + p90[h][b]]  acotado a [0, 100]
```

Se guardan en `version_parametros`. En validación se comprueba que el
intervalo contiene el realizado ~80 % de las veces (§9). En ajuste se fuerza
`p10 ≤ 0 ≤ p90` (`min(p10, 0)`, `max(p90, 0)`), así que `p10 ≤ score_pred ≤ p90`
siempre se cumple.

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

Condición para sustituir v1: en validación, MAE a 3 meses ≥ 15 % mejor que
v1 **y** acierto de banda mejor. Si no, v1 se queda.

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

Pipeline: `scoring:fit → scoring:score → forecast:fit → forecast:run →
scoring:decide → scoring:backtest → forecast:backtest → scoring:import`.
`forecast:fit` congela p1/p99, residuos y `P_det` sobre grupos de ajuste con
`t + h ≤ 2026-02` y decide `conectado`.

## 8. Contrato de salida: `company_month_forecast`

Una fila por `company_id` × `mes`. Campos ▶ los consume decisión.

```text
▶ company_id, mes, version_parametros
▶ score_pred_3m, banda_pred_3m, p10_3m, p90_3m
  score_pred_6m, banda_pred_6m, p10_6m, p90_6m
▶ direccion_pred
  prob_deterioro_6m
  cascada_pred_3m[15], cascada_pred_6m[15]      {id, valor_bruto_pred, subnota_pred, aportacion_pred}
  drivers_3m[3], drivers_6m[3]                  {id, valor_actual, valor_pred, delta_aportacion}
  racha_deficit_pred_3m, racha_B2_pred_3m
  sin_tendencia[]                               variables con < 4 meses
  metodo                                        "v1_proyeccion" | "v2_modelo" | "desconectado"
```

Los campos por horizonte viajan anidados: `horizontes[3]`, `horizontes[6]`
(camelCase en el código: `scorePred`, `bandaPred`, `p10`, `p90`,
`cascadaPred`, `drivers`, `rachaDeficitPred`, `rachaB2Pred`).

## 9. Backtest (decisión 38)

Sobre validación, `t ∈ 2025-09 … 2026-02` para h = 3 y `2025-09 … 2025-11`
para h = 6:

| Métrica | Definición | Exigencia |
| --- | --- | --- |
| `MAE_h` | media de `|score(t+h) − score_pred_h(t)|` | < MAE del baseline ingenuo `score_pred = score(t)` |
| `acierto_banda_h` | % filas con `banda(t+h) == banda_pred_h(t)` | > baseline |
| `cobertura_intervalo` | % filas con `score(t+h) ∈ intervalo_h` | 75-85 % |
| `lead_time_con_prevision` | decision-engine §14, ejecutando decisión con y sin previsión | mejora en meses: es el argumento |
| `falsas_reducciones_preventivas` | reducciones preventivas sin evento en 6 m / reducciones preventivas | reportar; si > 40 % subir `reducir_prev_meses` |

`falsas_reducciones_preventivas` se cuenta comparando la decisión con y sin
previsión: preventiva = `reducir` con previsión donde sin ella no había
`reducir` ni `cerrar`.

Si v1 no bate al baseline ingenuo en MAE, la previsión **no se conecta** a
decisión (decision-engine ignora `banda_pred_3m`) y se dice en el pitch.

### Resultado v1 sobre el dataset (19-09-2026)

| Conjunto | Filas 3m | MAE v1 | MAE baseline | Acierto banda v1 | baseline | Cobertura p10-p90 |
| --- | --- | --- | --- | --- | --- | --- |
| Ajuste | 14 070 | 3,26 | 3,14 | — | — | — |
| Validación h=3 | 2 088 | 3,81 | 3,63 | 0,789 | 0,799 | 0,775 |
| Validación h=6 | 1 044 | 6,00 | 5,72 | 0,678 | 0,706 | 0,761 |

Lead time de cierre con/sin previsión: 6 / 6 meses (previsión desconectada).
La puerta del MAE saltó (v1 pierde contra el baseline ingenuo en los tres
conjuntos), así que las filas salen `metodo = "desconectado"` y decisión las
ignora hasta afinar los parámetros de §3.

## 10. Fixtures y tests

Fixtures en `lib/features/forecast/__fixtures__/series.ts` (series de
variables explícitas), con los mismos percentiles fijos que scoring §12.

| Fixture | Serie (6 meses) | Esperado |
| --- | --- | --- |
| `estable` | todo constante, flujos 100 k / 85 k | `score_pred_h == score(t)` (1e-6) · drivers con delta 0 · `direccion_pred = estable` |
| `tendencia_bajista` | A1 0,30→0,15 (−0,03/mes), A3 3,0→1,5, A4 0,05→0,30; cobros 100 k→80 k, pagos 65 k | A1 0,15 → 0,06 en t+3 · `score_pred_3m < score(t) − 6` → `deterioro` · drivers {A1, A3, A4} · `racha_deficit_pred` 0 a 3 m y 2 a 6 m (caja 15 k − [4, 8, 12, 14, 16, 18] k) |
| `rebote` | 5 meses constantes, último mes A1 0,15→0,25 y cobros +40 % | mediana de deltas 0 ⇒ `score_pred_3m == score(t)` |
| `historial_corto` | 3 meses | `sin_tendencia` = las 11 variables con tendencia general · `score_pred == score(t)` |
| `grupo_arrastre` | filial constante (A1 0,02, A3 0,8), hermana con A1 0,30→0,10 y A3 3→1, D1 0,2/0,8, D5 = 0,15, D3 = 3 | `D2_pred < D2` · `aval_pred < aval` · `score_pred < score` · primer driver `grupo` |

Tests de propiedades:

1. `score_pred_h ∈ [0, 100]`; `p10 ≤ score_pred ≤ p90`.
2. Tendencia cero en todas las variables y caja proyectada sin déficit ⇒ `score_pred_h == score(t)` (tolerancia 1e-6).
3. No fuga: previsión de `t = 2026-02` idéntica con CSV truncados a `2026-02-28`.
4. Mismo input ⇒ misma salida.
5. En ajuste, `MAE_3` de v1 < `MAE_3` del baseline ingenuo; si falla, `conectado = false` y `metodo = "desconectado"` (lo decide `forecast:fit`).
6. Los 5 fixtures dan lo esperado.

## 11. Fuera de alcance v1

Modelo entrenado (v2 condicionado) · previsión de facturas individuales ·
escenarios manuales ("qué pasa si pierdo al cliente X") · horizontes > 6 m.
