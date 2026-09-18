# Motor de scoring — lógica v0.2 (documento de trabajo)

> Sucede a `SCORE_MODEL.md` v0.1 (hoy en
> `.agents/skills/vercel-react-best-practices/docs/`; moverlo a `docs/`).
> Este documento fija **cómo se calcula** cada pieza y **qué entrega** al
> producto. Las decisiones marcadas `[D-n]` están abiertas y se cierran en
> equipo antes de programar la pieza correspondiente. Nada aquí es una
> probabilidad de impago ni una calificación regulatoria.

## 0. Para qué existe el motor

Producto: **financiación de circulante con límite que se recalcula solo, mes
a mes**. El motor debe responder, por empresa y cierre de mes:

| Pregunta del producto | Salida del motor |
| --- | --- |
| ¿Cuánto? | `limite_recomendado` (rango base/adverso) |
| ¿A qué precio? | `tramo_precio` (A/B/C/D) |
| ¿Cuándo cerrar el grifo? | `accion` ∈ {abrir, ampliar, mantener, reducir, cerrar} + `motivo` |
| ¿Está sana? | `score` 0-100 + `confianza` 0-1 |
| ¿Mejora o empeora? | `tendencia_3m`, `direccion` |
| ¿Temporal o estructural? | `naturaleza_cambio` |
| ¿Por qué cambió? | `contribuciones[]` y descomposición exacta del delta |
| ¿Con cuánta antelación? | `lead_time_meses` medido en backtest (métrica global, no por fila) |

Las seis preguntas del reto (sanas, mejoran, empeoran, temporal/estructural,
explicación, antelación) salen de la misma tabla. El producto no calcula
nada financiero por su cuenta: solo lee esta tabla y la pinta.

## 1. Contrato de salida

Tabla `company_month_score`, una fila por `company_id` × `mes` (cierre de mes
completo, `2024-09` … `2026-08`; septiembre 2026 no se puntúa como mes
completo).

```text
company_id, mes
score                  0-100
confianza              0-1
tendencia_3m           score(t) − score(t−3), null si no hay t−3
direccion              mejora | estable | deterioro
naturaleza_cambio      temporal | estructural | sin_cambio
contribuciones         [{indicador, valor_bruto, subnota, peso, confianza, aportacion}] × 12
delta_contribuciones   [{indicador, delta_aportacion}] frente a t−1; suma == score(t) − score(t−1)
capacidad_cuota_base   €/mes, cuota adicional sostenible, escenario base
capacidad_cuota_adv    €/mes, escenario adverso
limite_capacidad       € (derivado de capacidad_cuota_adv)
limite_operativo       € (derivado de cobros operativos)
limite_recomendado     € = min(limite_capacidad, limite_operativo) × factor_banda × factor_confianza
tramo_precio           A | B | C | D
accion                 abrir | ampliar | mantener | reducir | cerrar
motivo                 texto corto, generado por reglas (no LLM)
alertas                [{tipo, indicador, desde_mes}]
cobertura              {meses_observados, pct_importe_clasificado, tiene_facturas, tiene_deuda}
version_parametros     hash de escalas/pesos usados
```

Regla de oro: **una fila para el mes `t` solo usa eventos con fecha ≤ último
día de `t`**. Ni saldos, ni `outstanding`, ni `pending_amount`, ni `status`
de la fotografía final para `t < 2026-09`.

## 2. Pipeline

```text
A. Carga y limpieza  →  B. Flujos mensuales  →  C. Indicadores brutos
→  D. Subnotas + confianza  →  E. Score, trayectoria, explicación
→  F. Capacidad → límite → precio → acción  →  G. Alertas
→  H. Backtest, anticipación, protocolo de test
```

Cada etapa produce una tabla persistida. Cada etapa es reproducible sin las
posteriores. Prioridad de construcción en §11.

## 3. Etapa A — Carga y limpieza

### 3.1 Hallazgos del dataset que condicionan las reglas

Sondeo sobre los CSV (2026-09-18):

| Hallazgo | Consecuencia |
| --- | --- |
| `transactions.category = '-'`: 25 % de filas y **más importe que `collection`** (113 B€ pos, 100 B€ neg vs 90 B€ de collection) | No se puede ignorar ni asignar a ingreso. Se cuenta como *sin clasificar* y reduce `pct_importe_clasificado`. `[D-1]` |
| ~75 k filas con categoría vacía, ~104 k con `status` vacío | Tratar vacío como `-` / como `booked` si `accounting_status` indica reconciliación; si no, excluir. `[D-2]` |
| 182 k movimientos sobre productos `lineofcredit` (4,6 B€), 1,4 k sobre `confirming`, 44 sobre `factoring`, 12 sobre `loan` | El uso de línea de crédito es **observable mes a mes**. Nuevo indicador 12 (§5). Estos movimientos no son cobros ni pagos operativos. |
| 90 % de movimientos en EUR (por moneda del producto); 76 k con producto desconocido | Solo EUR entra en métricas monetarias v0. Producto desconocido: excluir y contar en cobertura. `[D-3]` |
| Facturas: `invoice` domina; ambos signos en todos los estados; `paymentDocument`, `note`, `deposit`, `deliveryNote`, `refund`, `invoiceGroup` presentes | v0 solo `document_type = invoice`. Signo ≠ dirección probada: validar (§3.3). |
| 238 k facturas no pagadas; en 228 k `payment_date == due_date` | `payment_date` de una factura no pagada **no es un pago**. Solo cuenta si `status = paid`. |
| Solo 373 empresas con 24 meses completos; mediana 18. 1.093 con facturas, 378 con productos de deuda, 40 con cuadro | Confianza por indicador obligatoria. Sin deuda registrada ≠ sin deuda. |

### 3.2 Clasificación de movimientos bancarios

Solo `status ∈ {booked}` (y vacío según `[D-2]`). Solo productos en
`banking_products` con `type ∈ {checking, saving, wallet}` para flujos
operativos; `card`, `tpv`, `expensesPlatform` se agregan a su cuenta de
liquidación si se identifica, si no se ignoran en v0 `[D-4]`.

| Clase | Categorías | Signo esperado | Uso |
| --- | --- | --- | --- |
| **cobro_operativo** | `collection`, `bulk_collection`, `pos_settlement`, `cash_settlement`, `cash_settlements`, `payment_refund` (+) | + | Indicadores 1, 2, 4, 8, 9, 11, 12 |
| **pago_operativo** | `payment`, `bulk_payment`, `utility`, `salary`, `social_security`, `tax`, `fee`, `collection_refund` (−) | − | Indicadores 1, 2, 9 |
| **servicio_deuda** | `debt_repayment`, `interest_charge` | − | Indicadores 3, 4 |
| **financiacion** | cualquier movimiento sobre producto de `debt_products`; `transfer` con contraparte igual a otro producto propio | ± | Indicador 12; excluido de operativo |
| **neutral** | `transfer` no identificado, `cash_withdrawal`, `investment_deployment`, `investment_return`, `tax_refund`, `pos_withdrawal` | ± | Fuera de operativo; contado en cobertura `[D-5]` |
| **sin_clasificar** | `-`, vacío | ± | Cobertura; nunca ingreso ni gasto |

`transfer` (63 B€ pos, 41 B€ neg) es el riesgo de doble conteo: un traspaso
entre dos cuentas de la misma empresa aparece dos veces con signos opuestos.
Regla v0: emparejar por `company_id`, mismo `|amount|`, `date` ± 2 días,
signos opuestos → neutral. Lo que no empareja se queda neutral igualmente.
`[D-5]`: si a H12 vemos que `transfer` no emparejado explica déficits
falsos, revisar.

### 3.3 Facturas

- v0: `document_type = invoice`, `status ∈ {paid, overdue, pending,
  payment_in_progress}`; `cancel` fuera.
- **Dirección cliente/proveedor:** hipótesis inicial `amount > 0` = cliente.
  Validación obligatoria antes de usar indicadores 5-7 y 10: para cada
  `counterparty_id` presente en facturas y transacciones, comprobar que las
  contrapartes de facturas positivas aparecen mayoritariamente en
  `collection` y las negativas en `payment`. Si la hipótesis falla en > 20 %
  de contrapartes, invertir o marcar confianza 0. `[D-6]`
- Fecha de pago real: solo si `status = paid`. Para `t` anterior a la
  fotografía, una factura cuenta como pagada en `t` si `status = paid` **y**
  `payment_date ≤ fin(t)`; como vencida sin cobro en `t` si `due_date ≤
  fin(t)` y (`status ≠ paid` o `payment_date > fin(t)`). Reconstrucción
  aproximada: se marca como estimada en `cobertura`.
- Moneda: solo `currency = EUR` en v0. `exchange_rate` no se usa hasta
  validar su sentido. `[D-3]`

### 3.4 Deuda

- `debt_products.outstanding` y `granted` vienen con signo negativo y a veces
  vacíos. Normalizar a positivo. Solo válidos para `t = 2026-08` (última
  fotografía). Para meses anteriores no hay serie.
- `debt_schedule_config` (87 filas) se usa solo para contrastar cuotas
  observadas, no como fuente principal.

## 4. Etapa B — Flujos mensuales

Tabla `company_month_flows`, una fila por empresa × mes con actividad:

```text
cobros_op, pagos_op, nomina_ss (salary+social_security), impuestos,
intereses, cuotas_deuda, disposiciones_credito (+ sobre lineofcredit),
amortizaciones_credito (− sobre lineofcredit), transfer_neto_no_emparejado,
sin_clasificar_pos, sin_clasificar_neg, n_mov, pct_importe_clasificado,
fact_cliente_emitida, fact_cliente_cobrada, fact_cliente_vencida_sin_cobro,
retraso_mediano_cobro_dias, retraso_mediano_pago_dias,
top3_clientes_pct (12 m), n_clientes_identificados
```

Todos los importes en valor absoluto positivo. Meses sin ningún movimiento
`booked` no existen en la tabla (no son cero).

`caja_operativa = cobros_op − pagos_op` (antes de deuda).

## 5. Etapa C — Indicadores brutos

Doce indicadores. Cambio respecto a v0.1: entra el **12, dependencia de
crédito a corto**, porque el dato existe y es el más pertinente para un
producto de circulante; se ajustan pesos para sumar 100. `[D-7]`

| Nº | Bloque | Indicador | Peso | Cálculo bruto (ventana) | Mejor si | v0 (H12) |
| ---: | --- | --- | ---: | --- | --- | :-: |
| 1 | Caja | Margen operativo cobrado | 16 | `Σ6m(cobros_op − pagos_op) / Σ6m cobros_op` | alto | ✔ |
| 2 | Caja | Frecuencia de déficit | 12 | meses con `cobros_op < pagos_op` / meses observados en 6 m | bajo | ✔ |
| 3 | Deuda | Cobertura del servicio de deuda | 12 | `Σ6m caja_operativa / Σ6m (cuotas_deuda + intereses)`; sin servicio observable → no disponible | alto | |
| 4 | Deuda | Carga de intereses | 5 | `Σ6m intereses / Σ6m cobros_op` | bajo | |
| 5 | Circulante | Retraso real en cobros | 8 | mediana `payment_date − due_date`, facturas cliente pagadas en 6 m | bajo | |
| 6 | Circulante | Vencido sin cobrar | 8 | importe cliente vencido sin cobro a fin(t) / importe cliente vencido en 6 m | bajo | |
| 7 | Circulante | Retraso en pagos a proveedor | 4 | mediana `payment_date − due_date`, facturas proveedor pagadas en 6 m | bajo | |
| 8 | Trayectoria | Tendencia de cobros | 10 | `(Σ3m cobros_op − Σ3m_previos) / Σ3m_previos` | alto, 0 → 50 | ✔ |
| 9 | Trayectoria | Tendencia del margen | 10 | `margen_3m − margen_3m_previos` (puntos) | alto, 0 → 50 | |
| 10 | Resistencia | Concentración de clientes | 5 | top3 contrapartes / facturación cliente identificada, 12 m | bajo | |
| 11 | Resistencia | Volatilidad de cobros | 5 | `MAD(cobros_op mensual) / mediana(cobros_op mensual)`, 6-12 m | bajo | |
| 12 | Circulante | Dependencia de crédito a corto | 5 | `Σ6m disposiciones_credito / Σ6m cobros_op`; sin línea → neutral, confianza baja | bajo | ✔ |
| | | **Total** | **100** | | | |

Los tres ✔ de v0 usan solo `transactions`: sirven para el tracer bullet a
H12. El 12 entra en v0 porque es una consulta directa sobre productos
`lineofcredit`.

Reglas por indicador (heredadas de v0.1 salvo lo indicado):

- **1, 2, 9:** si `pct_importe_clasificado < 50 %` en la ventana, confianza ≤
  0,5. Disposiciones de crédito no son cobros; cuotas no son gasto operativo.
- **3:** aproximación a DSCR, no DSCR contable. Sin cuotas observables →
  indicador *no disponible* (subnota efectiva 50, confianza 0), nunca 100.
- **4:** sin intereses y sin deuda registrada → neutral con confianza 0,3.
- **5, 6, 7, 10:** requieren `[D-6]` validado. Menos de 5 facturas en ventana
  → confianza proporcional (n/5).
- **8, 9:** cambio cero se ancla en 50. Si hay 12 meses previos, contrastar
  con el mismo trimestre del año anterior y usar el peor de los dos
  (evita premiar estacionalidad). `[D-8]`
- **11:** mediana 0 → no disponible.
- **12:** disposiciones brutas, no netas: mide cuánto se tira de la línea,
  no el saldo. Una empresa que dispone y amortiza cada mes tiene dependencia
  alta aunque el saldo neto sea cero.

## 6. Etapa D — Subnotas y confianza

**Normalización.** Cada valor bruto `xᵢ` se lleva a `sᵢ ∈ [0, 100]`:

- Porcentajes acotados (2, 6, 10): lineal, invertido si "mejor si bajo".
- Ratios y días sin cota (1, 3, 4, 5, 7, 11, 12): winsorizar en `p5` y `p95`
  del **conjunto de ajuste** (§10), después lineal entre esos dos puntos.
- Tendencias (8, 9): `50 + 50 × clip(x / x₉₅, −1, 1)` con `x₉₅` el p95 del
  valor absoluto en ajuste. Cero → 50.

Los percentiles se calculan una vez, sobre empresas de ajuste y meses
`≤ 2026-02`, se guardan con versión y **no se recalculan** al puntuar
empresas o meses nuevos.

**Confianza `cᵢ ∈ [0, 1]`.** Producto de tres factores, cada uno en [0, 1]:

```text
c_ventana   = meses_observados_en_ventana / meses_de_ventana
c_cobertura = pct_importe_clasificado (solo indicadores de transacciones)
              o n_facturas / 5 (indicadores de facturas), acotado a 1
c_dato      = 1 si el indicador es calculable; 0 si no disponible
cᵢ = c_ventana × c_cobertura × c_dato
```

**Nota efectiva** y agregación (igual que v0.1):

```text
nota_efectivaᵢ = 50 + cᵢ × (sᵢ − 50)
score          = Σ pesoᵢ/100 × nota_efectivaᵢ
confianza      = Σ pesoᵢ/100 × cᵢ
aportacionᵢ    = pesoᵢ/100 × nota_efectivaᵢ        (Σ aportacionᵢ == score)
```

Una empresa sin datos en absoluto obtiene score 50 con confianza 0. El
producto no debe leer ese 50 como "aceptable": la confianza lo bloquea (§8).

## 7. Etapa E — Trayectoria y explicación

**Tendencia y dirección.**

```text
tendencia_3m = score(t) − score(t−3)
direccion    = mejora     si tendencia_3m ≥ +6 y score(t) ≥ score(t−1)
             = deterioro  si tendencia_3m ≤ −6 y score(t) ≤ score(t−1)
             = estable    en otro caso
```

Umbral ±6 `[D-9]`: se calibra en backtest para que ~15 % de empresa-mes
caigan en cada extremo.

**Temporal o estructural.** Solo se evalúa si `direccion ≠ estable`.

```text
n_ind_mismo_sentido = nº indicadores cuya aportacion cambió ≥ 1 punto en el
                      mismo sentido que el score entre t−3 y t
nivel_afectado      = alguno de {1, 2, 3} cambió ≥ 1 punto en ese sentido
persistencia        = direccion igual en t−1 y t

estructural si  persistencia y n_ind_mismo_sentido ≥ 2 y nivel_afectado
temporal    si  no estructural y (n_ind_mismo_sentido ≤ 1 o no persistencia)
```

Lectura: un mes malo por un solo cobro retrasado mueve 8 y 11 → temporal.
Margen cayendo dos trimestres con déficits y más disposición de línea →
estructural.

**Explicación.** Se guarda por fila la lista completa de contribuciones. El
delta entre meses se descompone exactamente:

```text
score(t) − score(t−1) = Σᵢ [aportacionᵢ(t) − aportacionᵢ(t−1)]
```

`motivo` se genera por plantilla a partir de los dos indicadores con mayor
`|delta_aportacion|`: *"Baja 7 puntos: margen cobrado −4,1 (de 22 % a 9 %),
dependencia de crédito −2,3 (disposiciones 38 % de cobros)."* Sin LLM en
esta ruta. Un LLM puede reescribir el texto en la UI si sobra tiempo, nunca
decidir el contenido.

## 8. Etapa F — Capacidad, límite, precio, acción

Esta etapa es la capa de producto. Sus parámetros son de negocio, no
estadísticos, y se muestran como supuestos en la demo.

**Capacidad de cuota adicional** (6 m, media mensual):

```text
caja_base      = media6m(cobros_op) − media6m(pagos_op)
caja_adversa   = media6m(cobros_op) × 0,8 − media6m(pagos_op) × 1,1
cuotas_actuales = media6m(cuotas_deuda + intereses + amortizaciones_credito netas)
capacidad_cuota_base = max(0, caja_base    / 1,3 − cuotas_actuales)
capacidad_cuota_adv  = max(0, caja_adversa / 1,3 − cuotas_actuales)
```

Parámetros `[D-10]`: cobertura mínima 1,3; adverso −20 % / +10 %.

**Dos límites, se toma el menor.**

```text
limite_capacidad = capacidad_cuota_adv × 12
    (línea revolving a 12 meses que se paga con caja operativa estresada)
limite_operativo = 0,8 × media3m(cobros_op) × 3
    (anticipo de hasta el 80 % de tres meses de cobros: el circulante que
     existe de verdad)
limite_bruto     = min(limite_capacidad, limite_operativo)
```

`[D-11]`: 80 % y 3 meses son parámetros de producto.

**Banda y factores.**

| Banda | Condición | factor_banda | tramo_precio |
| --- | --- | ---: | --- |
| A | score ≥ 75 | 1,00 | A |
| B | 60 ≤ score < 75 | 0,70 | B |
| C | 45 ≤ score < 60 | 0,40 | C |
| D | score < 45 | 0,00 | D (sin oferta) |

- `direccion = deterioro` y `naturaleza_cambio = estructural` → una banda
  menos. `mejora` no sube banda (se gana subiendo el score), pero desbloquea
  `ampliar` sin esperar dos meses.
- `factor_confianza = min(1, confianza / 0,6)`. Con confianza < 0,3 no hay
  oferta (`accion = mantener` sobre límite 0 o el vigente).
- `limite_recomendado = limite_bruto × factor_banda × factor_confianza`,
  redondeado a 1.000 €.

Precios `[D-12]`, ilustrativos para la demo: A 5 %, B 7 %, C 10 % TAE.

**Acción** (compara con el límite vigente del mes anterior, `L_prev`):

```text
cerrar    si banda D, o déficit en 3 meses seguidos, o vencido_sin_cobrar > 40 %
reducir   si limite_recomendado < 0,85 × L_prev durante 2 meses seguidos,
          o inmediatamente si deterioro estructural
ampliar   si limite_recomendado > 1,15 × L_prev y (direccion ≠ deterioro)
abrir     si L_prev == 0 y limite_recomendado > 0 y confianza ≥ 0,5
mantener  en otro caso
```

Histéresis: un cambio de límite se acota a ±25 % mensual salvo `cerrar`.
Evita que el grifo oscile con un mes ruidoso. `[D-13]`

## 9. Etapa G — Alertas

Se emiten por fila; el producto las muestra en la cartera y son el bonus
"monitorización proactiva".

| Tipo | Regla | Persistencia |
| --- | --- | --- |
| `deterioro` | `direccion = deterioro` | 2 meses seguidos |
| `deterioro_estructural` | `naturaleza_cambio = estructural` y deterioro | inmediata |
| `recuperacion` | `direccion = mejora` | 2 meses seguidos |
| `deficit_persistente` | `cobros_op < pagos_op` | 3 meses seguidos |
| `vencido_alto` | indicador 6 > 40 % | 1 mes |
| `dependencia_credito` | indicador 12 > p90 de ajuste | 2 meses seguidos |
| `datos_insuficientes` | confianza < 0,3 | 1 mes |

Cada alerta guarda `desde_mes` (primer mes en que la regla se cumple) para
medir la antelación.

## 10. Etapa H — Backtest, anticipación, protocolo de test

**Split.** Por `group_id`, nunca por empresa: 70 % de grupos = ajuste, 30 %
= validación. Percentiles y umbrales se fijan con ajuste y meses
`≤ 2026-02`; se evalúan en validación y en meses `2026-03 … 2026-08`.

**Eventos observables** (sin etiquetas de impago, son indicadores
indirectos):

```text
evento_deterioro(t)   = 3 meses seguidos de déficit operativo a partir de t,
                        precedidos de ≥ 6 meses con ≤ 1 déficit
evento_recuperacion(t)= 3 meses seguidos sin déficit a partir de t,
                        precedidos de ≥ 3 meses con ≥ 2 déficits
```

`[D-14]`: alternativa, caída del margen 6 m por debajo de 0 tras estar por
encima de 10 %.

**Métricas.**

- `lead_time` = meses entre `desde_mes` de la primera alerta `deterioro` (o
  `recuperacion`) y el mes del evento. Reportar mediana y p25 sobre
  validación. Es **el número de la slide**.
- `recall` = eventos con alerta previa en ≤ 6 meses / eventos.
- `falsas_alarmas` = alertas sin evento en los 6 meses siguientes / alertas.
- Simetría: mismas tres cifras para recuperación.
- Precisión del nivel: correlación de Spearman entre `score(t)` y
  `margen(t+3)` en empresas de validación.

**Prueba de no-fuga.** Recalcular `score(t)` para `t = 2026-02` con y sin
los CSV recortados a esa fecha: el resultado debe ser idéntico.

**Empresas test (60-80 no vistas).** Llegan con los mismos CSV. El pipeline
corre entero con `version_parametros` congelada. Entrega: CSV con las
columnas del contrato (§1) para cada mes disponible, más un resumen por
empresa con último score, dirección y lead time esperado.

## 11. Prioridad de implementación

| Hito | Qué existe | Etapas |
| --- | --- | --- |
| **H12 tracer bullet** | `company_month_flows` para EUR; indicadores 1, 2, 8, 12; score y confianza; contribuciones; capacidad y límite con parámetros fijos; banda y acción sin histéresis | A (3.2), B, C parcial, D, E parcial, F |
| **H18** | Indicadores 3, 4, 9, 11; temporal/estructural; alertas; `motivo` | C, E, G |
| **H24 freeze** | Indicadores 5, 6, 7, 10 si `[D-6]` valida; backtest y lead time; CSV test; histéresis | C, H, F |
| Después | Solo bugs sobre el golden path | |

Si `[D-6]` no valida a H18, los indicadores de facturas se quedan con
confianza 0 y sus 25 puntos de peso se redistribuyen proporcionalmente
entre el resto. El score sigue sumando 100 sin tocar código de agregación.

## 12. Decisiones abiertas (trabajarlas juntos, en este orden)

| ID | Decisión | Propuesta | Quién cierra | Antes de |
| --- | --- | --- | --- | --- |
| D-1 | Categoría `-` | Sin clasificar, baja cobertura; no inferir por descripción en v0 | Pablo + Dev datos | H3 |
| D-2 | `status` vacío | Incluir si `accounting_status` contiene RECONCIL; si no, excluir | Dev datos | H3 |
| D-3 | Monedas ≠ EUR | Excluir en v0; confianza baja para esas empresas | Pablo | H3 |
| D-4 | `card`, `tpv`, `expensesPlatform` | Ignorar en v0 | Dev datos | H3 |
| D-5 | `transfer` no emparejado | Neutral | Dev datos | H12 |
| D-6 | Signo de factura = dirección | Validar contra contrapartes; si falla, confianza 0 | Dev datos | H18 |
| D-7 | Pesos y entrada del indicador 12 | Tabla §5 | Pablo | H3 |
| D-8 | Contraste estacional en tendencias | Usar el peor de los dos | Pablo | H18 |
| D-9 | Umbral de dirección ±6 | Calibrar a ~15 % en cada cola | Pablo | H18 |
| D-10 | Cobertura 1,3 y estrés −20 %/+10 % | Mantener; mostrar como supuesto | Pablo | H12 |
| D-11 | Anticipo 80 % × 3 meses | Mantener | Pablo + Dev motor | H12 |
| D-12 | Precios por tramo | 5 / 7 / 10 % | Pablo | H24 |
| D-13 | Histéresis ±25 % y 2 meses | Mantener | Dev motor | H24 |
| D-14 | Definición de evento para backtest | Déficit 3 meses | Pablo | H12 |

## 13. Checks obligatorios antes de decir "hecho"

1. Pesos suman 100. Cada `sᵢ`, `nota_efectivaᵢ`, `score` en [0, 100].
2. `Σ aportacionᵢ == score` y `Σ delta_contribuciones == score(t) − score(t−1)`,
   tolerancia 1e-6, en todas las filas.
3. Ninguna fila de `t < 2026-09` cambia al añadir datos posteriores a `t`.
4. Empresa sin datos → score 50, confianza 0, `accion = mantener`, límite 0.
5. `transfer` emparejados no aparecen en cobros ni pagos operativos.
6. Movimientos sobre `lineofcredit` no aparecen en cobros ni pagos operativos.
7. Percentiles cargados desde `version_parametros`, no recalculados al
   puntuar validación ni test.
8. Split por `group_id`: ningún grupo en ambos lados.
9. Cinco empresas fixture (sana, mejora, deteriora, bache temporal, historial
   corto) dan la banda y la acción esperadas; se revisan a mano cada vez que
   cambia un peso.
