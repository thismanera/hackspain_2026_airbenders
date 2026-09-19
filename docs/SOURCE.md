# SOURCE — Embat Flow (Embat · X-Ray)

Source of truth. Corto a propósito. `☐` = pendiente de validar con Pablo; `✅` validado; `⏳` aplazado. Justificaciones en §4.
Detalle técnico ampliado en [`scoring-engine.md`](./scoring-engine.md) (score), [`forecast-engine.md`](./forecast-engine.md) (previsión) y [`decision-engine.md`](./decision-engine.md) (decisión).

**Producto:** financiación de circulante (anticipar cobros / estirar pagos)
con límite que se recalcula solo mes a mes. El score dice cuánto, a qué
precio y cuándo cerrar el grifo.

**Cuatro partes:** (1) score · (2) previsión · (3) decisión · (4) producto.

---

## 1. Score — por empresa × mes

### 1.0 Reglas comunes

| Regla | Valor |
| --- | --- |
| Corte | Mes completo `2024-09 … 2026-08`. Fila `t` solo usa eventos ≤ fin(t). Nada de la foto final (`balances`, `outstanding`, `pending_amount`, `status`) para `t < 2026-09`. |
| Movimientos | `status = booked`; cuentas `checking/saving/wallet` |
| Divisas ✅ | Score siempre en €. Dos pasos: (1) `importe_empresa = amount / exchange_rate` (`exchange_rate` = unidades de la moneda del producto o factura por 1 unidad de la moneda de la empresa; verificado: USD→EUR 1,16, GBP→EUR 0,86, NOK→EUR 11; misma moneda → 1). (2) `importe_eur = importe_empresa × tasa(moneda_empresa → EUR, mes)`, tabla mensual construida con la mediana de las tasas del propio dataset en pares con EUR; sin dato en el mes → tasa fija versionada en el repo. `exchange_rate` vacío o 0 (0,4 % de facturas) → mediana del par en ese mes; sin par → excluir y bajar confianza. |
| Sin clasificar ✅ | Se usa la reclasificación de #12 (`analysis/08_categories.py`, `transaction_categories.parquet`) cuando `category_confidence ≥ 0,95`; el resto (`unknown`) → cobertura, nunca ingreso/gasto. `debt_drawdown` → financiación (como `disp_credito`); `balance_adjustment` → neutral. |
| Traspasos ✅ | Espejos emparejados **sobre todas las categorías**, no solo `transfer`: mismo importe al céntimo, signo opuesto, misma fecha, uno a uno. Misma empresa → neutral. Otra empresa del mismo grupo → intragrupo (D4/D5), fuera de cobros y pagos. |
| Crédito | Movimientos sobre productos `lineofcredit` → financiación, fuera de operativo |
| Confianza | Cada variable lleva `conf ∈ [0,1]` = ventana observada × cobertura. Sin dato → nota 50, conf 0. Confianza se muestra aparte del score. |
| Escalas | Percentiles p5/p95 fijados en empresas de ajuste (split por `group_id`), versionados, no se recalculan en test. |

### 1.1 Flujos base mensuales (de `transactions`)

| Flujo | Categorías |
| --- | --- |
| `cobros_op` | `collection`, `bulk_collection`, `pos_settlement`, `cash_settlement(s)` |
| `pagos_op` | `payment`, `bulk_payment`, `utility`, `salary`, `social_security`, `tax`, `fee` |
| `servicio_deuda` | `debt_repayment` + `interest_charge` |
| `disp_credito` / `amort_credito` | `+` / `−` sobre productos `lineofcredit` |
| `obligaciones_rec` | `debt_repayment`, `tax`, `social_security`, `salary` (pagos recurrentes esperables) |
| `recibos_devueltos` | `collection_refund` (−): recibos domiciliados a clientes devueltos ("Impagado recibos domicil. SEPA devolución recibo"). `payment_refund` (+) es heterogéneo (devolución Hacienda, devolución compra, retrocesión comisiones) → neutral, fuera de `cobros_op` ✅ |

`caja_op = cobros_op − pagos_op`. Ventana por defecto: 6 meses móviles.

### 1.2 Bloque A — Capacidad de deuda · peso 45 ✅

| Id | Variable | Negocio | Técnica | Mejor | Cobertura |
| --- | --- | --- | --- | --- | --- |
| A1 | Margen de caja | ¿Queda caja tras pagar la operación? | `Σ6m caja_op / Σ6m cobros_op` | alto | todas |
| A2 | Meses en déficit | ¿Es habitual gastar más de lo que cobra? | `#meses(cobros_op < pagos_op) / meses obs.` | bajo | todas |
| A3 | Cobertura de deuda | ¿La caja cubre las cuotas? | `Σ6m caja_op / Σ6m servicio_deuda`; sin cuotas → no disponible | alto | 524 emp. |
| A4 | Carga de deuda existente | ¿Cuánto de lo cobrado ya está comprometido? | `Σ6m (servicio_deuda + amort_credito) / Σ6m cobros_op` | bajo | 524 + línea |
| A5 | Dependencia de crédito | ¿Vive de tirar de la línea? | `Σ6m disp_credito / Σ6m cobros_op` | bajo | emp. con línea |

`outstanding` de `debt_products` solo sirve para `t = 2026-08` (foto). Deuda
existente mes a mes = A4 (proxy por cuotas).

**Healthy threshold A** ✅: A1 ≥ 10 % · A2 ≤ 1/6 · A3 ≥ 1,3 · A4 ≤ 25 % ·
A5 ≤ 20 %. Subscore A ≥ 70 = sana.

### 1.3 Bloque B — Fiabilidad · peso 30 ✅

Obligación recurrente = pago con categoría en `obligaciones_rec` que aparece
≥ 3 de los últimos 6 meses. Importe esperado = mediana de esos pagos (si hay
cuadro en `debt_schedule_config`, se usa el cuadro).

| Id | Variable | Negocio | Técnica | Mejor | Cobertura |
| --- | --- | --- | --- | --- | --- |
| B1 | Cumplimiento acumulado | ¿Paga lo que debe, aunque sea tarde? | `Σ pagado hasta t / Σ esperado hasta t`, últimos 6 m, cap 1 | alto | 1.157 (tax/SS) · 817 (nómina) · 524 (deuda) |
| B2 | Racha de retraso | ¿Cuántos meses seguidos lleva sin pagar una obligación esperada? | streak actual de meses con esperado > 0 y pagado = 0 | bajo | idem |
| B3 | Puntualidad con proveedores | ¿Paga facturas a tiempo? | mediana `payment_date − due_date`, facturas proveedor (`amount < 0`) `paid` en 6 m | bajo | ≤ 1.093 |

**Edge case (salta un mes, paga dos juntos):** B1 vuelve a 1 al mes
siguiente → sin penalización de importe. B2 registra racha 1 → penalización
pequeña que decae en 3 meses. Racha ≥ 2 → fuerte. Ni un mes suelto ni un
adelanto convierten a la empresa en morosa; dos seguidos sí. ✅

### 1.4 Bloque C — Dependencia clientes/proveedores · peso 25 ✅

| Id | Variable | Negocio | Técnica | Mejor | Cobertura |
| --- | --- | --- | --- | --- | --- |
| C1 | Concentración clientes | ¿Depende de pocos clientes? | top-3 `counterparty_id` en `cobros_op` / cobros identificados, 12 m | bajo | contrapartes con id |
| C2 | Concentración proveedores | ¿Depende de pocos proveedores? | top-3 en `pagos_op` / pagos identificados, 12 m | bajo | idem |
| C3 | Retraso de cobro | ¿Sus clientes pagan tarde? | mediana `payment_date − due_date`, facturas cliente (`amount > 0`) `paid` en 6 m | bajo | ≤ 1.093 |
| C4 | Vencido sin cobrar | ¿Acumula facturas vencidas? | importe cliente con `due_date ≤ fin(t)` sin pago a fin(t) / vencido en 6 m | bajo | ≤ 1.093 |
| C5 | Volatilidad de cobros | ¿Es predecible la entrada? | `MAD / mediana` de `cobros_op` mensual, 6-12 m | bajo | todas |
| C6 | Recibos devueltos por clientes | ¿Sus clientes le devuelven recibos? | `Σ6m collection_refund / Σ6m cobros_op` ✅ | bajo | 427 emp. |

Facturas: solo `document_type = invoice`; pago real solo si `status = paid`
(en 96 % de no pagadas `payment_date == due_date`, no es un pago).
Dirección: `amount > 0` = factura a cliente, `amount < 0` = factura de
proveedor. Verificado cruzando contrapartes con el banco: 90 % de las
contrapartes con facturas positivas cobran por `collection`, 92 % de las
negativas se pagan por `payment` ✅.

### 1.5 Agregación y umbrales

```text
subnota_v   = escala 0-100 (p5/p95 congelados, invertida si "bajo")
nota_ef_v   = 50 + conf_v × (subnota_v − 50)
subscore_X  = media ponderada de nota_ef_v en el bloque      (pesos intra-bloque iguales ✅)
score_solo  = 0,45·A + 0,30·B + 0,25·C                      ✅
score       = score_solo + aval_grupo                        (§1.7)
confianza   = misma media ponderada sobre conf_v
```

| Estado | Regla ✅ |
| --- | --- |
| Sana | `score ≥ 70` y `confianza ≥ 0,5` |
| Vigilar | `45 ≤ score < 70` |
| Riesgo | `score < 45` o racha B2 ≥ 2 |
| Sin datos | `confianza < 0,3` → no se opina |

### 1.6 Métricas de evolución (input de la decisión)

| Métrica | Definición |
| --- | --- |
| `tend_score_3m` | `score(t) − score(t−3)` |
| `tend_A/B/C_3m` | idem por bloque |
| `direccion` | mejora si `tend ≥ +6`, deterioro si `≤ −6`, si no estable ✅ |
| `naturaleza` | estructural si dirección igual 2 meses seguidos **y** ≥ 2 variables mueven en el mismo sentido **y** alguna de A1-A3 entre ellas; si no, temporal |
| `racha_deficit` | meses seguidos con `caja_op < 0` |
| `delta_contrib` | `score(t) − score(t−1)` descompuesto exacto por variable |

### 1.7 Bloque D — Riesgo de grupo (aval y contagio)

Founder Embat: el riesgo de una filial depende del grupo, y al revés. El
hijo con hipoteca no es el mismo riesgo si el padre avala. **En el dataset
es la norma, no la excepción:** 1.215 de 1.286 empresas están en grupos de
2-22 empresas; solo 71 van solas. No hay jerarquía matriz/filial → "el
padre" = resto del grupo ponderado por tamaño.

Datos: `companies.group_id` · traspasos intragrupo emparejables (misma
empresa-grupo, mismo importe, signo opuesto, mismo día): 8.839 pares, 420 M€,
299 empresas · préstamos `custom` (`Other (customer-defined)`: 171
préstamos intragrupo/socios en 33 empresas).

| Id | Variable | Negocio | Técnica | Cobertura |
| --- | --- | --- | --- | --- |
| D1 | Peso en el grupo | ¿Es la filial grande o pequeña dentro del grupo? | `cobros_op empresa / Σ cobros_op grupo`, 12 m | grupos ≥ 2 |
| D2 | Score del resto del grupo | ¿Cómo está "el padre"? | media de `score_solo` de las demás empresas, ponderada por `cobros_op` | idem |
| D3 | Capacidad de aval | ¿El padre tiene dinero para cubrir a la filial? | `Σ capacidad_cuota_adversa del resto / (servicio_deuda + obligaciones_rec) media 6 m de la empresa` | idem |
| D4 | Soporte observado | ¿Ya le inyectan caja? | entradas intragrupo netas (traspasos emparejados + préstamos `custom`) / `cobros_op`, 12 m. Negativo = sostiene al grupo | 299 emp. |
| D5 | Interdependencia | ¿Cuánto está enganchada al grupo? | traspasos intragrupo brutos ambos sentidos / (`cobros_op + pagos_op`), 12 m | idem |

```text
w          = w_max × min(1, D5 / 0,2)                  ✅ w_max = 0,4 ; grupo de 1 → w = 0
si D2 > score_solo (aval):     aval_grupo = w × min(1, D3 / 2) × (D2 − score_solo)   ← el padre tiene que tener dinero
si D2 < score_solo (contagio): aval_grupo = w × (D2 − score_solo)                    ← un grupo débil arrastra siempre
|aval_grupo| ≤ 20 puntos                                ✅
```

- Cascada muestra "Aval de grupo +X" o "Contagio de grupo −X" como una
  contribución más. Confianza D baja si las hermanas tienen poca historia.
- `score_grupo` = mismo motor sobre flujos consolidados del grupo
  (traspasos intragrupo eliminados). Se usa en cartera y como techo (§2).
- Empresa test sin hermanas en el dataset → `w = 0`, se avisa en `cobertura`.

---

## 2. Previsión — el score dentro de 3 y 6 meses

Entrada: `company_month_score`. Salida: `company_month_forecast`. Todo
validado 19-09 (decisiones 34-38). Detalle en `forecast-engine.md`.

| Qué | Regla |
| --- | --- |
| Horizontes ✅ | `score_pred_3m`, `score_pred_6m`, banda prevista, intervalo p10/p90, 3 drivers, `prob_deterioro_6m`. 3 y 6 porque el plazo máximo del producto son 180 días. |
| Método v1 ✅ | Proyección determinista: cada variable bruta sigue su tendencia robusta de 6 meses (mediana de deltas, amortiguada a la mitad en meses 4-6) y se recalcula el score con la misma fórmula. Explicable por construcción: la cascada prevista es la misma cascada. |
| v2 ✅ | Modelo entrenado solo si en validación mejora el MAE a 3 meses ≥ 15 % y el acierto de banda. Receta de `analysis/FINDINGS.md` §7; coordinar con Alex. |
| Intervalo y probabilidad ✅ | p10/p90 = percentiles del error de v1 en ajuste, por horizonte y banda actual. `prob_deterioro_6m` = frecuencia observada del evento en ajuste por (banda actual, banda prevista). No es probabilidad de impago. |
| Uso en decisión ✅ | Solo endurece: `T_max` con la peor de banda actual y prevista · `reducir` preventivo si banda prevista < actual dos meses seguidos · `ampliar` solo si banda prevista ≥ actual · +0,5 pp si banda prevista < actual. Una previsión buena no amplía ni abarata sola. |
| Backtest ✅ | MAE y acierto de banda contra baseline ingenuo (`score_pred = score`); cobertura del intervalo 75-85 %; lead time del cierre con y sin previsión; falsas reducciones preventivas. Si v1 no bate al baseline, la previsión no se conecta a decisión. |

---

## 3. Decisión — ¿te puedo prestar? · cuánto · plazo · interés

Entrada: fila del score (§1). Salida por empresa-mes: `elegible`, `motivo`,
`L` (límite), `menu[]` de opciones (plazo, cantidad máx, TAE), `accion`.
Todo validado 19-09 (decisiones 11, 12, 17-23).

```text
0. Elegibilidad   ¿te puedo prestar?        → sí / no + motivo
1. Cantidad       límite máximo L           → §3.1
2. Plazo          tenor máximo T_max        → §3.2
3. Interés        TAE de cada (cantidad, plazo) → §3.3
Dependencia: región factible (cantidad, plazo) + precio función de ambas → §3.4
```

### 3.0 Elegibilidad ✅

Puertas duras, todas deben pasar. La primera que falla es el `motivo`.

| Puerta | Regla | Por qué |
| --- | --- | --- |
| Historia | `confianza ≥ 0,5` (≈ 6 meses con movimientos) | Sin historia no hay opinión |
| Estado | `score ≥ 45` | Estado riesgo (5) |
| Fiabilidad | racha B2 < 2 | Dos meses sin pagar = impago real (7) |
| Caja | `racha_deficit < 3` y `capacidad_cuota_adv > 0` | La caja estresada debe cubrir las cuotas actuales con margen |
| Clientes | C4 vencido sin cobrar ≤ 40 % | Cobros futuros comprometidos (12) |
| Grupo | sin cross-default activo | Si cae quien sostiene el grupo, el aval no vale (17) |

### 3.1 Cantidad: límite L ✅

```text
capacidad_cuota_adv = max(0, (0,8·cobros_op − 1,1·pagos_op)_media6m / 1,3 − servicio_deuda_media6m)
limite_cap          = capacidad_cuota_adv × 12
limite_op           = 0,8 × media3m(cobros_op) × 3
L                   = min(limite_cap, limite_op) × factor_banda × min(1, confianza / 0,6)
```

| Banda | score | factor_banda | base_TAE |
| --- | --- | --- | --- |
| A | ≥ 75 | 1,0 | 5 % |
| B | 60-75 | 0,7 | 7 % |
| C | 45-60 | 0,4 | 10 % |
| D | < 45 | 0 | no presta |

Deterioro estructural baja una banda. Grupo: `Σ L del grupo ≤ L sobre
flujos consolidados` (el aval no se cuenta dos veces).

### 3.2 Plazo: T_max por banda y tendencia ✅

| Banda | Estable / mejora | Deterioro temporal | Deterioro estructural |
| --- | --- | --- | --- |
| A | 180 d | 120 d | 60 d |
| B | 120 d | 90 d | 30 d |
| C | 60 d | 30 d | no presta |

La banda de esta tabla es la **peor** de la actual y `banda_pred_3m` (§2).

Por qué: peor score → menos exposición al futuro y más rotación, es decir
más veces que re-evaluamos antes de que algo se rompa.

### 3.3 Interés ✅

```text
TAE = base_TAE(banda) + prima_plazo + prima_confianza + ajuste_tendencia
prima_plazo      = +0,5 pp por cada 30 días por encima de 30
prima_confianza  = +1 pp si confianza < 0,7
ajuste_tendencia = −0,5 pp si mejora · +1 pp si deterioro
prima_prevision  = +0,5 pp si banda_pred_3m < banda actual
coste_operacion  = cantidad × TAE × plazo / 360
```

### 3.4 Dependencia cantidad-plazo: región factible ✅

```text
cantidad ≤ L                                       (paso 1)
cantidad ≤ capacidad_cuota_adv × plazo_meses       (se devuelve con caja estresada dentro del plazo)
plazo    ≤ T_max                                   (paso 2)
```

Plazo corto → cantidad pequeña. Plazo largo → cantidad se acerca a L pero
el interés sube. El producto enseña el menú, la empresa elige el punto:

| Plazo | Cantidad máx | TAE |
| --- | --- | --- |
| 30 d | `min(L, cap_adv × 1)` | base |
| 60 d | `min(L, cap_adv × 2)` | base + 0,5 |
| 90 d | `min(L, cap_adv × 3)` | base + 1,0 |
| … hasta T_max | | |

### 3.5 Un solo límite, dos usos ✅

`L` sirve para **anticipar cobros** (plazo natural = días hasta el cobro
esperado, C3) o **aplazar pagos** (plazo = días de aplazamiento al
proveedor). Ambos dentro de `T_max`. Sin sublímites: más simple y el score
no distingue usos.

### 3.6 Revisión mensual: acción, histéresis, reapertura ✅

| Acción | Regla |
| --- | --- |
| `abrir` | `L_prev = 0`, elegible, `L > 0` |
| `ampliar` | `L > 1,15 · L_prev`, dirección ≠ deterioro y `banda_pred_3m ≥` banda actual |
| `reducir` | `L < 0,85 · L_prev` dos meses seguidos, o deterioro estructural (inmediato), o **preventivo**: `banda_pred_3m` < banda actual dos meses seguidos (L se recalcula con la banda prevista) |
| `cerrar` | no elegible (§3.0) |
| `mantener` | resto |

- Cambio de `L` acotado a ±25 %/mes salvo `cerrar`: el grifo no oscila con
  un mes ruidoso.
- Cierre no borra lo dispuesto: sin nuevas disposiciones, lo vivo se
  devuelve a su vencimiento.
- Reapertura: elegible de nuevo tras 2 meses seguidos pasando todas las
  puertas.
- Cross-default: si una empresa con `D1 ≥ 0,3` pasa a `cerrar`, el resto
  del grupo baja una banda y su `aval_grupo` se recalcula sin ella.

---

## 4. Producto

Comprador ✅: Embat vende financiación embebida a sus pymes con un partner
financiero que pone el dinero y paga por límite vivo monitorizado.
Usuario principal de la demo ✅: analista de riesgo del partner mirando la
cartera. Vista pyme solo si sobra tiempo.

### 4.1 Pantallas ✅ (cuatro, no más)

| Pantalla | Qué enseña | Lee |
| --- | --- | --- |
| Cartera | Tabla de empresas: score, estado, dirección, límite vigente, acción del mes, alertas. Filtros por estado / acción / grupo. Totales: exposición, nº en riesgo. Feed de alertas con `desde_mes`. | `company_month_score` + `company_month_decision` |
| Ficha empresa | Score y confianza · cascada "por qué" (14 variables + grupo) · evolución 24 meses · menú (plazo, cantidad máx, TAE, desglose) · acción y motivo · alertas · bloque grupo (aval/contagio, hermanas) | idem |
| Grupo | Hermanas con D1 y score, score consolidado, techo de grupo, cross-default | idem |
| Backtest | Lead time, recall, falsas alarmas, exposición evitada, simetría en recuperación | métricas scoring §13 y decision §14 |

Sin simulador "qué pasa si pido X": el menú ya lo es. La UI no calcula
nada: pinta las dos tablas.

### 4.2 Selector de mes ✅

Slider `2024-09 … 2026-08` global. Toda pantalla es "a cierre de mes t".
Es lo que enseña anticipación: en `t` alertamos, en `t+k` pasó.

### 4.3 Golden path de demo ✅ (90 s, tres empresas fijas elegidas del backtest)

1. Cartera en un mes `t`: filtro "deterioro" → empresa **X** con alerta desde `t−3`.
2. Ficha X: cascada señala margen y dependencia de línea; acción `reducir`.
   Slider a `t+3`: déficit tres meses. Anticipamos `k` meses.
3. Empresa **Y** en mejora: acción `ampliar`, menú con TAE bajando.
4. Grupo **Z**: filial sana con contagio; hermana cerrada; techo de grupo.

X, Y, Z salen del backtest, no se inventan. Datos precargados, app
pre-calentada, vídeo de respaldo.

### 4.4 Explicación ✅

Sin LLM en v1: cascada + `motivo` por plantilla. Botón "explicar en
palabras" con LLM solo si sobra tiempo, siempre a partir de la cascada,
nunca decidiendo nada.

### 4.5 Alertas ✅ (bonus del reto)

Feed en cartera con `desde_mes`. Webhook a Slack cuando cambia la acción de
una empresa. Email no.

### 4.6 Entrega de las 60-80 empresas test ✅

Script, no pantalla: mismo pipeline, `version_parametros` congelada, CSV con
el contrato de scoring §10 + decision §10. La cartera puede cargarlas como
"cartera test" para la demo.

### 4.7 Fuera de alcance ✅

Login, multi-tenant, disposiciones y amortizaciones reales, pagos, vista
pyme (salvo tiempo), edición de parámetros desde UI.

### 4.8 Nombre ✅

**Embat Flow.** Va en submission, cabecera de la app y slide. Se presenta
como producto embebido de Embat; en el pitch se dice explícitamente que el
nombre es una propuesta, no una marca autorizada.

---

## 5. Registro de decisiones (source of truth)

Estado: ✅ validado (Pablo, fecha) · ⏳ aplazado · ☐ pendiente. La
justificación se escribe siempre, validada o no: es lo que defendemos ante
el jurado.

| # | Decisión | Justificación | Estado |
| --- | --- | --- | --- |
| 1 | Divisas: todo a € con la regla de §1.0 | Score comparable entre empresas y grupos; `exchange_rate` verificado en datos (USD→EUR 1,16, GBP→EUR 0,86, NOK→EUR 11) como unidades de moneda del producto por unidad de moneda de la empresa. | ✅ 18-09 |
| 2 | Categoría `-`: usar reclasificación de #12 con `category_confidence ≥ 0,95`; resto sin clasificar | #12 recupera el 50,5 % del volumen sin categoría con solo el 15,7 % de las filas, a 95 % de precisión contra etiquetas originales, y guarda confianza por transacción. Lo ambiguo queda `unknown` y baja la confianza del score en vez de contaminarlo. Sin esto, muchas empresas caen bajo `confianza < 0,5` y el producto no tiene a quién prestar. Excepción (decisión de diseño a revisitar): `debt_drawdown` y `balance_adjustment` se aceptan con confianza 0,90 porque #12 les asigna ese valor fijo sin precisión estimada; revisar cuando haya etiquetas para medirla. | ✅ 19-09 · ⏳ revisitar excepción |
| 3 | Pesos de bloque A 45 / B 30 / C 25 | Producto de crédito: primero si la caja aguanta más cuota, segundo si paga lo que ya debe, tercero si el negocio depende de pocos clientes. Juicio de negocio, no estadístico; se revisa en backtest. | ✅ 19-09 |
| 4 | Pesos intra-bloque iguales | Fácil de explicar y defender; sin datos de impago no hay base para diferenciarlos. Cambiar solo con evidencia del backtest. | ✅ 19-09 |
| 5 | Umbrales sanos A1-A5 y estados sana ≥ 70 / vigilar 45-70 / riesgo < 45 | Permite decir en la ficha "14 %, sano (umbral 10 %)". Números de sentido común bancario (cobertura 1,3 es estándar de DSCR); se calibran en backtest para que ~20 % de la cartera caiga en riesgo. | ✅ 19-09 |
| 6 | Fiabilidad sobre deuda + impuestos + SS + nómina | Solo 524 empresas tienen cuotas visibles (70 con un solo mes); impuestos/SS en 1.157. Sin ampliar, media cartera sin dato. Dejar de pagar la SS es señal de estrés más fuerte que una cuota. | ✅ 19-09 |
| 7 | Edge case: importe acumulado sin castigo si recupera; racha 1 leve y decae en 3 m; racha ≥ 2 fuerte | Separa retraso administrativo de impago real. Un mes suelto que se recupera no es morosidad; dos seguidos sí. | ✅ 19-09 |
| 8 | `collection_refund` (−) = recibo devuelto por cliente → C6; `payment_refund` (+) → neutral; B3 "devoluciones propias" eliminada | Sondeo de descripciones: `collection_refund` es en 90 % "Impagado recibos domicil. SEPA devolución recibo" (el cliente no paga). `payment_refund` mezcla devolución de Hacienda, devolución de compras y retrocesión de comisiones: no es señal de impago propio, y contarlo como cobro inflaría ingresos. No hay dato de pagos propios devueltos; B se queda con B1, B2, B3. | ✅ 19-09 |
| 9 | `amount > 0` = factura a cliente; `< 0` = de proveedor | Cruce contraparte factura ↔ banco: 8.260 de 9.154 contrapartes con facturas positivas cobran por `collection` (90 %); 11.325 de 12.247 con negativas se pagan por `payment` (92 %). Umbral de aceptación era 80 %. | ✅ 19-09 |
| 10 | Dirección ±6 puntos y regla temporal/estructural | ±6 calibrado para ~15 % de empresa-mes en cada cola. Estructural exige persistencia 2 meses + ≥ 2 variables + una de nivel (A1-A3): evita alertas por un mes ruidoso. | ✅ 19-09 |
| 11 | Límite: cobertura 1,3 · estrés −20 %/+10 % · anticipo 80 % × 3 m | Cobertura y estrés siguen la guía EBA de análisis bajo escenario adverso. El anticipo ata el límite al circulante real: no se presta más de lo que la empresa cobra. | ✅ 19-09 |
| 12 | Bandas A/B/C/D, precios 5/7/10 %, cierres duros, histéresis ±25 % | Precios ilustrativos para la demo. Histéresis evita que el grifo oscile con un mes ruidoso. Cierres duros: 3 meses de déficit, racha ≥ 2, vencido > 40 %. | ✅ 19-09 |
| 13 | Comprador y usuario | Embat tiene la conexión bancaria y ERP; el límite mensual es producto sobre datos que ya cobra. Partner financiero paga por límite vivo monitorizado. | ✅ 19-09 |
| 14 | Grupo como ajuste sobre `score_solo`, no cuarto bloque | Founder Embat: riesgo de filial y grupo son interdependientes. El aval es propiedad de la relación, no de la empresa; como ajuste se ve en la cascada y se puede apagar. 94 % de la cartera está en grupos. | ✅ 19-09 |
| 15 | `w_max = 0,4` · saturación 20 % · tope ±20 puntos | El grupo puede mover el score pero nunca sustituirlo: una filial mala con padre rico sigue siendo vigilada. | ✅ 19-09 |
| 16 | Aval exige capacidad (D3); contagio no | El padre solo avala si tiene dinero. Un grupo débil arrastra siempre: hace barridos de caja. Asimetría deliberada. | ✅ 19-09 |
| 17 | Techo de grupo y cross-default al 30 % | El aval no se cuenta dos veces entre filiales. Si cae quien sostiene el grupo, el aval desaparece. | ✅ 19-09 |

| 18 | Elegibilidad = 6 puertas duras, primera que falla es el motivo | Sí/no antes de cuánto: sin historia, en riesgo, con impago real, sin caja estresada, con clientes que no pagan o con el grupo cayendo, no se presta. Reglas explícitas y explicables, sin umbral de score compuesto. | ✅ 19-09 |
| 19 | Región factible: `cantidad ≤ L` y `cantidad ≤ capacidad_cuota_adv × plazo_meses` | La empresa debe poder devolver lo prestado con caja estresada dentro del plazo. Es la dependencia central entre cantidad y plazo: corto → poco, largo → más pero más caro. | ✅ 19-09 |
| 20 | T_max por banda (180/120/60 d) y recorte por deterioro según la tabla de §3.2 (temporal y estructural acortan el plazo dentro de la misma banda) | Peor score → menos exposición al futuro y más rotación: re-evaluamos más veces antes de que algo se rompa. Estructural en C no presta. | ✅ 19-09 |
| 21 | TAE = base banda + 0,5 pp/30 d + 1 pp si confianza < 0,7 ± tendencia | Precio sube con plazo (más exposición), con incertidumbre (menos datos) y con deterioro; baja con mejora. Aditivo para poder explicarlo en la ficha componente a componente. | ✅ 19-09 |
| 22 | Un solo límite para anticipar cobros y aplazar pagos | El score no distingue usos; dos sublímites duplican lógica y pantalla. El uso solo fija el plazo natural. | ✅ 19-09 |
| 23 | Reapertura tras 2 meses elegible; cierre no borra lo dispuesto | Evita abrir/cerrar mes a mes; lo vivo se devuelve a vencimiento como en cualquier línea. | ✅ 19-09 |
| 24 | Espejos intragrupo emparejados sobre todas las categorías, no solo `transfer` | Análisis #12/#9: solo un tercio de los traspasos intragrupo va como `transfer`; el resto va como `payment`, `collection` o sin categoría, colado dentro del margen operativo. Sin emparejar por importe/fecha/signo, prestaríamos contra dinero de la matriz. Restringir a ≥ 1.000 € no mueve el volumen: dominado por importes grandes, coincidencia casual improbable. | ✅ 19-09 |
| 25 | Usuario principal de la demo: analista de cartera del partner | El jurado es Embat y VCs: la cartera enseña anticipación y producto a la vez; la vista pyme enseña una tarjeta. | ✅ 19-09 |
| 26 | Cuatro pantallas: cartera, ficha, grupo, backtest; sin simulador | Cada pantalla responde a una pregunta del reto. El menú ya es el simulador. La UI no calcula: pinta dos tablas. | ✅ 19-09 |
| 27 | Selector de mes global | Toda pantalla "a cierre de mes t". Sin él no se puede enseñar que alertamos antes de que pasara. | ✅ 19-09 |
| 28 | Golden path 90 s con tres empresas fijas del backtest | Una historia de deterioro anticipado, una de mejora, una de grupo. Reales, no inventadas: el jurado puede preguntar por ellas. | ✅ 19-09 |
| 29 | Sin LLM en la explicación v1 | Embat: "el modelo interpreta, el código determinista actúa". Un LLM decidiendo en su demo es un no. Opcional solo para redactar a partir de la cascada. | ✅ 19-09 |
| 30 | Alertas: feed en cartera + webhook Slack; email no | Cubre el bonus con el mínimo. Slack se enseña en directo; email no. | ✅ 19-09 |
| 31 | Entrega test por script, no por pantalla | El entregable es un CSV con el contrato; una pantalla de subida es trabajo sin valor para el jurado. | ✅ 19-09 |
| 32 | Fuera de alcance: login, multi-tenant, disposiciones, pagos, vista pyme, parámetros desde UI | Nada que no salga en el golden path. | ✅ 19-09 |
| 33 | Nombre: **Embat Flow** | Coherente con la decisión 13 (producto embebido de Embat): el jurado de Embat ve su producto, no una herramienta de banco. Riesgo asumido: usar su marca sin permiso; se declara como propuesta en el pitch. | ✅ 19-09 |
| 34 | Previsión a 3 y 6 meses: score, banda, intervalo, drivers, prob. deterioro | El plazo máximo del producto es 180 días; más allá no cambia la decisión de hoy. Motor separado entre scoring y decisión, con su propio contrato. | ✅ 19-09 |
| 35 | v1 proyección determinista de variables; v2 modelo solo si el backtest lo justifica | Explicable por construcción y se implementa en horas. Un modelo entrenado sin tiempo de validar es ruido con autoridad. Receta v2 ya existe (FINDINGS §7). | ✅ 19-09 |
| 36 | Intervalo y probabilidad desde residuos y frecuencias del backtest | Sin inventar dispersión. Se declara que no es probabilidad de impago. | ✅ 19-09 |
| 37 | La previsión solo endurece: plazo, reducción preventiva a 2 meses, ampliar condicionado, +0,5 pp | Coste de una previsión ruidosa = cerrar grifos sanos; por eso exige dos meses y nunca sube. Una previsión buena no sustituye a verlo pasar. | ✅ 19-09 |
| 38 | Backtest contra baseline ingenuo; si no lo bate, no se conecta | La previsión tiene que demostrar valor en meses de anticipación, no en sofisticación. | ✅ 19-09 |

**Estado 19-09:** 38 de 38 decisiones validadas. Ninguna abierta.

**Revisitar:** decisión 2, excepción de confianza 0,90 para las
categorías nuevas de #12. Y la cuota esperada de `debt_repayment`
(scoring-engine §5.2), que usa `outstanding_balance` de
`debt_schedule_config.csv` —una foto final— para el término de interés,
en contra de la regla de «sin foto final»: desviación pequeña y aceptada.
