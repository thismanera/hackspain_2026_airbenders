# Motor de scoring — especificación para desarrollo v1.0

> Implementa §1 de [`SOURCE.md`](./SOURCE.md) (decisiones 1-10, 14-16, 24,
> validadas 18/19-09-2026). Si algo aquí contradice a
> `SOURCE.md`, manda `SOURCE.md` y se corrige esto. Determinista, sin LLM.
> Su salida (`company_month_score`, §10) es la entrada del
> [`decision-engine.md`](./decision-engine.md). Este motor **no sabe que
> existe el crédito**: no calcula límites, plazos ni precios.

## 0. Qué hace

Por cada empresa y cierre de mes:

1. Convierte el dataset en flujos mensuales en € (§3-4).
2. Calcula 14 variables en tres bloques, cada una con su confianza (§5).
3. Las normaliza y agrega en `scoreSolo` 0-100 y `confianza` 0-1 (§6).
4. Conserva `scoreSolo` como única capacidad autónoma y calcula `scoreGrupo` con `ajusteHolding` (§7).
5. Deriva evolución: tendencia, dirección, temporal/estructural, rachas,
   descomposición exacta del cambio (§8).
6. Emite alertas de señal (§9) y una fila de salida con todo lo anterior (§10).

Responde a las seis preguntas del reto: sanas, mejoran, empeoran,
temporal/estructural, por qué, con cuánta antelación (§13).

## 1. Entradas

| Fichero                                           | Campos usados                                                                                                                                                         |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `companies.csv`                                   | `company_id`, `group_id`, `currency`                                                                                                                                  |
| `banking_products.csv`                            | `product_id`, `company_id`, `type`, `currency`                                                                                                                        |
| `debt_products.csv`                               | `product_id`, `company_id`, `type`, `service`, `currency`                                                                                                             |
| `debt_schedule_config.csv`                        | `product_id`, `amortising_frequency`, `granted_balance`, `total_periods`, `outstanding_balance`, `annual_interest_rate_or_spread`                                     |
| `transactions.csv`                                | `company_id`, `product_id`, `transaction_id`, `date`, `amount`, `exchange_rate`, `status`, `counterparty_id`                                                          |
| `analysis/…/transaction_categories.parquet` (#12) | `transaction_id`, `category_final`, `category_confidence` (sustituye a `transactions.category`)                                                                       |
| `invoices.csv`                                    | `company_id`, `document_type`, `issuance_date`, `due_date`, `payment_date`, `amount`, `currency`, `accounting_currency`, `exchange_rate`, `status`, `counterparty_id` |

No se usan: `balances.csv`, `debt_products.granted/outstanding/liquidity`,
`invoices.pending_amount`, `description`, `concept`. Son fotos finales o
texto libre.

## 2. Parámetros (versionados, un solo fichero)

Todos los números viven en la tabla de parámetros con `version_parametros`
(hash). Los percentiles p5/p95 por variable forman parte de la versión.

| Grupo                            | Parámetro                                                        | Valor                                        | Decisión |
| -------------------------------- | ---------------------------------------------------------------- | -------------------------------------------- | -------- |
| Tiempo                           | `mes_inicio` / `mes_fin`                                         | `2024-09` / `2026-08`                        | 1.0      |
|                                  | `ventana_corta` / `ventana_larga` (meses)                        | 6 / 12                                       | 1.1      |
| Espejos                          | misma fecha, importe al céntimo, signo opuesto                   |                                              | 24       |
| Categorías                       | `category_confidence_min`                                        | 0,95                                         | 2        |
| Pesos                            | `peso_A` / `peso_B` / `peso_C`                                   | 0,45 / 0,30 / 0,25                           | 3        |
|                                  | pesos intra-bloque                                               | A 10/10/10/8/7; B 12/12/6; C 1,5/1,5/4/8/3/7 | 4        |
| Confianza                        | `n_facturas_ref`                                                 | 5                                            | 1.0      |
|                                  | `conf_sin_datos`                                                 | 0,3                                          | 5        |
|                                  | `conf_sana`                                                      | 0,5                                          | 5        |
| Estados                          | `score_sana` / `score_riesgo`                                    | 70 / 45                                      | 5        |
| Umbrales sanos A                 | A1 ≥ 0,10 · A2 ≤ 1/6 · A3 ≥ 1,3 · A4 ≤ 0,25 · A5 ≤ 0,20          |                                              | 5        |
| Fiabilidad                       | `recurrencia_min` (meses presentes de 6)                         | 3                                            | 6        |
|                                  | `subnota_racha_1` / `decaimiento_meses`                          | 70 / 3                                       | 7        |
| Evolución                        | `umbral_direccion` (puntos en 3 m)                               | 6                                            | 10       |
|                                  | `persistencia_estructural` (meses)                               | 2                                            | 10       |
|                                  | `min_variables_estructural`                                      | 2                                            | 10       |
|                                  | `delta_aportacion_min` (puntos)                                  | 1                                            | 10       |
| Grupo                            | `w_max` / `D5_saturacion` / `aval_max` / `D3_ref`                | 0,4 / 0,2 / 20 / 2                           | 15, 16   |
| Estrés (compartido con decisión) | `estres_cobros` / `estres_pagos` / `cobertura_min`               | 0,8 / 1,1 / 1,3                              | 11       |
| Escalas                          | `p5[v]`, `p95[v]` por variable                                   | calibrados §11                               | 1.0      |
| Divisas                          | tabla mensual `tasa[moneda][mes]` → EUR + tabla fija de respaldo | calibrada §3.2                               | 1        |

## 3. Etapa A — Carga y normalización

### 3.1 Filtros

```text
transactions: status == "booked"
              product_id ∈ banking_products con type ∈ {checking, saving, wallet}   → flujos operativos
              product_id ∈ debt_products con type == "lineofcredit"                 → flujos de crédito
              resto de productos (card, tpv, expensesPlatform, loan, …) y product_id desconocido → fuera, contado en cobertura
invoices:     document_type == "invoice"; status ∈ {paid, overdue, pending, payment_in_progress}
```

### 3.2 Divisas: todo a €

```text
function a_eur(amount, exchange_rate, moneda_empresa, mes, par):
    # paso 1: a moneda de la empresa
    r = exchange_rate if exchange_rate not in (null, 0) else mediana_tasa[par][mes]
    if r is null: return null                       # se excluye; cuenta en cobertura
    importe_empresa = amount / r
    # paso 2: a EUR
    if moneda_empresa == "EUR": return importe_empresa
    t = tasa[moneda_empresa][mes]  or  tasa_fija[moneda_empresa]
    if t is null: return null
    return importe_empresa * t
```

- `exchange_rate` = unidades de la moneda del producto/factura por 1 unidad
  de la moneda de la empresa (verificado: USD→EUR 1,16, GBP→EUR 0,86,
  NOK→EUR 11).
- `tasa[X][mes]` (€ por 1 X) se construye una vez: mediana mensual de
  `exchange_rate` en facturas con `currency = X, accounting_currency = EUR`
  (invertida) y con `currency = EUR, accounting_currency = X`. Se guarda en
  la versión de parámetros. Respaldo: tabla fija en el repo.
- Moneda de la empresa: `companies.currency`.

### 3.3 Clasificación de cada movimiento

| Clase                            | Condición                                                                                                                                             | Va a                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `cobro_op`                       | cuenta operativa, `category ∈ {collection, bulk_collection, pos_settlement, cash_settlement, cash_settlements}`, `amount > 0`                         | `cobros_op`                                                                                                         |
| `pago_op`                        | cuenta operativa, `category ∈ {payment, bulk_payment, utility, salary, social_security, tax, fee}`, `amount < 0`                                      | `pagos_op` (y `obligaciones_rec[cat]` si `cat ∈ {tax, social_security, salary}`)                                    |
| `servicio_deuda`                 | cuenta operativa, `category ∈ {debt_repayment, interest_charge}`, `amount < 0`                                                                        | `servicio_deuda` (y `obligaciones_rec[debt_repayment]`)                                                             |
| `recibo_devuelto`                | `category == collection_refund`, `amount < 0`                                                                                                         | `recibos_devueltos`                                                                                                 |
| `disp_credito` / `amort_credito` | producto `lineofcredit`, `amount > 0` / `< 0`                                                                                                         | `disp_credito` / `amort_credito`                                                                                    |
| `traspaso_interno`               | **cualquier categoría**, emparejado con otro de la **misma empresa**: mismo `                                                                         | importe_eur                                                                                                         | `al céntimo, signo opuesto, misma`date` | neutral |
| `traspaso_intragrupo`            | **cualquier categoría**, emparejado con otro de **otra empresa del mismo grupo**, misma regla                                                         | `intragrupo_in` / `intragrupo_out`; sale de `cobros_op`/`pagos_op` aunque su categoría fuese `collection`/`payment` |
| `neutral`                        | `transfer` sin pareja, `cash_withdrawal`, `investment_*`, `tax_refund`, `pos_withdrawal`, `payment_refund`, signo inesperado en las clases anteriores | nada; suma en `importe_neutral`                                                                                     |
| `sin_clasificar`                 | `category_final == unknown`                                                                                                                           | nada; suma en `importe_sin_clasificar`                                                                              |

Emparejamiento de espejos (decisión 24): **se ejecuta antes de la
clasificación**, sobre todos los movimientos `booked` sin filtrar por
categoría. Clave `(|importe_eur| al céntimo, date)`; candidatos = movimientos
con signo opuesto y misma clave; se prueba primero la pareja dentro de la
misma empresa, después dentro del grupo; greedy en orden de `transaction_id`,
cada movimiento se empareja como mucho una vez. Lo emparejado no entra en
ninguna otra clase. **Solo se emparejan movimientos de cuentas operativas**
(`checking`, `saving`, `wallet`): una disposición sobre `lineofcredit` y su
abono en la cuenta corriente tienen el mismo importe y la misma fecha, y
emparejarlos como traspaso interno borraría la disposición (`prepareGroup`
filtra con `operatingOnly` antes de llamar a `pairMirrors`). Motivo: solo un tercio de los espejos intragrupo va como
`transfer`; el resto va como `payment`/`collection`/sin categoría (análisis
#9/#12).

Categoría de entrada (decisión 2): `category_final` viene de
`transaction_categories.parquet` (#12): categoría original normalizada si
existe; si no, la inferida cuando `category_confidence ≥ 0,95`; si no,
`unknown`. Mapeo de las categorías nuevas: `balance_adjustment` → neutral;
`debt_drawdown` sobre cuenta operativa → `disp_credito` **solo si la empresa
no tiene ningún producto `lineofcredit`**; si lo tiene, la disposición ya se
contabiliza en los movimientos de la propia línea y el abono en la cuenta va a
neutral (evita contarla dos veces).

Excepción de confianza (a revisitar): `debt_drawdown` y `balance_adjustment` son categorías
de regla de #12 y llegan siempre con `category_confidence = 0,90`; se aceptan
con `≥ PARAMS.categoryConfidenceNuevas` (0,90). El resto sigue exigiendo
`≥ PARAMS.categoryConfidenceMin` (0,95).

### 3.4 Facturas

| Campo derivado            | Regla                                                                     |
| ------------------------- | ------------------------------------------------------------------------- |
| `direccion`               | `amount > 0` → cliente; `amount < 0` → proveedor (verificado 90 % / 92 %) |
| `importe_eur`             | `a_eur(                                                                   | amount  | , exchange_rate, accounting_currency→EUR)` |
| `pagada_en(t)`            | `status == paid` **y** `payment_date ≤ fin(t)`                            |
| `vencida_sin_cobro_en(t)` | `due_date ≤ fin(t)` y no `pagada_en(t)`                                   |
| `retraso_dias`            | `payment_date − due_date`, solo si `pagada_en(t)`; descartar si `         | retraso | > 365`                                     |

`payment_date` de una factura no pagada **no es un pago** (en el 96 % coincide
con `due_date`).

## 4. Etapa B — Flujos mensuales

### 4.1 `company_month_flows` (una fila por empresa × mes con algún movimiento `booked`)

```text
company_id, mes
cobros_op, pagos_op, caja_op = cobros_op − pagos_op
servicio_deuda, disp_credito, amort_credito, recibos_devueltos
obligaciones_rec = {tax, social_security, salary, debt_repayment}   (importe pagado por categoría)
intragrupo_in, intragrupo_out
importe_clasificado = cobros_op + pagos_op + servicio_deuda + recibos_devueltos + disp_credito + amort_credito
importe_neutral, importe_sin_clasificar, importe_excluido (moneda/producto desconocido)
pct_clasificado = importe_clasificado / (importe_clasificado + importe_neutral + importe_sin_clasificar + importe_excluido)
n_mov
cobros_por_contraparte = {counterparty_id: importe}   (solo cobros_op con id)
pagos_por_contraparte  = {counterparty_id: importe}   (solo pagos_op con id)
pct_cobros_identificados, pct_pagos_identificados
```

Importes en € y positivos. Meses sin movimientos no existen en la tabla:
ventana de 6 meses = 6 meses de calendario, `meses_obs` = filas presentes.

### 4.2 `company_month_invoices`

```text
company_id, mes
cli_emitido_6m, cli_vencido_6m, cli_vencido_sin_cobro_t, cli_pagadas_6m [retraso_dias…]
prov_pagadas_6m [retraso_dias…]
n_facturas_cli_6m, n_facturas_prov_6m
```

Todas las ventanas medidas contra `fin(t)`; ninguna factura con
`issuance_date > fin(t)` entra.

### 4.3 `group_month_flows`

Suma de `company_month_flows` de las empresas del grupo, **sin** los
traspasos intragrupo (ya son neutrales) y sin las ventas intragrupo (no
identificables: `counterparty_id` no mapea a `company_id`; limitación
declarada). Campos: `cobros_op_grupo`, `pagos_op_grupo`,
`servicio_deuda_grupo`, `n_empresas_con_datos`.

## 5. Etapa C — Variables

Notación: `Σ6m x` = suma de `x` en los 6 meses de calendario hasta `t`
inclusive; `media6m`, `media3m` = suma / meses de calendario (no / meses
observados). `NA` = no disponible → `subnota = 50`, `conf = 0`.

Confianza de cada variable:

```text
conf_v = c_ventana × c_cobertura × c_dato
c_ventana   = meses_obs_en_ventana / meses_ventana
c_cobertura = media de pct_clasificado en la ventana         (variables de transacciones)
            = min(1, n_facturas / n_facturas_ref)             (variables de facturas)
            = pct_cobros_identificados (o pagos)               (variables de contrapartes)
c_dato      = 0 si NA, 1 si calculable
```

### 5.1 Bloque A — Capacidad de deuda (peso 0,45)

```text
A1 margen_caja        = Σ6m caja_op / Σ6m cobros_op                         ; NA si Σ6m cobros_op == 0       ; mejor alto
A2 meses_deficit      = #meses_obs(caja_op < 0) / meses_obs_6m               ; NA si meses_obs_6m == 0        ; mejor bajo
A3 cobertura_deuda    = Σ6m caja_op / Σ6m servicio_deuda                     ; NA si Σ6m servicio_deuda == 0  ; mejor alto
A4 carga_deuda        = Σ6m (servicio_deuda + amort_credito) / Σ6m cobros_op ; NA si Σ6m cobros_op == 0       ; mejor bajo
A5 dependencia_credito= Σ6m disp_credito / Σ6m cobros_op                     ; sin producto lineofcredit → NA con conf 0,3 y subnota 50 ; mejor bajo
```

A3, A4 y A5 son no aplicables cuando no existen cuotas ni línea de crédito:
se excluyen del bloque y A1/A2 reciben respectivamente 25 % y 20 % del score total.
Con deuda o línea, las cinco variables pesan 9 % cada una.

Umbrales sanos (solo para la ficha, no entran en el score):
A1 ≥ 10 % · A2 ≤ 1/6 · A3 ≥ 1,3 · A4 ≤ 25 % · A5 ≤ 20 %.

### 5.2 Bloque B — Fiabilidad (peso 0,30; B1 12 %, B2 12 %, B3 6 %)

Obligaciones recurrentes, por empresa y categoría `k ∈ {tax, social_security, salary, debt_repayment}`:

```text
presente_k(m)   = obligaciones_rec[k](m) > 0
recurrente_k(t) = #{m ∈ últimos 6 meses : presente_k(m)} ≥ 3
esperado_k(t)   = mediana de obligaciones_rec[k](m) sobre los meses presentes de los últimos 6
                  · para debt_repayment con cuadro mensual en debt_schedule_config:
                    esperado = granted_balance / total_periods + outstanding_balance × tasa / 12   (a €)
pagado_k(t)     = obligaciones_rec[k](t)
```

```text
B1 cumplimiento = min(1, Σ_{k rec} Σ6m pagado_k / Σ_{k rec} Σ6m esperado_k)   ; NA si ninguna k recurrente ; mejor alto
B2 racha        = max_k racha_k(t),  racha_k(t) = meses consecutivos hasta t con recurrente_k y pagado_k == 0
B3 puntualidad  = mediana(retraso_dias) de facturas proveedor pagadas_en(t) con payment_date en los últimos 6 m ; NA si < 1 factura ; mejor bajo
```

Subnota de B2 (regla directa, no percentiles; decisión 7):

```text
racha ≥ 2                          → 0
racha == 1                         → 70
racha == 0 y la última racha fue hace k meses (1 ≤ k ≤ 3):
    base = 70 si esa racha era 1, base = 0 si era ≥ 2
    subnota = base + (100 − base)·k/3
    → tras una racha de 1: 80, 90, 100
    → tras una racha ≥ 2:  33,3, 66,7, 100   (la recuperación de un impago real cuesta más)
racha == 0 en otro caso            → 100
```

`B1` suma sobre la **ventana de 6 meses** (`Σ6m`), no sobre un solo mes:
numerador `Σ_k Σ6m pagado_k` y denominador `Σ_k Σ6m esperado_k` de las
categorías recurrentes, agrupando las cuatro categorías en un único cociente.
Un mes de calendario **sin fila** (o sin ningún movimiento clasificable) es
«sin dato»: no cuenta como mes esperado y rompe la racha, igual que
`racha_deficit`.

Desviación aceptada (**a revisitar**): la cuota esperada de `debt_repayment`
usa `outstanding_balance`, que en `debt_schedule_config.csv` es la foto
**final** del saldo y no el saldo vivo del mes `t`. Contradice la regla de
SOURCE de «no usar la foto final», pero el término de interés es pequeño
frente a `granted_balance / total_periods` y el CSV no trae serie histórica de
saldo.

Edge case cubierto: mes sin pago + doble pago siguiente → B1 = 1 (la suma
6 m incluye el doble), B2 pasa de 1 a 0 y su subnota sube 70 → 80 → 90 → 100.

Riesgo conocido: categorías pagadas trimestralmente (IVA) aparecen ≤ 2 de
6 meses y por tanto no son recurrentes: correcto. Categorías mixtas
mensual/trimestral pueden generar rachas falsas de 1 mes; el decaimiento
las amortigua. Se mide en backtest (§13, falsas alarmas).

### 5.3 Bloque C — Dependencia (peso 0,25; C1 1,5 %, C2 1,5 %, C3 4 %, C4 8 %, C5 3 %, C6 7 %)

```text
C1 conc_clientes   = Σ top-3 cobros_por_contraparte (12 m) / Σ cobros con id (12 m)  ; NA si Σ cobros con id == 0 ; mejor bajo
C2 conc_proveedores= idem con pagos_por_contraparte                                   ; mejor bajo
C3 retraso_cobro   = mediana(retraso_dias) facturas cliente pagadas_en(t), payment_date en últimos 6 m ; NA si 0 facturas ; mejor bajo
C4 vencido         = Σ importe cli vencida_sin_cobro_en(t) con due_date en últimos 6 m / Σ importe cli con due_date en últimos 6 m ; NA si denominador 0 ; mejor bajo
C5 volatilidad     = MAD(cobros_op mensual, últimos 12 m, ≥ 6 obs) / mediana(cobros_op mensual) ; NA si mediana == 0 o < 6 obs ; mejor bajo
C6 recibos_dev     = Σ6m recibos_devueltos / Σ6m cobros_op ; NA si Σ6m cobros_op == 0 ; mejor bajo
```

C4 con `status` final: para `t < 2026-08` puede sobreestimar lo pendiente
(una factura pagada tras `fin(t)` cuenta como vencida en `t`, que es
correcto; una cancelada después también, que no lo es). Se marca
`estimado = true` en cobertura.

### 5.4 Bloque D — Grupo (no pondera; ajusta en §7)

Con `G` = empresas del grupo con evidencia de 12 meses en `t` (§14),
`H = G \ {empresa}`:

```text
D1 peso_grupo   = Σ12m cobros_op / Σ12m cobros_op_grupo                          ; grupo de 1 → 1
D2 score_resto  = Σ_{h∈H} scoreSolo_h × Σ12m cobros_op_h / Σ_{h∈H} Σ12m cobros_op_h ; NA si H vacío
D3 capacidad_aval = Σ_{h∈H} capacidad_cuota_adv_h / media6m(servicio_deuda + Σ_k obligaciones_rec[k]) ; NA si H vacío; denominador 0 → +∞ (cap en D3_ref)
D4 soporte      = Σ12m (intragrupo_in − intragrupo_out) / Σ12m cobros_op         ; informativo, no entra en ajusteHolding
D5 interdependencia = Σ12m (intragrupo_in + intragrupo_out) / Σ12m (cobros_op + pagos_op) ; grupo de 1 → 0
capacidad_cuota_adv = max(0, (estres_cobros × media6m cobros_op − estres_pagos × media6m pagos_op) / cobertura_min − media6m servicio_deuda)
conf_D          = media de confianza_h ponderada por cobros, h ∈ H
```

`capacidad_cuota_adv` se calcula aquí porque D3 la necesita para las
hermanas; se exporta en la fila para que decisión no la recalcule.
Préstamos intragrupo `custom` (171 filas, sin serie mensual) solo generan
el flag `tiene_prestamo_intragrupo`.

## 6. Etapa D — Subnotas, agregación, estado

```text
function subnota(v, x, P):
    if x is NA: return 50
    lo, hi = P.p5[v], P.p95[v]
    u = clip((x − lo) / (hi − lo), 0, 1)
    return 100 × (u if P.mejor[v] == "alto" else 1 − u)
    # excepción: B2 usa la regla directa de §5.2

nota_ef_v  = 50 + conf_v × (subnota_v − 50)
subscore_X = Σ_{v∈X} peso_v·nota_ef_v / peso_X   conf_X = Σ_{v∈X} peso_v·conf_v / peso_X
    scoreSolo = 0,45·subscore_A + 0,30·subscore_B + 0,25·subscore_C
confianza  = 0,45·conf_A + 0,30·conf_B + 0,25·conf_C
aportacion_v = peso_v × nota_ef_v                        → Σ_v aportacion_v == scoreSolo
```

Cuando A no tiene cuotas ni línea, `peso_A1 = 0,25`, `peso_A2 = 0,20` y el
resto de pesos A es cero; `confs_A` es la media de las confianzas A1 y A2.

Estado (para la ficha; decisión usa las puertas de su §3, no este campo):

| Estado      | Regla                                                              |
| ----------- | ------------------------------------------------------------------ |
| `sin_datos` | `confianza < 0,3`                                                  |
| `riesgo`    | `scoreSolo < 45`, `B2 ≥ 2` o `C4 > 0,40`                           |
| `sana`      | `scoreSolo ≥ 70`, `confianza ≥ 0,5`, A1 ≥ 0,10, B2 = 0 y C4 ≤ 0,20 |
| `vigilar`   | resto                                                              |

## 7. Etapa E — Ajuste de grupo

```text
Ci = cobrosOpMedia6m − pagosOpMedia6m − servicioDeudaMedia6m
S = Σ max(Ci, 0); D = Σ max(-Ci, 0)
factorD5 = clip(D5 / 0,15, 0, 1)
donante  = -min(30, min(1,D/S) × (scoreSolo-D2) × 0,8 × factorD5)
receptora = +min(20, min(1,S/D) × (D2-scoreSolo) × 0,7 × factorD5)
scoreGrupo = clip(scoreSolo + ajusteHolding, 0, 100)
```

`scoreSolo` siempre es autónomo. La aportación y el delta del holding se publican
en campos separados; las contribuciones A-C explican solo `scoreSolo`.

`scoreGrupo` reconoce apoyo y contagio del holding, pero las bandas y límites
siguen consumiendo `scoreSolo` autónomo.

## 8. Etapa F — Evolución

```text
tend_score_3m = scoreSolo(t) − scoreSolo(t−3)    ; null si no existe fila t−3
tend_score_6m = scoreSolo(t) − scoreSolo(t−6)    ; null si no existe fila t−6
tend_score_12m = scoreSolo(t) − scoreSolo(t−12)  ; null si no existe fila t−12
tend_X_3m     = subscore_X(t) − subscore_X(t−3)  ; X ∈ {A, B, C}
direccion     = "estable"   si las tendencias de 3m y 6m tienen signos opuestos
              = "mejora"    si tend_score_3m ≥ +6
              = "deterioro" si tend_score_3m ≤ −6
              = "estable"   en otro caso (o null → "estable")

delta_contrib = [{variable, aportacion(t) − aportacion(t−1)}]   ; Σ == scoreSolo(t) − scoreSolo(t−1)
delta_3m      = [{variable, aportacion(t) − aportacion(t−3)}]

naturaleza    = "sin_cambio" si direccion == "estable"
              = "estructural" si direccion(t) == direccion(t−1)
                              y #{v : signo(delta_3m_v) == signo(tend_score_3m) y |delta_3m_v| ≥ 1} ≥ 2
                              y alguna de esas v ∈ {A1, A2, A3}
              = "temporal" en otro caso

racha_deficit = meses consecutivos hasta t con caja_op < 0 (mes sin fila rompe la racha)
racha_B2      = B2(t)
```

## 9. Alertas de señal

| Tipo                        | Regla                                                                                | Persistencia     |
| --------------------------- | ------------------------------------------------------------------------------------ | ---------------- |
| `deterioro`                 | `direccion == deterioro`                                                             | 2 meses seguidos |
| `deterioro_estructural`     | `naturaleza == estructural` y deterioro                                              | inmediata        |
| `recuperacion`              | `direccion == mejora`                                                                | 2 meses seguidos |
| `deficit_persistente`       | `caja_op < 0`                                                                        | 3 meses seguidos |
| `impago_obligaciones`       | `B2 ≥ 2`                                                                             | inmediata        |
| `vencido_alto`              | `C4 > 0,40`                                                                          | 1 mes            |
| `contagio_grupo`            | `ajusteHolding ≤ −10`                                                                | 1 mes            |
| `datos_insuficientes`       | `confianza < 0,3`                                                                    | 1 mes            |
| `alerta_temprana_deterioro` | caída autónoma ≤ −4, primer déficit tras 4 meses positivos, salto C4 > 0,15 o C6 > 0 | inmediata        |

Cada alerta guarda `desde_mes` (primer mes en que la regla se cumple sin
interrupción). Las alertas de **acción** (abrir, reducir, cerrar) no son de
este motor.

## 10. Contrato de salida: `company_month_score`

Una fila por `company_id` × `mes`, `mes ∈ [2024-09, 2026-08]`. Los campos
marcados ▶ son los que consume el motor de decisión (su §1); el resto es
explicabilidad y producto.

```text
▶ company_id, mes, group_id, version_parametros
▶ scoreSolo, scoreGrupo, ajusteHolding, aportacionGrupo, deltaGrupo, confianza
  subscore_A, subscore_B, subscore_C, conf_A, conf_B, conf_C
  estadoSolo, estadoGrupo        sana | vigilar | riesgo | sin_datos
  perfil_grupo                   filial_subvencionada | drenaje_tesoreria | estandar
  variables[14]                  {id, valor_bruto, subnota, conf, peso, aportacion, umbral_sano, sano?, aplicable} (A1..C6)
  delta_contrib[14]              {id, delta}   Σ == scoreSolo(t) − scoreSolo(t−1)
▶ direccion, naturaleza, patron_trayectoria
  tend_score_3m, tend_score_6m, tend_score_12m, tend_A_3m, tend_B_3m, tend_C_3m
  alerta_temprana_deterioro, diagnosticoMejora, factor_determinante, factor_determinante_grupo, canario_en_mina, inflexion, inflexionGrupo
▶ racha_B2, racha_deficit
▶ C3_dias, C4
▶ cobros_op_media3m, cobros_op_media6m, pagos_op_media6m, servicio_deuda_media6m
  obligaciones_rec_media6m
▶ capacidad_cuota_adv
▶ D1, D2, D3, D4, D5, conf_D, tiene_prestamo_intragrupo
▶ cobros_op_grupo_media6m, pagos_op_grupo_media6m, servicio_deuda_grupo_media6m, scoreGrupo
  alertas[]                      {tipo, desde_mes}
  cobertura                      {meses_obs_6m, meses_obs_12m, pct_clasificado_6m, n_facturas_cli_6m, n_facturas_prov_6m,
                                  tiene_linea_credito, tiene_cuotas, n_hermanas_con_datos, C4_estimado, importes_excluidos_eur}
```

Regla de oro: la fila `t` solo usa eventos con fecha ≤ `fin(t)`. Añadir
datos posteriores a `t` no cambia la fila `t` (test §12.5).

## 11. Calibración y protocolo de test

```text
split:      grupos completos, 70 % ajuste / 30 % validación, semilla fija, por group_id
percentiles: p5/p95 de cada variable sobre empresa-mes de ajuste con mes ≤ 2026-02 y conf_v ≥ 0,5
             → congelados en version_parametros
tasas €:    §3.2, sobre todo el dataset (no hay fuga: son precios de mercado)
validación: empresas de validación (out-of-sample por grupo), meses 2025-09 … 2026-08 (§13.1: 2025-09..2026-02 es in-sample en el tiempo)
test (60-80 empresas nuevas): mismo pipeline, version_parametros congelada; sin hermanas conocidas → D2 NA → ajusteHolding 0
```

Cambiar un peso, un umbral o un percentil cambia `version_parametros`; las
filas guardan con qué versión se calcularon.

## 12. Fixtures y tests

Fixtures en `fixtures/scoring/`: flujos mensuales sintéticos (no CSV
brutos) más una tabla de percentiles fija para que los resultados sean
calculables a mano.

Percentiles de fixture: A1 [−0,10; 0,30] · A2 [0; 0,67] · A3 [0,5; 4,0] ·
A4 [0; 0,50] · A5 [0; 0,60] · B1 [0,5; 1,0] · B3 [−10; 60] · C1 [0,2; 0,9] ·
C2 [0,2; 0,9] · C3 [−5; 60] · C4 [0; 0,6] · C5 [0,05; 0,8] · C6 [0; 0,10].

| Fixture                 | Flujos (6 meses iguales, €)                                                                                                                   | Esperado en `t = mes 6`                                                                                                                                                                                                  |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sana`                  | cobros 100 k, pagos 85 k, servicio 5 k, sin línea, tax/SS/nómina presentes y constantes, 10 clientes iguales, facturas cliente pagadas a +5 d | A1 = 0,15 → 62,5 · A2 = 0 → 100 · A3 = 3,0 → 71,4 · A4 = 0,05 → 90 · A5 NA → 50 (conf 0,3) · B1 = 1 → 100 · B2 = 0 → 100 · C1 = 0,3 → 85,7 · subscore_A ≈ 74 (con conf 1 salvo A5) · estado `sana` · direccion `estable` |
| `salto_un_mes`          | como `sana`, pero mes 4 sin `tax` y mes 5 con `tax` doble                                                                                     | mes 4: B2 = 1 (70), B1 = 200 k/210 k = 0,952 (Σ de las cuatro categorías) · mes 5: B1 = 1, B2 = 0 con decaimiento → 80 · mes 6: 90 · nunca `riesgo`                                                                      |
| `impago`                | como `sana`, meses 5 y 6 sin `social_security`                                                                                                | mes 6: B2 = 2 → 0 · estado `riesgo` · alerta `impago_obligaciones`                                                                                                                                                       |
| `deterioro_estructural` | cobros bajan 100 k → 70 k linealmente desde mes 4, pagos fijos 85 k                                                                           | mes 6: A1 < 0, A2 ≥ 0,5, racha_deficit ≥ 2 · `tend_score_3m ≤ −6` · con mes 7 igual: `naturaleza = estructural` (A1, A2 mueven, persistencia 2)                                                                          |
| `bache`                 | como `sana`, mes 5 cobros 40 k, mes 6 vuelve a 100 k                                                                                          | mes 5 direccion puede ser `deterioro`; mes 6 `naturaleza = temporal` (no persiste) · nunca `estructural`                                                                                                                 |
| `historial_corto`       | solo 2 meses de datos                                                                                                                         | conf_A ≈ 0,33 · `confianza < 0,5` · estado `sin_datos` si < 0,3                                                                                                                                                          |
| `filial_subvencionada`  | filial con Ci < 0, D4 > 0,30, B2 observado = 0 y D2 ≥ 60                                                                                      | perfil descriptivo; puede permitir `estadoGrupo = vigilar` con ajuste positivo, sin alterar `scoreSolo`                                                                                                                  |
| `drenaje_tesoreria`     | empresa con Ci > 0 y D4 < −0,40                                                                                                               | perfil descriptivo; el ajuste ya recoge el reparto monetario del holding                                                                                                                                                 |

Tests de propiedades (sobre todas las filas del dataset real):

1. Cada `subnota`, `nota_ef`, `subscore`, `scoreSolo`, `scoreGrupo` ∈ [0, 100]; cada `conf` ∈ [0, 1].
2. `Σ aportacion_v == scoreSolo` y `Σ delta_contrib == scoreSolo(t) − scoreSolo(t−1)` (tolerancia 1e-6).
3. `−30 ≤ ajusteHolding ≤ 20`; grupo de una empresa ⇒ `ajusteHolding == 0`.
4. `NA ⇒ subnota == 50 y conf == 0` (salvo A5 sin línea: conf 0,3).
5. **No fuga**: recalcular `t = 2026-02` con los CSV truncados a `2026-02-28` ⇒ filas idénticas.
6. Espejos emparejados no aparecen en `cobros_op` ni `pagos_op` sea cual sea su categoría; movimientos sobre `lineofcredit` tampoco.
7. Ningún `group_id` en ajuste y validación a la vez.
8. Mismo input ⇒ misma salida (sin aleatoriedad salvo la semilla del split).
9. Los 8 fixtures dan el resultado esperado; se re-ejecutan cuando cambia un parámetro.

## 13. Métricas de backtest (para el jurado)

Sobre validación, meses `2025-09 … 2026-08`, eventos definidos sin usar el
score:

```text
evento_deterioro(t)    = 3 meses seguidos con caja_op < 0 desde t, precedidos de ≥ 6 meses con ≤ 1 déficit
evento_recuperacion(t) = 3 meses seguidos con caja_op ≥ 0 desde t, precedidos de ≥ 3 meses con ≥ 2 déficits
```

### 13.1 Ventana de evaluación y qué es out-of-sample

La validación es **out-of-sample por grupo**: el split de §11 reserva el 30 %
de los `group_id` y esas empresas no entran en el ajuste de los percentiles ni
en ningún otro parámetro. Ese es el corte que sostiene las métricas.

La **ventana de meses** es `2025-09 … 2026-08`, no `2026-03 … 2026-08`. El
calendario tiene 24 meses y un evento necesita 3 meses de seguimiento más su
historia previa (6 meses para `deterioro`): con la ventana de seis meses solo
quedaban 4 meses candidatos y 2 eventos de `deterioro` en total, una muestra
con la que ninguna métrica significa nada. Doce meses dan candidatos
suficientes.

El precio hay que decirlo claro: los percentiles se ajustaron sobre meses
`≤ 2026-02` (§11), así que **`2025-09 … 2026-02` es in-sample en el tiempo**
—aunque out-of-sample por grupo, que es la fuga que de verdad importaría— y
solo `2026-03 … 2026-08` es out-of-sample en ambas dimensiones. Las métricas
de §13 mezclan ambos tramos; al presentarlas se dice así, no como "validación
pura".

### 13.2 Métricas

| Métrica                 | Definición                                                                                                        |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `lead_time`             | mediana y p25 de meses entre `desde_mes` de la primera alerta `deterioro` y el evento. **El número de la slide.** |
| `recall`                | eventos con alerta previa en ≤ 6 meses / eventos                                                                  |
| `falsas_alarmas`        | alertas `deterioro` elegibles sin evento en los 6 meses siguientes / alertas elegibles                            |
| simetría                | las tres anteriores para `recuperacion`                                                                           |
| `precision_nivel`       | Spearman entre `scoreSolo(t)` y `margen_caja(t+3)`                                                                |
| `estructural_precision` | % de `naturaleza = estructural` seguidos de evento en 6 m, frente a `temporal`                                    |

Cómo interactúa cada métrica con la ventana (implementado en
`lib/features/scoring/backtest.ts`):

- **Eventos**: cuentan si el mes del evento cae dentro de la ventana y existen
  sus 3 meses de seguimiento.
- **`recall` y `lead_time`**: valen las alertas del mismo tipo emitidas en los
  6 meses previos al evento, aunque se adelanten a la ventana.
- **Falsas alarmas**: una alerta se _emite_ el primer mes en que aparece, no
  cada mes que sigue activa. Es elegible si su mes `m` cumple
  `m + 6 ≤ último mes de la serie` (su seguimiento es observable: contarla si
  no lo es sería censura por la derecha) y `m + 6 ≥ primer mes de la ventana`
  (su seguimiento solapa con la ventana). Es falsa si no hay evento de su tipo
  en `(m, m + 6]`; ese evento vale aunque caiga fuera de la ventana, porque la
  alerta sí acertó.
- **`precision_nivel`**: pares con `t` dentro de la ventana y fila en `t + 3`.

## 14. Orden de ejecución

```text
1. parámetros + tasas €                              (una vez, versionado)
2. transactions → clasificación → company_month_flows (+ emparejado de traspasos por empresa y por grupo)
3. invoices → company_month_invoices
4. group_month_flows
5. para cada mes t en orden:
     variables A, B, C por empresa → subnotas → scoreSolo, confianza, capacidad_cuota_adv
     D1..D5 (necesita scoreSolo de las hermanas en t) → ajusteHolding → scoreGrupo
     evolución (necesita filas t−1, t−3) → alertas
     persistir company_month_score[t]
```

Las hermanas de `t` son las empresas del grupo con evidencia de 12 meses en
`t` (`Σ12m cobros_op > 0` o `confianza ≥ conf_sin_datos`), no las que tienen
fila en `t`: un mes vacío suelto no puede sacar a una hermana de D1-D5 ni
hacer parpadear el aval.

Cada tabla intermedia se persiste; cada etapa es reproducible sin las
posteriores.

## 15. Fuera de alcance v1

Inferir categorías por debajo de 95 % de precisión · tarjetas, TPV y
plataformas de gastos · ventas intragrupo · pagos parciales de facturas ·
sector · probabilidad de impago · cualquier límite, plazo o precio.
