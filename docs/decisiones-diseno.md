# Decisiones de diseño — Embat Flow

Documento para la presentación al jurado y para el equipo. Cada decisión
lleva **qué**, **por qué**, **evidencia** y **qué se descartó**. Las
decisiones cerradas están validadas por Pablo (fecha en cada una) y viven
también en `SOURCE.md` §5, que es la fuente de verdad. Las abiertas llevan
opciones con pros, contras y cifras del dataset para decidir.

Cifras: dataset X-Ray de Embat, 1.286 empresas en 250 grupos, 24 meses.
Run del motor del 19-09-2026 (`scores.jsonl`, `decisions.jsonl`).

---

## 1. Decisiones cerradas (lo que defendemos)

### 1.1 Un score simple con producto encima, no un modelo sofisticado

**Qué.** Score 0-100 por empresa y mes como media ponderada de tres bloques
(capacidad de deuda 45, fiabilidad 30, dependencia 25), catorce variables
con fórmula explícita, sin modelo entrenado. Encima, un producto de
financiación de circulante con límite mensual.

**Por qué.** El reto lo dice literal: un modelo sencillo con un producto
claro vale más que uno sofisticado que se queda en el número. Cada punto
del score se descompone exactamente en la aportación de cada variable
(`Σ aportaciones == score`, comprobado en las 30.864 filas), así que el
analista ve por qué cambió.

**Descartado.** Booster/ranker entrenado (receta en `analysis/FINDINGS.md`
§7). Sin etiquetas de impago, un modelo entrenado predice "meses en
estrés", no morosidad, y no se explica ante un cliente. Queda como v2 del
forecast si el backtest lo justifica.

### 1.2 Confianza separada del score

**Qué.** Cada variable lleva una confianza 0-1 (meses observados ×
cobertura de clasificación). Sin dato, la variable vale 50 y confianza 0.
El score de una empresa con poca historia tiende a 50; su confianza dice
que no sabemos.

**Por qué.** Un historial corto no es mala salud. Mezclar "no sé" con
"está mal" es el error clásico de los scores.

**Evidencia.** 25 % de los movimientos bancarios no tienen categoría; solo
373 de 1.286 empresas tienen 24 meses completos. Sin esta separación el
score sería ruido en la mitad de la cartera.

### 1.3 Riesgo de grupo como ajuste (aval y contagio), no como cuarto bloque

**Qué.** `score = score_solo + aval_grupo`. El aval sube el score si el
resto del grupo está mejor **y** tiene caja para cubrir a la filial; el
contagio lo baja si el grupo está peor, sin condición de caja. Tope ±20.

**Por qué.** Lo pidió el founder de Embat con el ejemplo de la hipoteca
del hijo con el aval del padre. Y no es caso borde: 1.215 de 1.286
empresas están en grupos de 2 a 22. El aval es propiedad de la relación,
no de la empresa: como ajuste se ve en la cascada y se puede apagar.

**Evidencia.** 8.839 traspasos intragrupo emparejables por importe y
fecha (420 M€, 299 empresas). Solo un tercio iban etiquetados como
`transfer`; el resto se colaba como cobro operativo (decisión 24).

**Descartado.** Cuarto bloque con peso fijo: mezclaría "cómo está la
empresa" con "quién la sostiene".

### 1.4 Fiabilidad sobre obligaciones recurrentes, no solo cuotas de deuda

**Qué.** Fiabilidad = paga cada mes impuestos, Seguridad Social, nómina y
cuotas. Un mes saltado y pagado doble al siguiente no penaliza el importe;
solo deja una racha de 1 que se disipa en tres meses. Dos meses seguidos
sin pagar es impago.

**Por qué.** Solo 524 empresas tienen cuotas de préstamo visibles; 1.157
pagan impuestos o SS. Dejar de pagar la Seguridad Social es una señal más
fuerte que una cuota.

### 1.5 Tres motores separados con contratos

**Qué.** Scoring → previsión → decisión, cada uno con su tabla de salida
validada con esquema. La UI lee las tablas y no calcula nada.

**Por qué.** Cada pieza se prueba sola (137 + 88 tests), se puede cambiar
la fórmula del score sin tocar la del límite, y el jurado puede auditar
cada paso. La decisión no sabe qué es un score; solo lee campos.

### 1.6 La decisión responde en orden: ¿presto? → cuánto → plazo → precio

**Qué.** Seis puertas duras (historia, estado, fiabilidad, caja, clientes,
grupo); si todas pasan, un límite `L` = min(capacidad estresada × 12, 80 %
de tres meses de cobros) × factor de banda × confianza. Plazo máximo por
banda y tendencia. Precio aditivo: base de banda + prima de plazo + prima
de poca confianza ± tendencia. Salida: un menú (plazo, cantidad máxima,
TAE) que la empresa elige.

**Por qué.** La dependencia entre cantidad y plazo es real: la cuota
mensual estresada tiene que devolver lo prestado dentro del plazo
(`cantidad ≤ capacidad × meses`). Plazo corto, poco; plazo largo, más pero
más caro. Y el precio se explica sumando componentes que se enseñan en la
ficha.

### 1.7 El grifo no oscila: histéresis, confirmación, reapertura

**Qué.** El límite vigente se mueve como mucho ±25 % al mes. Una bajada
del recomendado se confirma dos meses antes de aplicarse; un deterioro
estructural (dos meses de dirección, dos variables, una de caja) se aplica
de inmediato. Tras un cierre, reapertura solo con dos meses seguidos
elegible.

**Por qué.** Un mes ruidoso no debe abrir y cerrar líneas. El coste de
equivocarse cerrando a un sano es un cliente perdido; el de tardar un mes
en cerrar a uno malo es un mes de exposición acotada.

### 1.8 La previsión solo endurece

**Qué.** Cuando el forecast diga que en tres meses la banda será peor, se
acorta el plazo, se añade +0,5 pp y, tras dos meses, se reduce
preventivamente. Nunca amplía ni abarata sola.

**Por qué.** Una previsión ruidosa que cierra grifos sanos es peor que no
tener previsión. Por eso exige dos meses y solo actúa hacia la prudencia.
Y si en el backtest no bate al baseline ingenuo, no se conecta.

### 1.9 Divisas, categorías y espejos: reglas verificadas en el dataset

- `exchange_rate` = unidades de la moneda del producto por 1 unidad de la
  moneda de la empresa (verificado: USD→EUR 1,16, GBP→EUR 0,86). Todo se
  convierte a € en dos pasos, con tabla mensual sacada de las facturas.
- Signo de factura = dirección: 90 % de las contrapartes con facturas
  positivas cobran por `collection`, 92 % de las negativas se pagan por
  `payment`.
- `collection_refund` son recibos devueltos por clientes (calidad de
  cartera, bloque C); `payment_refund` es devolución de Hacienda o de
  compras, neutral.
- Categoría `-`: se usa la reclasificación por reglas de alta precisión
  (≥ 0,95) y el resto baja la confianza en lugar de inventar ingresos.

### 1.10 Lo que NO hacemos, a propósito

LLM en el cálculo (solo, si acaso, para redactar la explicación a partir
de la cascada); sector inventado; consolidación contable de grupos;
conversión de moneda sin validar; disposiciones y amortizaciones reales;
vista pyme (salvo tiempo). Cada uno de estos era una hora que no cambiaba
la demo.

---

## 2. Decisiones a revisitar (aceptadas con reserva)

| Decisión | Qué se aceptó | Por qué revisitar |
| --- | --- | --- |
| 2 · categorías nuevas de #12 | `debt_drawdown` y `balance_adjustment` entran con confianza 0,90 | Son reglas sin precisión medida; medirla cuando haya etiquetas |
| §5.2 · cuota esperada | Usa `outstanding_balance` (foto final) para el término de interés | Contradice "sin foto final"; efecto pequeño (~6 % de la cuota) |
| 17 · techo de grupo | Σ límites del grupo ≤ límite consolidado | Ver decisión abierta C |

---

## 3. Decisiones abiertas (con cifras para decidir)

Contexto medido en 2026-08, el mes de la demo:

| Filtro | Empresas que pasan (de 1.286) |
| --- | --- |
| confianza ≥ 0,5 (puerta `historia`) | 560 |
| capacidad estresada > 0 (puerta `caja`, estrés −20 %/+10 %/1,3) | 337 |
| score ≥ 45 | 1.278 |
| racha de impago ≤ 1 | 1.230 |
| racha de déficit ≤ 2 | 1.006 |
| vencido sin cobrar ≤ 40 % | 1.044 |
| **las seis puertas a la vez** | **79** |
| … y con línea abierta ese mes | **8** |

De las 79 que pasan las puertas, 34 las cierra el techo de grupo a 0 € y
36 están esperando los dos meses de reapertura tras un cierre reciente.
En los 24 meses: 244 empresas pasan las puertas algún mes, 177 dos meses
seguidos, y solo 46 llegan a tener línea.

Conclusión: hay dos capas. **El scoring deja pasar al 6 %** (confianza y
caja estresada). **De ese 6 %, la dinámica mensual deja al 10 %** (techo
de grupo y reapertura). Hay que decidir en las dos.

### A · Umbral de confianza en la puerta `historia`

Hoy: 0,5. La mediana de confianza en 2026-08 es 0,44; el p75 es 0,63.

| Umbral | Empresas con confianza suficiente | Elegibles (seis puertas) |
| --- | --- | --- |
| 0,5 (actual) | 560 | 79 |
| 0,4 | 723 | 109 |
| 0,3 | 886 | 143 |

**Bajar a 0,4.** Pro: +38 % de elegibles; la confianza 0,4-0,5 suele ser
"cinco meses de historia con buena cobertura", no "sin datos". Contra: se
presta con menos evidencia; el precio ya lo compensa (+1 pp si confianza
< 0,7). Se puede vender como "prestamos desde el quinto mes".

**Bajar a 0,3.** Pro: +80 %. Contra: 0,3 es el umbral de `sin_datos` en el
score; abrir ahí es prestar a quien el score dice que no conoce.
Difícil de defender.

**Mantener 0,5.** Pro: coherente con "sana = score ≥ 70 y confianza ≥
0,5". Contra: la demo enseña una cartera casi cerrada.

**Recomendación:** 0,4, y renombrar la puerta en la ficha como "historial
mínimo: 5 meses". Justificación ante el jurado: la confianza sigue
descontando el precio y el límite (haircut `min(1, confianza/0,6)`); la
puerta solo decide si opinamos.

### B · Estrés de la capacidad de cuota

Hoy: cobros −20 %, pagos +10 %, cobertura 1,3 (guía EBA de escenario
adverso). Empresas con capacidad > 0 en 2026-08:

| Estrés | Capacidad > 0 | Elegibles con confianza ≥ 0,5 | Con ≥ 0,4 |
| --- | --- | --- | --- |
| −20 % / +10 % / 1,3 (actual) | 337 | 79 | 109 |
| −10 % / +5 % / 1,3 | 417 | 115 | 153 |
| 0 / 0 / 1,3 (sin estrés, solo cobertura) | 548 | 175 | — |
| 0 / 0 / 1,0 | 558 | — | — |

Para contexto: 613 empresas tienen margen positivo a seis meses sin
estrés; 1.156 tienen cobros. El estrés actual deja fuera a casi la mitad
de las que ganan dinero.

**Mantener −20/+10/1,3.** Pro: es lo que un banco llamaría prudente; la
EBA pide escenario adverso. Contra: con datos bancarios de pyme, donde el
25 % de movimientos no tiene categoría y los cobros están infraestimados,
un −20 % encima es doble castigo.

**−10 / +5 / 1,3.** Pro: +46 % de elegibles manteniendo cobertura 1,3
(el estándar de DSCR). Contra: menos margen ante un mal trimestre; el
límite operativo (80 % de tres meses de cobros) sigue acotando.

**Sin estrés, cobertura 1,3.** Pro: +120 %. Contra: pierde el argumento
"escenario adverso" que el jurado de Embat (ex banca) va a preguntar.

**Recomendación:** −10 / +5 / 1,3. Se defiende como "escenario adverso
moderado sobre datos ya conservadores" y mantiene el DSCR 1,3 intacto.
Con A y B juntos: 153 elegibles en 2026-08 (×2 respecto a hoy).

### C · Techo de grupo cuando la capacidad consolidada es 0

Hoy: Σ límites del grupo ≤ límite calculado sobre los flujos consolidados
del grupo; si el grupo consolidado no tiene capacidad estresada, el techo
es 0 y se cierra a todos. En 2026-08 cierra a 34 de las 79 que pasan las
puertas; en los 24 meses, a 637 de 1.098 filas que pasan las puertas.

**Por qué pasa.** Las hermanas sin datos aportan pagos clasificados pero
pocos cobros clasificados, así que el consolidado sale negativo aunque la
filial sana genere caja.

**Opción i · con capacidad consolidada 0, bajar una banda en vez de
cerrar.** Pro: el techo sigue existiendo cuando es positivo (prorrateo),
y un grupo que consume caja sigue penalizado (una banda = −30 % de
límite y +2 pp). Contra: se presta a una filial cuyo grupo, en agregado,
quema caja; hay que decirlo en la ficha ("grupo consume caja").

**Opción ii · consolidar solo hermanas con confianza ≥ 0,5.** Pro: quita
el ruido de las hermanas sin datos. Contra: deja fuera del techo a
empresas reales del grupo; el techo pierde su sentido de "no contar el
aval dos veces".

**Opción iii · mantener.** Pro: es la lectura literal de la decisión 17 y
la más prudente. Contra: contradice el aval: la misma filial que recibe
+10 puntos de aval del padre puede quedar cerrada por el techo del padre.

**Recomendación:** opción i, con el motivo visible. Es la única que
mantiene coherente aval y techo.

### D · Cierre por una puerta y reapertura a dos meses

Hoy: fallar cualquier puerta un mes = `cerrar`; reabrir exige dos meses
seguidos pasando todas. En 2026-08, 36 de las 79 que pasan están en
espera de reapertura; 334 de los 1.098 meses "puertas ok" vienen justo
después de un mes cerrado (parpadeo en el umbral).

**Opción i · cierre confirmado para puertas blandas.** `historia` y `caja`
(capacidad) fallan por un mes ruidoso; exigir dos meses seguidos de fallo
antes de cerrar, manteniendo cierre inmediato para `estado`, `fiabilidad`,
`clientes` y `grupo`. Pro: elimina la mayor parte del parpadeo sin tocar
las señales de riesgo real. Contra: un mes más de exposición cuando el
deterioro es real; acotado por el límite operativo.

**Opción ii · reapertura a un mes.** Pro: simple. Contra: reabre igual de
rápido a quien cerró por impago; pierde el argumento de prudencia.

**Opción iii · mantener.** Pro: prudente. Contra: en la demo se ve
abrir-cerrar-esperar-abrir en empresas sanas.

**Recomendación:** opción i. Coherente con "un mes no es tendencia" que
ya aplicamos en el score (dirección a tres meses, estructural a dos).

### E · Efecto combinado (estimación)

| Escenario | Elegibles 2026-08 | Con línea (estimado) |
| --- | --- | --- |
| Hoy | 79 | 8 |
| A (0,4) + B (−10/+5) | 153 | ~40 |
| A + B + C (techo i) | 153 | ~90 |
| A + B + C + D (cierre confirmado) | 153 | ~120 |

Las estimaciones de "con línea" salen de aplicar cada regla a las 79-153
que pasan las puertas; la cifra exacta la da el run del motor tras
cambiar los parámetros (10 s).

### F · Umbrales de alerta del backtest

Recall de deterioro 0,14 con 95 % de falsas alarmas; recuperación 0,43 y
89 %. Lead time mediano 3 meses sobre 2 eventos casados. Palancas:
umbral de dirección (±6 puntos en tres meses), persistencia (2 meses),
definición de evento (3 meses de déficit). Es la siguiente iteración del
scoring, no de la decisión; sin ella, la slide de anticipación se apoya
en dos casos.

---

## 4. Cómo se contará al jurado

1. **Modelo sencillo, producto claro**: catorce variables explicables, un
   menú de financiación encima, cero LLM en el cálculo.
2. **Grupo**: el founder pidió holding; lo medimos con traspasos reales y
   lo enseñamos como aval y contagio en la cascada.
3. **Prudencia con memoria**: histéresis, confirmación, previsión que solo
   endurece. Y los parámetros se eligieron con las cifras de la sección 3,
   no a ojo.
4. **Honestidad con el backtest**: las métricas se calculan de verdad y
   hoy son malas; decimos cuáles y qué palanca las mueve.
