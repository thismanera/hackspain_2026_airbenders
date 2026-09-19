# SOURCE — Embat Flow (Embat · X-Ray)

**Este es el documento principal del equipo.** Si algo no cuadra con otro
documento, manda este. Está escrito para que lo entienda todo el equipo, no
solo quien programa el motor: cada parte técnica empieza con un párrafo
"en pocas palabras" y las fórmulas van después, para quien las necesite.

Marcas: `✅` validado con Pablo · `☐` pendiente de validar · `⏳` aplazado.

Documentos de apoyo (detalle, no fuente de verdad):
[`scoring-engine.md`](./scoring-engine.md) (score),
[`forecast-engine.md`](./forecast-engine.md) (previsión),
[`decision-engine.md`](./decision-engine.md) (decisión),
[`decisiones-diseno.md`](./decisiones-diseno.md) (argumentario para el jurado),
[`analysis/FINDINGS.md`](../analysis/FINDINGS.md) (hallazgos del dataset).

| § | Contenido |
| --- | --- |
| 0 | El proyecto en una página: reto, producto, piezas, estado, equipo |
| 1 | Score: la nota de cada empresa cada mes |
| 2 | Previsión: la nota dentro de 3 y 6 meses |
| 3 | Decisión: ¿presto?, cuánto, plazo, precio, acción del mes |
| 4 | Producto: pantallas, demo, alcance |
| 5 | Registro de decisiones 1-42 con su justificación |
| 6 | Los datos y sus trampas |
| 7 | Cómo se ejecuta: pipeline, tablas, API, código |
| 8 | Estado a 19-09: hecho, en curso, falta |
| 9 | Resultados medidos (backtest) |
| 10 | Cómo lo contamos al jurado |
| 11 | Glosario |

---

## 0. El proyecto en una página

### 0.1 El reto

Embat (plataforma de tesorería para pymes) plantea el reto **X-Ray**: con los
datos bancarios y de facturación de 1.286 empresas (250 grupos, 24 meses),
construir un score de salud financiera que (a) acierte, (b) anticipe el
deterioro antes de que pase y (c) sirva para un producto real. El jurado
(Embat e inversores) pesa por igual precisión, anticipación y producto, y
dice literal que un modelo sencillo con un producto claro vale más que un
número sofisticado. Al final se entrega el score sobre 60-80 empresas nuevas
que no hemos visto. Bonus: alertas.

Entregables obligatorios: **repositorio + vídeo + demo**. Los tres.

> El enunciado original no está en el repo; esto es nuestro resumen. Si
> alguien tiene el enlace o PDF, enlazarlo aquí.

### 0.2 Qué construimos

**Embat Flow**: financiación de circulante embebida en Embat. Cada pyme tiene
un límite de crédito que se recalcula solo cada mes a partir de su score. Con
ese límite puede anticipar cobros o aplazar pagos a proveedores. El score
decide cuánto, a qué precio, a qué plazo y cuándo se cierra el grifo.

Comprador: Embat, con un partner financiero que pone el dinero y paga por
límite vivo monitorizado. Usuario de la demo: analista de riesgo del partner
mirando su cartera.

### 0.3 Las cuatro piezas, en orden

```text
datos (CSV) → [1] SCORE → [2] PREVISIÓN → [3] DECISIÓN → [4] PRODUCTO
              nota 0-100      nota a 3 y 6 m   ¿presto? cuánto,    pantallas:
              + confianza,    (solo endurece)  plazo, precio,      cartera, ficha,
              por empresa-mes                  acción del mes      grupo, backtest
```

Cada pieza es un motor separado con su contrato (una tabla por empresa y
mes). El motor siguiente solo lee la tabla del anterior. Las pantallas no
calculan nada: pintan las tablas.

### 0.4 Estado a 19-09 (resumen; detalle en §8)

| Pieza | Estado |
| --- | --- |
| [1] Score | Hecho y testeado. 30.864 filas empresa-mes. PR #20 abierta. |
| [2] Previsión | Código en rama `feat/forecast-engine`, sin PR. **No conectado**: la decisión corre "sin previsión". |
| [3] Decisión | Hecho y testeado. Calibrado el 19-09 (decisiones 39-42). PR #21 abierta. |
| [4] Producto | **Sin empezar.** La app sigue siendo la plantilla. API y export CSV ya existen. |
| Backtest | Se calcula en cada run. Las métricas de alerta hoy son malas (§9). |
| Entregables | Repo ✔ · vídeo ✘ · demo ✘ |

### 0.5 Equipo y forma de trabajar

Cuatro personas. Pablo lleva producto y pitch y valida cada decisión de
diseño una por una; la justificación se escribe siempre (§5), es lo que se
defiende ante el jurado. El resto se reparte pipeline de datos, motor de
decisión e interfaz. Cualquier cambio de regla pasa por §5 antes de tocar
código. Ramas por feature con PR a `main`. Node 22 (`fnm use 22`).

---

## 1. Score — por empresa × mes

> **En pocas palabras.** Cada empresa recibe cada mes una nota de 0 a 100 y
> una confianza de 0 a 1 (cuánto nos fiamos de la nota). La nota responde a
> tres preguntas: ¿le sobra caja para pagar más cuotas? (bloque A, pesa 45),
> ¿paga lo que ya debe? (bloque B, pesa 30), ¿depende de pocos clientes y le
> pagan tarde? (bloque C, pesa 25). Encima se ajusta por el grupo: si el
> resto del grupo está mejor y tiene dinero, sube (aval); si está peor, baja
> (contagio). Estados: sana ≥ 70, vigilar 45-70, riesgo < 45; con confianza
> < 0,3 no opinamos. Cada punto de la nota se descompone exacto en la
> aportación de cada variable (la "cascada"), así el analista ve por qué
> cambió. Solo se usa lo que se sabía a fin de ese mes: nunca la foto final
> del dataset.

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

> **En pocas palabras.** Con la nota de hoy y su tendencia estimamos la nota
> dentro de 3 y 6 meses, sin modelo entrenado: cada variable sigue su
> tendencia y se recalcula la misma fórmula. La previsión solo puede
> endurecer las condiciones (acortar plazo, reducir antes, subir precio),
> nunca mejorarlas. **Estado:** código en la rama `feat/forecast-engine`, no
> conectado; hasta que bata al baseline en backtest la decisión corre sin
> ella (`banda_pred_3m = banda actual`).

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

> **En pocas palabras.** Con la fila del score respondemos en orden: ¿te
> puedo prestar? (seis puertas; la primera que falla es el motivo), ¿cuánto?
> (límite L: lo que su caja estresada devuelve en 12 meses, topado por lo
> que cobra en 3), ¿a qué plazo? (30 a 180 días según banda y tendencia), ¿a
> qué precio? (TAE base por banda más recargos explicables). Se ofrece un
> menú: a más plazo, más cantidad pero más caro. Cada mes sale una acción
> (abrir, ampliar, mantener, reducir, cerrar) con freno para que el grifo no
> oscile por un mes ruidoso.

Entrada: fila del score (§1). Salida por empresa-mes: `elegible`, `motivo`,
`L` (límite), `menu[]` de opciones (plazo, cantidad máx, TAE), `accion`.
Todo validado 19-09 (decisiones 11, 12, 17-23 y la calibración 39-42).

```text
0. Elegibilidad   ¿te puedo prestar?        → sí / no + motivo
1. Cantidad       límite máximo L           → §3.1
2. Plazo          tenor máximo T_max        → §3.2
3. Interés        TAE de cada (cantidad, plazo) → §3.3
Dependencia: región factible (cantidad, plazo) + precio función de ambas → §3.4
```

### 3.0 Elegibilidad ✅

Seis puertas, todas deben pasar. La primera que falla es el `motivo`. Lo que
cambia con la decisión 42 no es la puerta sino **cuándo se cierra el grifo**:
dos de ellas (confianza y la capacidad de `caja`) piden dos meses seguidos.

| Puerta | Regla | Blanda/dura | Por qué |
| --- | --- | --- | --- |
| Historia | `confianza ≥ 0,4` (≈ 5 meses con movimientos) | blanda (39, 42) | Sin historia no hay opinión |
| Estado | `score ≥ 45` | dura | Estado riesgo (5) |
| Fiabilidad | racha B2 < 2 | dura | Dos meses sin pagar = impago real (7) |
| Caja | `racha_deficit < 3` y `capacidad_cuota_adv > 0` | racha dura, capacidad blanda (42) | La caja estresada debe cubrir las cuotas actuales con margen |
| Clientes | C4 vencido sin cobrar ≤ 40 % | dura | Cobros futuros comprometidos (12) |
| Grupo | sin cross-default activo | dura | Si cae quien sostiene el grupo, el aval no vale (17) |

- La confianza de la puerta es 0,4 (decisión 39): 0,4-0,5 son cinco meses de
  historia con cobertura buena, no "sin datos". Por encima de la puerta la
  confianza sigue descontando límite (`× min(1, conf/0,6)`) y subiendo precio
  (`+1 pp` por debajo de 0,7): la puerta solo decide **si opinamos**.
- **Cierre confirmado** (decisión 42): fallar una puerta blanda con línea viva no
  cierra el primer mes. La fila sale `accion = "mantener"`, `L = 0`,
  `L_vigente = L_prev` y `cierre_pendiente = true` (no elegible, con el motivo de
  la puerta); al segundo mes seguido se cierra. Las puertas duras cierran ya.
- `capacidad_cuota_adv` es la de §3.1, calculada por el motor de decisión.

### 3.1 Cantidad: límite L ✅

```text
capacidad_cuota_adv = max(0, (0,9·cobros_op − 1,05·pagos_op)_media6m / 1,3 − servicio_deuda_media6m)
limite_cap          = capacidad_cuota_adv × 12
limite_op           = 0,8 × media3m(cobros_op) × 3
L                   = min(limite_cap, limite_op) × factor_banda × min(1, confianza / 0,6)
```

El estrés (−10 % cobros / +5 % pagos) es **propio del motor de decisión**
(decisión 40) y no el de scoring (−20 %/+10 %), que se queda para `D3` del aval
de grupo (§1.7). Cobros ya infravalorados + −20 % era penalizar dos veces. La
cobertura sigue en 1,3: el escenario adverso se suaviza en los flujos, no en el
colchón de servicio de deuda.

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
- Techo de grupo con capacidad consolidada 0 (decisión 41): no se prorratea a
  cero. Los miembros vivos bajan **una banda** y la ficha dice "Grupo sin
  capacidad consolidada: banda −1". El prorrateo sigue igual mientras
  `L_grupo > 0`.
- Cierre confirmado (decisión 42): `cerrar` por una puerta blanda (confianza, o
  `caja` solo por capacidad) necesita dos meses seguidos; el primero sale
  `mantener` con `cierre_pendiente`. Coherente con "un mes no es tendencia".

---

## 4. Producto

> **En pocas palabras.** Cuatro pantallas para el analista del partner:
> cartera, ficha de empresa, grupo y backtest, todas "a cierre del mes t"
> con un selector de mes que deja ver que avisamos antes de que pasara. La
> interfaz no calcula: lee las tablas de score y decisión. **Hoy no está
> construida** (§8).

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
| 17 | Techo de grupo y cross-default al 30 % | El aval no se cuenta dos veces entre filiales. Si cae quien sostiene el grupo, el aval desaparece. Run 2026-09-19: de 30.137 cierres, `caja` (capacidad estresada ≤ 0) aparecía en 24.944 y `historia` (confianza < 0,5) en 22.801; el techo de grupo solo en 371 (1,2 %), pero cerraba al único miembro solvente de su grupo. Calibrado en las decisiones 39-41: el techo a 0 baja una banda en vez de cerrar (41) y la capacidad se recalcula con el estrés propio del motor (40). | ✅ 19-09 (techo resuelto en la 41) |
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
| 37 | La previsión solo endurece: plazo, reducción preventiva a 2 meses, ampliar condicionado, +0,5 pp | Coste de una previsión ruidosa = cerrar grifos sanos; por eso exige dos meses y nunca sube. Una previsión buena no sustituye a verlo pasar. Comparación siempre contra la banda actual (no la efectiva), en plazo, interés y acción. | ✅ 19-09 |
| 38 | Backtest contra baseline ingenuo; si no lo bate, no se conecta | La previsión tiene que demostrar valor en meses de anticipación, no en sofisticación. | ✅ 19-09 |
| 39 | Puerta `historia`: confianza ≥ 0,4 (era 0,5) | La mediana de confianza de la cartera en 2026-08 es 0,44: el tramo 0,4-0,5 son cinco meses de historia con cobertura buena, no "sin datos" (eso es 0,3). La confianza sigue descontando por encima de la puerta —límite `× min(1, conf/0,6)` y precio `+1 pp` por debajo de 0,7—, así que la puerta solo decide **si opinamos**, no cuánto. Run 2026-09-19: pasan la puerta 560 → 723 empresas; elegibles 79 → 109 en 2026-08. | ✅ 19-09 |
| 40 | Estrés de capacidad propio del motor de decisión: −10 % cobros / +5 % pagos, cobertura 1,3 (era −20/+10/1,3) | Los cobros ya están infravalorados —el 25 % de los movimientos no se clasifica—, así que el −20 % penalizaba dos veces lo mismo. La cobertura (DSCR 1,3) se mantiene intacta: escenario adverso moderado sobre datos ya conservadores. El estrés de scoring (0,8/1,1) **no** cambia: sigue alimentando `D3` del aval de grupo, que mide si el padre *puede avalar*; el de decisión mide cuánto *se puede prestar*. Dos escenarios distintos a propósito. Run 2026-09-19: capacidad > 0 en 337 → 417 empresas; elegibles 79 → 115 en 2026-08 (con la 39, 153). | ✅ 19-09 |
| 41 | Techo de grupo con capacidad consolidada 0: bajar una banda en vez de cerrar (opción i de la 17) | Las hermanas sin datos aportan pagos clasificados y pocos cobros clasificados, así que la caja consolidada estresada se va a negativo por falta de dato, no por riesgo, y el techo cerraba al único miembro solvente: 34 de las 79 empresas que pasaban las puertas en 2026-08, 637 de 1.098 empresa-mes sobre 24 meses. Con capacidad 0 el grupo sigue penalizado (una banda = −30 % de límite y +2 pp) y la ficha lo dice: "grupo sin capacidad consolidada". El prorrateo se mantiene siempre que `L_grupo > 0`. Es la única opción coherente con el aval: una filial puede recibir +10 puntos de aval del padre y no puede a la vez quedar cerrada por el techo de ese mismo padre. | ✅ 19-09 |
| 42 | Cierre confirmado para las puertas blandas (opción i): `historia` y la capacidad de `caja` necesitan dos meses seguidos | 334 de los 1.098 empresa-mes que pasaban las puertas venían justo después de un mes cerrado (parpadeo en el umbral) y 36 de las 79 empresas de 2026-08 estaban esperando reapertura. `estado`, `fiabilidad`, `clientes`, `grupo` y `racha_deficit > 2` cierran el mismo mes: son hechos, no umbrales que tiritan. Coherente con el resto del motor ("dirección a 3 meses, estructural tras 2"). Coste: un mes más de exposición, acotado por el límite operativo. | ✅ 19-09 |

**Estado 19-09:** 42 de 42 decisiones validadas. Ninguna abierta.

**Revisitar:** decisión 2, excepción de confianza 0,90 para las
categorías nuevas de #12. Y la cuota esperada de `debt_repayment`
(scoring-engine §5.2), que usa `outstanding_balance` de
`debt_schedule_config.csv` —una foto final— para el término de interés,
en contra de la regla de «sin foto final»: desviación pequeña y aceptada.
El techo de grupo (decisión 17) sale de la lista: la decisión 41 lo cierra.

---

## 6. Los datos y sus trampas

### 6.1 Qué hay en `dataset/` (Git LFS, solo lectura)

Dataset sintético: las empresas no son reales, pero los números se generaron
a partir de estadísticas de tesorería real de pymes.

| Fichero | Filas | Qué es |
| --- | --- | --- |
| `groups.csv` | 250 | Un grupo (holding) por fila: de 1 a 24 empresas, mediana 2 |
| `companies.csv` | 1.286 | Empresa: grupo, moneda, ERP, fecha de alta. País casi siempre vacío |
| `banking_products.csv` | 5.987 | Cuentas bancarias (corriente, ahorro, tarjeta, wallet) |
| `debt_products.csv` | 2.239 | Préstamos, leasing, líneas de crédito, factoring; con `granted` / `outstanding` |
| `debt_schedule_config.csv` | 87 | Cuadro de amortización; solo 40 empresas lo tienen |
| `transactions.csv` | 2.556.437 (472 MB) | Movimientos bancarios 2024-09 → 2026-09: importe con signo, categoría, contraparte |
| `invoices.csv` | 897.894 (172 MB) | Facturas del ERP: emisión, vencimiento, pago, importe, pendiente, estado |
| `balances.csv` | 7.996 | Saldo por producto, **una sola foto** a 2026-09-01 |

Cobertura: movimientos bancarios en el 100 % de empresas; facturas en el
61 % (784); algún producto de deuda en el 29 % (378); línea de crédito en el
16 % (206). 44 monedas, pero 10 cubren el 98,5 %. Solo 373 empresas tienen
los 24 meses completos; la mediana es 19.

### 6.2 Trampas (cada una nos costó horas; no repetir)

- **Foto final ≠ historia.** `balances`, `status`, `pending_amount` y
  `outstanding` son a fecha de extracción. Usarlos en un mes anterior es
  mirar el futuro. Regla: para `t < 2026-09` solo movimientos y facturas
  con fecha ≤ fin de mes.
- **`payment_date` casi siempre es `due_date` copiada.** Coincide en el
  62 % de facturas y en el 96 % de las vencidas. Solo cuenta como pago si
  `status = paid`.
- **2026-09 está truncado** (~11 movimientos por empresa frente a ~110).
  Último mes completo: 2026-08.
- **`exchange_rate` no convierte a euros**: convierte moneda del producto a
  moneda de la empresa. A euros se pasa con nuestra tabla mensual (§1.0).
- **Los traspasos entre cuentas del mismo grupo son casi la mitad de los
  euros** y solo un tercio va etiquetado `transfer`. Se emparejan por
  importe, signo y fecha (§1.0). Sin esto prestaríamos contra dinero de la
  matriz.
- **25 % de movimientos sin categoría.** Recuperamos la mitad del volumen
  con la reclasificación (`analysis/08_categories.py`); el resto queda
  `unknown` y baja la confianza en vez de contaminar la nota.
- **`invoices.csv` no está mezclado**: las primeras 400 k filas tienen
  0,05 % de vencidas frente al 22 % real. Nunca muestrear por cabecera.
- **El 94,5 % de las empresas está en un grupo**: cualquier partición
  ajuste / validación va por `group_id`, nunca por empresa (fuga vía
  hermanas).
- **La tendencia mes a mes es ruido** (FINDINGS §1): no se suma al score;
  se publica aparte como dirección y exige persistencia.
- **El saldo histórico se reconstruye hacia atrás** desde la foto; el 8,2 %
  de los meses sale con caja negativa que puede ser artefacto. El score no
  usa el saldo.

### 6.3 Análisis previo (`analysis/`, Python)

Scripts `00`-`09` más `fx.py` y `report.py`; conclusiones en
`analysis/FINDINGS.md` (los números se regeneran con `06_report.py
--check`). Lo que el motor usa de aquí: `transaction_categories.csv`
(categorías recuperadas) y las reglas de divisa y espejos, ya reescritas en
TypeScript.

---

## 7. Cómo se ejecuta

### 7.1 Arranque

```bash
git lfs install && git lfs pull   # dataset
fnm use 22                         # Node 22 obligatorio (Prisma 7)
pnpm install
pnpm db:setup                      # Postgres en Docker + esquema + pipeline completo (idempotente)
pnpm dev                           # http://localhost:3000
```

`pnpm db:setup:force` recalcula aunque ya haya un run. Docker Desktop tiene
que estar arrancado.

### 7.2 Pipeline (5 pasos; cada uno lee la salida del anterior en `tmp/scoring-v1/`)

| Paso | Comando | Qué hace | Salida |
| --- | --- | --- | --- |
| 0 (opcional) | `python analysis/08_categories.py` y `python analysis/09_export_categories.py` | recupera categorías | `analysis/transaction_categories.csv`; la ingesta lo coge sola si existe |
| 1 | `pnpm scoring:fit` | lee CSV, pasa a €, empareja espejos, congela percentiles p5/p95 en las empresas de ajuste | particiones por grupo + parámetros versionados. Primera vez o CSV nuevos: `SCORING_REINGEST=1` (tarda minutos) |
| 2 | `pnpm scoring:score` | score por empresa-mes (§1) | `scores.jsonl` |
| 3 | `pnpm scoring:decide` | decisión por empresa-mes, grupo entero de una vez (§3) | `decisions.jsonl`, `decision-parameters.json` |
| 4 | `pnpm scoring:backtest` | métricas del score y bloque `decision` (§9) | `backtest.json` |
| 5 | `pnpm scoring:import` | carga a Postgres | tablas de §7.3 |

Variables de entorno: `SCORING_DATASET`, `SCORING_OUT`, `SCORING_CATEGORIES`,
`SCORING_PARAMS`. Todos los números del algoritmo viven en tablas de
parámetros con `version_parametros` (un hash): cambiar un peso cambia la
versión y cada fila guarda con cuál se calculó. Ningún número suelto en
código.

### 7.3 Tablas (Postgres, `prisma/schema/scoring.prisma`)

| Tabla | Clave | Columnas planas | Resto |
| --- | --- | --- | --- |
| `score_runs` | run | versión de parámetros, estado, manifest, métricas | |
| `score_parameters` | versión (hash) | JSON con todos los parámetros | |
| `score_companies` | `company_id` | `group_id`, moneda | |
| `company_month_scores` | run + empresa + mes | `score`, `confidence`, `estado`, `direction` | `data` JSON = contrato completo (scoring-engine §10) |
| `company_month_decisions` | run + empresa + mes | `band`, `action`, `recommendedLimit`, `appliedLimit` | `data` JSON = contrato completo (decision-engine §10) |

`company_month_forecast` (forecast-engine §8) todavía no existe en Prisma.

Campos que lee la interfaz o el motor siguiente. Del score: `score`,
`score_solo`, `aval_grupo`, `confianza`, `estado`, `direccion`,
`naturaleza`, `racha_B2`, `racha_deficit`, cascada por variable. De la
decisión: `elegible`, `motivo`, `banda`, `L`, `L_vigente`, `T_max`,
`menu[]`, `accion`, `motivo_accion`, `cierre_pendiente`.

### 7.4 API (ya existe)

| Ruta | Devuelve |
| --- | --- |
| `GET /api/scoring/companies?month=2026-08` | cartera: filas con `score` y `decision`; filtros por mes, banda, acción, dirección, estado |
| `GET /api/scoring/companies/[companyId]` | historial mensual de una empresa |
| `GET /api/scoring/runs/[runId]` | manifest y métricas del run |
| `GET /api/scoring/export?run=&month=&mode=month\|latest` | CSV con score + decisión (base de la entrega de empresas test, §4.6) |

### 7.5 Código

```text
lib/features/scoring/   14 módulos: ingest, fx, mirrors, flows, variables, fit,
                        aggregate, group, evolution, engine, backtest, api…
lib/features/decision/  13 módulos: eligibility, limit, tenor, interest, menu,
                        group, action, motivos, metrics, engine…
lib/features/forecast/  solo en la rama feat/forecast-engine
scripts/scoring.ts      CLI de los 5 pasos · scripts/setup-db.mjs · scripts/run-tests.mjs
app/api/scoring/*       rutas de §7.4
app/, components/       todavía plantilla (home, sign-in, /tasks de ejemplo)
```

Comprobaciones: `pnpm test` (153 tests en 25 ficheros, `node --test`),
`pnpm run typecheck`, `pnpm run lint`. Hay un test por módulo de cada
motor; no hay tests de API ni de interfaz.

---

## 8. Estado a 19-09: hecho, en curso, falta

### 8.1 Hecho ✔

- Análisis del dataset (FINDINGS §1-8) y reclasificación de categorías.
- Motor de score v1 completo: 30.864 filas; la suma de aportaciones es
  igual al score en todas.
- Motor de decisión v1 completo y calibrado (decisiones 39-42), con techo
  de grupo y cross-default.
- Pipeline por CLI, import a Postgres, API y export CSV.
- 42 decisiones validadas y documento para el jurado
  (`decisiones-diseno.md`).

### 8.2 En curso ⏳

- Previsión v1: código en `feat/forecast-engine` (11 commits). Falta el
  backtest contra el baseline, la tabla en Prisma y conectarla a la
  decisión solo si bate al baseline (decisión 38).
- PRs apiladas sin mergear: #20 scoring → #21 decisión → #22 docs jurado.
  `main` va 67 commits por detrás.

### 8.3 Falta ✘ (por orden de valor para la demo)

1. **Las cuatro pantallas** (§4.1) y el selector de mes. Nada empezado. Es
   lo que el jurado ve.
2. **Calibrar el backtest de alerta** (§9.3): un recall de 0,14 no vende
   anticipación. Palancas: umbral de dirección ±6, persistencia de 2 meses,
   definición de evento (3 meses de déficit).
3. **Golden path**: elegir las empresas X, Y, Z reales del backtest (§4.3).
4. **Vídeo y demo**: obligatorios además del repo.
5. Alertas: feed en cartera y webhook a Slack (bonus del reto).
6. Entrega test: correr el pipeline con `version_parametros` congelada
   sobre las 60-80 empresas nuevas y exportar el CSV. El export existe;
   falta probarlo con datos nuevos.
7. `PRODUCT.md` está vacío: rellenarlo o hacer que apunte a este documento.
8. Botón "explicar en palabras" con LLM: solo si sobra tiempo.

---

## 9. Resultados medidos (run del 19-09, tras la calibración 39-42)

### 9.1 Cuántas empresas pasan cada puerta en 2026-08 (mes de la demo)

| Filtro | Empresas que pasan |
| --- | --- |
| historia: confianza ≥ 0,4 | 723 (eran 560 con 0,5) |
| caja: capacidad estresada > 0 | 417 (eran 337) |
| score ≥ 45 | 1.278 |
| racha de impago ≤ 1 | 1.230 |
| racha de déficit ≤ 2 | 1.006 |
| vencido sin cobrar ≤ 40 % | 1.044 |
| **las seis puertas a la vez** | **147** (eran 79) |
| con línea abierta ese mes | 116 (eran 8) |

### 9.2 En 24 meses, antes → después de calibrar

| Métrica | Antes | Después | Objetivo |
| --- | --- | --- | --- |
| empresas con línea alguna vez | 46 | 308 | |
| acciones abrir / ampliar / reducir | 50 / 35 / 9 | 420 / 417 / 394 | |
| oscilación (cambios de acción) | 5,8 % | 8,6 % | < 20 % ✔ |
| exposición evitada (validación) | 405 k€ | 656 k€ | |
| ingresos simulados (uso del 60 % del límite) | 142 k€ | 1,89 M€ | |
| filas con cierre pendiente en 2026-08 | 0 | 10 | |
| empresas con techo de grupo 0 (banda −1, siguen abiertas) | 0 | 324 | |
| cerradas por prorrateo del techo | 219 | 37 | |

### 9.3 Backtest de alerta del score: hoy es malo y lo decimos

| Métrica | Valor |
| --- | --- |
| recall de deterioro | 0,14 |
| falsas alarmas de deterioro | 95 % |
| recall de recuperación | 0,43 |
| falsas alarmas de recuperación | 89 % |
| lead time mediano | 3 meses, sobre solo 2 eventos casados |

Definiciones en scoring-engine §13. Validación fuera de muestra por grupo,
ventana 2025-09 … 2026-08. Es lo que hay que mover antes de la slide de
anticipación (§8.3, punto 2).

### 9.4 Previsión

Sin medir: el motor no está conectado. Condición para conectarlo (decisión
38): MAE a 3 meses mejor que el baseline `score_pred = score`, mejor acierto
de banda y cobertura del intervalo entre el 75 y el 85 %.

---

## 10. Cómo lo contamos al jurado

1. **Modelo sencillo, producto claro**: catorce variables explicables, un
   menú de financiación encima, cero LLM en el cálculo.
2. **Grupo**: el founder pidió holding; lo medimos con traspasos reales y
   lo enseñamos como aval y contagio en la cascada.
3. **Prudencia con memoria**: histéresis, cierre confirmado, previsión que
   solo endurece. Los parámetros se eligieron con las cifras de §9, no a
   ojo.
4. **Honestidad con el backtest**: las métricas se calculan de verdad y hoy
   son malas; decimos cuáles y qué palanca las mueve.

**Lo que no hacemos, a propósito** (cada uno era una hora que no cambiaba
la demo): LLM en el cálculo, sector inventado, consolidación contable de
grupos, conversión de moneda sin validar, disposiciones y amortizaciones
reales, vista pyme salvo tiempo.

**Aceptado con reserva, a revisitar**: confianza fija 0,90 para
`debt_drawdown` y `balance_adjustment` (decisión 2); la cuota esperada de
`debt_repayment` usa `outstanding_balance`, una foto final, con efecto de
~6 % en la cuota (scoring-engine §5.2).

---

## 11. Glosario

| Término | Qué significa |
| --- | --- |
| score / nota | 0-100 por empresa y mes. Más alto, más sana. |
| confianza | 0-1, cuánto nos fiamos de la nota (meses de historia × cobertura de datos). Se enseña aparte. |
| cascada | Descomposición exacta de la nota en la aportación de cada variable. |
| bloque A / B / C / D | Capacidad de deuda / fiabilidad de pago / dependencia de clientes y proveedores / grupo. |
| aval / contagio | Ajuste de grupo: sube si el resto del grupo está mejor y tiene caja; baja si está peor. |
| `caja_op` | Cobros operativos menos pagos operativos del mes. |
| `capacidad_cuota_adv` | Caja mensual que sobra para cuotas tras estresar (−10 % cobros, +5 % pagos) y cubrir 1,3 veces. |
| banda | A / B / C / D según score (≥ 75, 60-75, 45-60, < 45). Fija el factor de límite y el precio base. |
| `L` / `L_vigente` | Límite calculado este mes / límite que realmente aplica (con freno de ±25 %). |
| `T_max` | Plazo máximo en días. |
| TAE | Precio anual: base por banda más recargos por plazo, confianza, tendencia y previsión. |
| menú | Opciones (plazo, cantidad máxima, TAE) que ve la empresa. |
| puerta | Condición de elegibilidad. Dura: cierra el mismo mes. Blanda: necesita dos meses seguidos. |
| acción | abrir / ampliar / mantener / reducir / cerrar; una por empresa y mes. |
| histéresis | Freno para que el límite no oscile con un mes ruidoso. |
| dirección / naturaleza | mejora, estable o deterioro a 3 meses / temporal o estructural. |
| cross-default | Si cae una empresa que pesa ≥ 30 % del grupo, el resto baja una banda. |
| espejo | Par de movimientos iguales y opuestos el mismo día: traspaso, no actividad. |
| foto final | Datos a fecha de extracción (saldos, estados). Prohibidos para meses anteriores. |
| backtest | Comprobar sobre el pasado si avisamos antes de que pasara. |
| lead time | Meses entre nuestra alerta y el evento. |
| `version_parametros` | Hash de todos los números del motor; viaja con cada fila. |
| run | Una ejecución completa del pipeline. |
