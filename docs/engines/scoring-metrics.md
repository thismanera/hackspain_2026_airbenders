# Guía de las métricas de scoring

El scoring convierte movimientos bancarios y facturas en una nota de salud.
Esta guía explica qué significa cada cifra y cómo leerla. Las fórmulas vigentes
están en [variables.ts](../../lib/features/scoring/variables.ts),
[aggregate.ts](../../lib/features/scoring/aggregate.ts) y
[params.ts](../../lib/features/scoring/params.ts), contrato `scoreSolo-holding-v7`.

## 1. Las seis cifras que conviene distinguir

| Campo             | Qué significa                                    | Ejemplo                                                  |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------- |
| `raw`             | Medida original, antes de puntuar                | Margen de caja de 0,10: queda el 10 % de lo cobrado      |
| `subnota`         | Valor de esa medida en una escala de 0 a 100     | Un margen del 10 % obtiene 70                            |
| `conf`            | Evidencia disponible para esa variable, de 0 a 1 | 0,6 reduce la fuerza de su nota                          |
| `pesoEfectivo`    | Parte de la nota total asignada a esa variable   | 0,10 significa un peso del 10 %                          |
| `aportacion`      | Puntos que realmente añade al total              | Una nota efectiva de 62 con peso 10 % aporta 6,2         |
| `subscores.A/B/C` | Nota de cada bloque, de 0 a 100                  | Permite localizar dónde están las fortalezas y presiones |

En los datos, un ratio de `0.20` significa 20 %. Pasar de 20 % a 35 % es subir
15 puntos porcentuales; no es subir 15 puntos de score. Los importes monetarios
se expresan en euros y los retrasos en días.

La **caja operativa** es lo cobrado por la actividad menos lo pagado por la
actividad. No es el saldo bancario, el beneficio contable ni la caja que queda
después de todas las operaciones financieras.

## 2. Cómo se construye la puntuación

Para cada variable activa se calcula:

```text
nota efectiva = 50 + confianza de la variable × (subnota − 50)
aportación = peso efectivo × nota efectiva
scoreSolo = suma de las 14 aportaciones de A–C
```

Ejemplo: A1 tiene margen 10 %, subnota 70, confianza 0,6 y peso 10 %.
Su nota efectiva es `50 + 0,6 × 20 = 62`; aporta `0,10 × 62 = 6,2` puntos.
Si su confianza fuera 1, aportaría 7 puntos. La incertidumbre acerca las notas
al punto neutral 50, tanto si la subnota era buena como si era mala.

**Ausente y no aplicable son situaciones diferentes.**

- Una variable activa sin dato mantiene peso, subnota neutral 50 y normalmente
  confianza cero. Sigue aportando `peso × 50`.
- Una variable excluida por el régimen de deuda tiene `aplicable: false`, peso
  y aportación cero y `subnota: null`. Su `conf` publicada es 1 por convención
  interna, pero no entra en la confianza del bloque.
- Un valor bruto cero es un dato. Puede significar ausencia de devoluciones o
  un margen nulo; su interpretación depende de la variable.

Por eso una nota cercana a 50 puede reflejar información insuficiente. Siempre
debe acompañarse de `confianza`, cobertura y `estadoSolo`.

## 3. Bloque A: caja y capacidad para atender deuda

Pesa el 45 % del total. Usa los últimos seis meses de calendario, incluido el
mes consultado. «Suma 6m» significa sumar ese período; si falta un mes no se
inventa una observación.

| ID  | Pregunta de negocio                                      | Cálculo de `raw`                                                   | Unidad y sentido favorable         | Referencia saludable |
| --- | -------------------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------- | -------------------- |
| A1  | ¿Queda caja después de pagar la actividad?               | Suma de caja operativa / suma de cobros                            | Ratio; mayor es mejor              | ≥ 10 %               |
| A2  | ¿Con qué frecuencia falta caja operativa?                | Meses observados con pagos mayores que cobros / meses observados   | Ratio; menor es mejor              | ≤ 1 de cada 6        |
| A3  | ¿La caja operativa cubre el servicio de deuda?           | Suma de caja operativa / suma de servicio de deuda                 | Veces de cobertura; mayor es mejor | ≥ 1,3 veces          |
| A4  | ¿Qué parte de los cobros absorben los pagos financieros? | Suma de servicio de deuda y amortización de línea / suma de cobros | Ratio; menor es mejor              | ≤ 25 %               |
| A5  | ¿Cuánto depende de nuevas disposiciones de línea?        | Suma de disposiciones de crédito / suma de cobros                  | Ratio; menor es mejor              | ≤ 20 %               |

Si el denominador es cero, el ratio queda ausente. A3 no recibe una cobertura
infinita por no tener deuda. A5 mide disposiciones observadas en relación con
cobros, no el porcentaje utilizado del límite autorizado ni un saldo dispuesto.

Los pesos se adaptan a los productos de la empresa:

| Situación             |   A1 |   A2 |   A3 |   A4 |  A5 | Total |
| --------------------- | ---: | ---: | ---: | ---: | --: | ----: |
| Sin cuotas ni línea   | 25 % | 20 % |  0 % |  0 % | 0 % |  45 % |
| Con cuotas, sin línea | 12 % | 12 % | 11 % | 10 % | 0 % |  45 % |
| Con línea             | 10 % | 10 % | 10 % |  8 % | 7 % |  45 % |

Se consideran cuotas cuando hay servicio de deuda observado en 6 meses o una
cuota programada positiva. Con línea, A3 sigue activo aunque no haya servicio
de deuda medible: estará ausente, no excluido.

`hardcoreRevolving` señala disposiciones positivas en todos los meses observados
de la ventana de seis meses y ninguna amortización, con al menos tres meses
observados y producto de línea. No exige seis meses completos. Resta 20 puntos
a la subnota A5, con mínimo cero, antes de aplicar confianza y peso. Con plena
confianza y peso 7 %, la pérdida máxima de score por esa resta es 1,4 puntos.
Describe movimientos detectados; no acredita por sí solo un saldo permanentemente dispuesto.

## 4. Bloque B: cumplimiento de pagos

Pesa el 30 %. Las obligaciones analizadas son impuestos, Seguridad Social,
nóminas y devolución de deuda.

| ID  | Pregunta de negocio                                  | Cálculo y ventana                                                               | Unidad / mejor sentido | Peso |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------- | ---: |
| B1  | ¿Se ha pagado el importe esperado?                   | Pagado / esperado en 6 meses, limitado a 1                                      | Ratio; alto            | 12 % |
| B2  | ¿Hay meses seguidos sin un pago recurrente esperado? | Mayor racha actual entre las categorías recurrentes de la ventana de 6 meses    | Meses; bajo            | 12 % |
| B3  | ¿Con cuánto retraso se paga a proveedores?           | Mediana de fecha de pago menos vencimiento, en facturas pagadas durante 6 meses | Días; bajo             |  6 % |

Una categoría se considera recurrente si tiene pagos positivos en al menos tres
meses de la ventana. Su importe mensual esperado es la mediana de esos pagos;
para deuda se usa la cuota programada si existe, después de detectar recurrencia.
Se cuenta desde el primer pago positivo de la ventana y solo en meses observados.

Un mes con un pago parcial puede bajar B1, pero B2 cuenta meses con pago cero.
Un mes sin evidencia rompe la racha. Sin categorías recurrentes, B1/B2 son
ausentes aunque `rachaB2` se publique como cero: ese cero no prueba cumplimiento.

B2 tiene una regla propia: sin impago reciente, subnota 100; primera falta,
70; dos o más consecutivas, 0. Al volver a pagar, la penalización se recupera
progresivamente durante tres meses. No se suman episodios aislados como una nueva racha.

B3 puede ser negativo si se paga antes del vencimiento. Se descartan retrasos
con valor absoluto mayor de 365 días. No mide el plazo contractual desde la emisión.

## 5. Bloque C: clientes, proveedores y calidad de cobro

Pesa el 25 %. Concentra más peso en facturas vencidas y recibos devueltos que
en la dependencia de unas pocas contrapartes.

| ID  | Pregunta de negocio                                | Cálculo de `raw`                                                                                             | Ventana                             | Unidad / mejor sentido |  Peso |
| --- | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------- | ---------------------- | ----: |
| C1  | ¿Depende de pocos clientes identificados?          | Cobros de los tres mayores / cobros con contraparte identificada                                             | 12 meses                            | Ratio; bajo            | 1,5 % |
| C2  | ¿Depende de pocos proveedores identificados?       | Pagos a los tres mayores / pagos con contraparte identificada                                                | 12 meses                            | Ratio; bajo            | 1,5 % |
| C3  | ¿Con cuánto retraso se cobra?                      | Mediana de pago menos vencimiento, en facturas cliente pagadas                                               | Pagos en 6 meses                    | Días; bajo             |   4 % |
| C4  | ¿Qué parte del importe vencido sigue sin cobrarse? | Importe de facturas cliente vencidas sin pago / importe de todas las facturas cliente vencidas en la ventana | Vencimientos en 6 meses             | Ratio; bajo            |   8 % |
| C5  | ¿Son regulares los cobros?                         | Mediana de las distancias absolutas a la mediana de cobros, dividida por esa mediana                         | Hasta 12 meses, mínimo 6 observados | Ratio; bajo            |   3 % |
| C6  | ¿Qué peso tienen las devoluciones de recibos?      | Importe de `collection_refund` / cobros operativos                                                           | 6 meses                             | Ratio; bajo            |   7 % |

La **mediana** es el valor central al ordenar los datos. Es menos sensible que
la media a una observación excepcional. La medida de dispersión de C5 se llama
MAD. Si la mediana de cobros no es positiva, C5 queda ausente.

C1/C2 se calculan sobre contrapartes identificadas; si muchas no tienen nombre,
disminuye la confianza. Con solo tres contrapartes conocidas, el ratio será
100 %: conviene mirar la cobertura antes de interpretarlo.

C4 cuenta importes, no número de facturas. Una factura se considera pagada si
su estado es `paid` y su fecha de pago no supera el cierre consultado. El estado
del dataset es una foto final, por lo que la reconstrucción histórica es una
estimación (`C4Estimado`). No equivale a disponer de un registro histórico de estados.

## 6. Escalas: cómo se pasa a una subnota

Las siguientes referencias están fijadas en parámetros. Entre dos referencias
se interpola de forma lineal; fuera de sus extremos se conserva la nota del extremo.

| Variable | Referencias: valor bruto → subnota                    |
| -------- | ----------------------------------------------------- |
| A1       | −20 % → 0; 0 % → 50; 10 % → 70; 30 % → 90; 50 % → 100 |
| A3       | 0 → 0; 1 → 50; 1,3 → 70; 2 → 90; 3 → 100              |
| A4       | 0 % → 100; 25 % → 70; 50 % → 50; 100 % → 0            |
| A5       | 0 % → 100; 20 % → 70; 50 % → 50; 100 % → 0            |
| B1       | 0 % → 0; 80 % → 50; 95 % → 80; 100 % → 100            |
| C4       | 0 % → 100; 20 % → 70; 40 % → 30; 60 % → 0             |
| C6       | 0 % → 100; 0,5 % → 70; 1 % → 40; 2 % → 0              |

B2 usa su regla de rachas. A2, B3, C1, C2, C3 y C5 usan p5/p95 del ajuste:
los valores que delimitan el 5 % inferior y superior de las muestras fiables.
Se puntúa linealmente entre ambos, invirtiendo el sentido porque menor es mejor.
Sin referencias válidas, la subnota es 50. Los percentiles de B2 pueden existir
en parámetros, pero no gobiernan su subnota.

`umbralSano` y `sano` solo publican referencias específicas para A1–A5.
Cumplirlas no garantiza que la subnota efectiva sea 70 ni que la empresa esté sana.

## 7. Confianza y cobertura

| Variables         | Confianza cuando el valor es calculable                                  |
| ----------------- | ------------------------------------------------------------------------ |
| A1–A5, B1, B2, C6 | Meses observados de 6 / 6 × cobertura de clasificación de esos meses     |
| B3, C3            | Mínimo entre 1 y número de facturas con retraso válido / 5               |
| C4                | Mínimo entre 1 y número de facturas cliente vencidas en la ventana / 5   |
| C1, C2            | Meses observados de 12 / 12 × proporción de cobros o pagos identificados |
| C5                | Meses observados de 12 / 12 × cobertura de clasificación de 12 meses     |

La cobertura combina la proporción de importes clasificados y la proporción
de movimientos cuyo importe pudo convertirse. No es simplemente «tener un CSV».
Los meses neutrales sin actividad clasificable no se consideran evidencia operativa.

La confianza de cada bloque se pondera por sus pesos activos. Hay una excepción
vigente: sin cuotas ni línea, `confs.A = (confA1 + confA2) / 2`, aunque sus pesos
sean 25/20. La confianza total es `0,45 × confs.A + 0,30 × confs.B + 0,25 × confs.C`.

`cobertura` publica meses observados, clasificación, número de facturas, productos,
importes excluidos y hermanas con datos. El número total de facturas publicado
puede diferir del usado para una confianza: por ejemplo, B3 descarta retrasos extremos.

### Otros campos de caja que aparecen en la fila

| Campo                                                                      | Unidad            | Significado y uso                                                                                                                                |
| -------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cobrosOpMedia3m`                                                          | Euros por mes     | Cobros medios de tres meses; da escala al límite de decisión                                                                                     |
| `cobrosOpMedia6m`, `pagosOpMedia6m`                                        | Euros por mes     | Entradas y salidas operativas medias de seis meses                                                                                               |
| `servicioDeudaMedia6m`, `amortCreditoMedia6m`                              | Euros por mes     | Servicio de deuda y devolución de línea, publicados por separado                                                                                 |
| `obligacionesRecMedia6m`                                                   | Euros por mes     | Suma media de las categorías nómina, SS, impuestos y principal de deuda; no implica que cada una haya superado el filtro de recurrencia de B1/B2 |
| `capacidadCuotaAdv`                                                        | Euros por mes     | Capacidad calculada con cobros reducidos y pagos aumentados; informa D3, pero no determina directamente el límite de la política actual          |
| `cobrosOpGrupoMedia6m`, `pagosOpGrupoMedia6m`, `servicioDeudaGrupoMedia6m` | Euros por mes     | Flujos medios agregados del grupo; no son su score ni el techo de crédito                                                                        |
| `deficitMes`                                                               | Sí / no / ausente | Si los pagos operativos del mes superan los cobros                                                                                               |
| `margenMes`                                                                | Ratio             | Caja operativa del mes / cobros del mes; nulo sin evidencia o denominador                                                                        |
| `rachaDeficit`                                                             | Meses             | Déficits operativos seguidos; un hueco de observación rompe la racha                                                                             |
| `C3dias`, `C4`                                                             | Días / ratio      | Copias de los valores brutos correspondientes para consulta                                                                                      |

La capacidad estresada se calcula como
`max(0; (0,8 × cobros medios − 1,1 × pagos medios) / 1,3 − servicio de deuda medio)`.
Es un escenario de tensión, no un saldo disponible ni una cantidad concedible.
Las medias dividen por meses de calendario de la ventana, incluso si faltan
observaciones. Su confianza debe leerse por separado.

En cada contribución, `peso` y `pesoEfectivo` publican actualmente el mismo peso
activo. No hay que multiplicarlos entre sí ni interpretar `peso` como una
segunda ponderación adicional.

## 8. Holding: la empresa dentro de su grupo

«Holding» se usa aquí para el conjunto de empresas con el mismo `groupId`.
No disponemos de una jerarquía que identifique jurídicamente a la matriz.

| Campo             | Lectura                                                     | Cálculo o referencia                                                                                    |
| ----------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| D1                | Peso de la empresa en los cobros del grupo                  | Cobros propios de 12 meses / cobros del grupo                                                           |
| D2                | Salud autónoma de las otras empresas                        | Media de `scoreSolo` ponderada por cobros de 12 meses; simple si todos son cero                         |
| D3                | Capacidad estresada del resto frente a obligaciones propias | Suma de `capacidadCuotaAdv` de hermanas / servicio de deuda más obligaciones recurrentes propias medias |
| D4                | Transferencias netas recibidas en relación con cobros       | Entradas menos salidas intragrupo de 12 meses / cobros propios de 12 meses                              |
| D5                | Intensidad de la relación de caja intragrupo                | Entradas más salidas intragrupo / cobros más pagos operativos, en 12 meses                              |
| `confD`           | Evidencia de las hermanas                                   | Media ponderada de su confianza                                                                         |
| `ajusteHolding`   | Puntos añadidos o restados a la empresa                     | Fórmula de recursos y necesidades; límites −30 / +20                                                    |
| `aportacionGrupo` | Aportación efectiva del holding                             | Igual al ajuste publicado en la implementación vigente                                                  |

D5 puede superar 1. D3 es informativo y no gobierna el ajuste. Un préstamo de
tipo `custom` activa `tienePrestamoIntragrupo`, pero su saldo no se suma como una
inyección mensual a D4. Sin hermanas evaluables, el ajuste es cero.

`scoreGrupo = clamp(scoreSolo + ajusteHolding, 0, 100)`: «clamp» significa dejar
el resultado dentro de esos límites. Véase la fórmula monetaria en el
[motor de scoring](./scoring-engine.md#7-ajuste-y-perfil-del-grupo).

## 9. Estado, evolución y explicación

| Campo                          | Qué nos cuenta                                                                                           |
| ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `estadoSolo` / `estadoGrupo`   | Diagnóstico autónomo / con contexto de grupo                                                             |
| `tendScore3m/6m/12m`           | Diferencia autónoma contra exactamente ese número de meses antes; nula sin referencia                    |
| `tend3m.A/B/C`                 | Cambio de la nota del bloque, no de su aportación al total                                               |
| `direccion`                    | Mejora desde +6 puntos trimestrales, deterioro desde −6; estable en el resto y con signos 3m/6m opuestos |
| `naturaleza`                   | Persistencia y amplitud del movimiento: temporal, estructural o sin cambio                               |
| `patronTrayectoria`            | Lectura más específica: caída estructural, inestabilidad, bache, mejora, deterioro temporal o estable    |
| `deltaContrib`                 | Cambio mensual de cada aportación autónoma                                                               |
| `factorDeterminante`           | Variable con mayor cambio mensual absoluto de aportación                                                 |
| `factorDeterminanteGrupo`      | Mayor cambio entre variables autónomas y holding                                                         |
| `diagnosticoMejora`            | Confirmación adicional de mejora y variable que más aporta entre A1/A2/B1/B2/C4                          |
| `inflexion` / `inflexionGrupo` | Origen y primer detonante del giro confirmado en cada serie                                              |
| `canarioEnMina`                | Caída estrictamente mayor de 30 puntos de subnota en B2 o C6                                             |

**Precaución técnica con `deltaGrupo`:** hoy se rellena con el delta del factor
ganador incluyendo grupo. Si gana una variable autónoma, no es el cambio del
holding. Para una descomposición correcta se debe comparar
`aportacionGrupo(t) − aportacionGrupo(t−1)`. Esta discrepancia se recoge en la
[auditoría documental](../product/documentation-audit.md), sin cambiar el algoritmo.

No se debe confundir el detonante inicial de una inflexión con el factor que
más ha cambiado este mes. Tampoco sumar tendencias de bloques como si fueran
puntos de aportación: antes habría que aplicar sus pesos 45/30/25.

## 10. Señales adicionales y vocabulario para el cliente

| Campo técnico             | Expresión comprensible                                 | Alcance                                                                                  |
| ------------------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `alertaTempranaDeterioro` | Señal temprana de empeoramiento                        | Varias reglas de cambio mensual, trimestral y de cobros                                  |
| `evaluacionEwi`           | Indicadores internos para revisar el riesgo            | Con dos de cuatro se propone revisión; no determina una clasificación regulatoria        |
| `requiereAvalMatriz`      | El apoyo del grupo requiere una garantía en la oferta  | Se activa desde +15 puntos; la ruta de decisión también contempla ciertos apoyos menores |
| `alertaPignoracionCaja`   | Revisar garantías o protección de la caja de la filial | Se activa desde −15 puntos; no prueba que haya una garantía constituida                  |
| `gapCicloDias`            | Diferencia entre retrasos de cobro y pago              | `C3 − B3`, redondeado a días; no mide el ciclo completo de caja                          |
| `recomendacionEmbat`      | Oportunidad de mejora para la empresa                  | Revisar cobros cuando esa diferencia supera 30 días                                      |

Por ejemplo, C3 de 60 días y B3 de 20 producen una diferencia de 40 días de
retraso respecto a vencimientos. No sabemos por esos dos valores cuánto tiempo
transcurre entre comprar, vender y cobrar. Los nombres técnicos se conservan por
compatibilidad; en una explicación comercial conviene usar la descripción precisa.

## 11. Cómo interpretar las métricas de validación

| Métrica           | Explicación                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------- |
| MAE               | Error absoluto medio: cuántos puntos se equivoca la previsión, en promedio; menor es mejor              |
| Acierto de banda  | Proporción de predicciones que sitúan a la empresa en el tramo correcto                                 |
| Cobertura p10/p90 | Proporción de resultados reales dentro del intervalo previsto; debe medirse, no darse por garantizada   |
| AUC               | Capacidad de ordenar empresas con y sin el estrés definido; 0,5 equivale a no separar mejor que el azar |
| PR-AUC            | Resumen de precisión y detección de estrés; depende también de la frecuencia de ese estrés              |
| Spearman          | Relación entre el orden por score y el orden por margen futuro                                          |
| Recall            | Proporción de episodios que la alerta consiguió anticipar                                               |
| Falsas alarmas    | Proporción de alertas evaluables sin episodio posterior asociado                                        |
| Lead time         | Meses de antelación de las alertas respecto al episodio                                                 |
| Deciles           | Diez grupos ordenados por nota para comparar tasas de estrés                                            |

El evento validado es estrés operativo, no un default bancario observado. Las
cifras deben ir acompañadas de período, muestra, versión y definición del evento.
«Fuera de muestra» exige datos reservados; un resultado obtenido al ajustar el
modelo no se convierte en validación por llamarlo backtest.
