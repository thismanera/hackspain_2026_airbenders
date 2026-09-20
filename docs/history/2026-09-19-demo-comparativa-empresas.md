> **Archivo histórico.** Copia anterior a la revisión documental del 19-09-2026.
> Conserva propuestas, ejemplos y cifras anteriores; no describe necesariamente el código actual.
> Consulta la [documentación vigente](../product/modules-guide.md).

# Demo: dos empresas con el mismo score y decisiones diferentes

> **Escenario ilustrativo.** Los nombres y cifras de este documento son ficticios y sirven para explicar cómo presentar el scoring, el forecast, la decisión crediticia y el playbook de tesorería. No representan resultados reales del dataset ni una oferta bancaria vinculante.

## Objetivo de la demo

Northbrook Industrial y Velasco Distribución terminan agosto de 2026 con el mismo `scoreSolo`: **62 puntos**. A primera vista parecen equivalentes. Sin embargo, sus trayectorias, su relación con el holding, sus señales tempranas y sus previsiones son muy distintas.

La comparativa debe responder cuatro preguntas:

1. ¿Cómo ha llegado cada empresa al mismo score?
2. ¿Hacia dónde se dirige cada una?
3. ¿Qué riesgo u oportunidad añade el holding?
4. ¿Qué actuación concreta sugiere el sistema?

## Resumen ejecutivo

| Indicador                   |                   Northbrook Industrial |                      Velasco Distribución |
| --------------------------- | --------------------------------------: | ----------------------------------------: |
| `scoreSolo`                 |                                  **62** |                                    **62** |
| Estado autónomo             |                                 Vigilar |                                   Vigilar |
| Trayectoria                 |                                  Mejora |                        Deterioro temporal |
| `ajusteHolding`             |                                 **+16** |                                   **−16** |
| `scoreGrupo`                |                                  **78** |                                    **46** |
| Previsión Solo a 3 meses    |                                      68 |                                        55 |
| Previsión Grupo a 3 meses   |                                      82 |                                        39 |
| Revisión EWI interna        |                                      No |                                        Sí |
| Hardcore revolving          |                                      No |                                        Sí |
| Oportunidad para la empresa | Reducir el desfase entre cobros y pagos | Sanear el circulante y recuperar liquidez |
| Orientación de decisión     |              Oferta condicionada a aval |              Revisar y reducir exposición |

**Lectura para la demo:** el empate de 62 solo describe la salud autónoma observada en agosto. Northbrook está recuperándose y recibe apoyo verificable del grupo. Velasco se deteriora y transfiere caja al holding mientras mantiene un uso crónico de la línea.

## Evolución mensual

Estos valores alimentan dos series en el gráfico principal: una línea continua para `scoreSolo` y otra para `scoreGrupo`. Las proyecciones deben aparecer con línea discontinua y una banda p10–p90.

### Northbrook Industrial

| Mes               | `scoreSolo` | `scoreGrupo` | Lectura                         |
| ----------------- | ----------: | -----------: | ------------------------------- |
| 2026-02           |          66 |           70 | Situación estable               |
| 2026-03           |          57 |           64 | Comienza la contracción de caja |
| 2026-04           |          48 |           57 | Suelo de la trayectoria         |
| 2026-05           |          52 |           64 | Primer mes de recuperación      |
| 2026-06           |          56 |           70 | Mejora de margen y cobros       |
| 2026-07           |          59 |           74 | Recuperación sostenida          |
| 2026-08           |      **62** |       **78** | Cierre observado                |
| 2026-11, previsto |      **68** |       **82** | Forecast a 3 meses              |
| 2027-02, previsto |      **71** |       **84** | Forecast a 6 meses              |

Intervalos ilustrativos:

- Solo a 3 meses: **63–73**.
- Grupo a 3 meses: **75–87**.
- Solo a 6 meses: **64–77**.
- Grupo a 6 meses: **75–90**.

### Velasco Distribución

| Mes               | `scoreSolo` | `scoreGrupo` | Lectura                          |
| ----------------- | ----------: | -----------: | -------------------------------- |
| 2026-02           |          73 |           70 | Situación favorable              |
| 2026-03           |          76 |           72 | Pico de la trayectoria           |
| 2026-04           |          72 |           66 | Empieza el deterioro             |
| 2026-05           |          69 |           60 | Aumenta la tensión de circulante |
| 2026-06           |          67 |           55 | Mayor drenaje hacia el grupo     |
| 2026-07           |          64 |           50 | Persistencia del deterioro       |
| 2026-08           |      **62** |       **46** | Cierre observado                 |
| 2026-11, previsto |      **55** |       **39** | Forecast a 3 meses               |
| 2027-02, previsto |      **51** |       **35** | Forecast a 6 meses               |

Intervalos ilustrativos:

- Solo a 3 meses: **49–61**.
- Grupo a 3 meses: **32–46**.
- Solo a 6 meses: **43–59**.
- Grupo a 6 meses: **27–44**.

> En esta demo el forecast está en **modo sombra**. Se muestra como información prospectiva, pero no modifica automáticamente la decisión hasta demostrar que supera al baseline fuera de muestra.

## Cómo se forma el mismo `scoreSolo`

El score autónomo se construye exclusivamente con los bloques A–C. Las aportaciones ponderadas suman exactamente 62 puntos en ambas empresas, aunque la composición es diferente.

| Bloque                    |      Peso | Northbrook |  Velasco |
| ------------------------- | --------: | ---------: | -------: |
| A. Liquidez y cobertura   |      45 % |       28,8 |     29,7 |
| B. Cumplimiento de pagos  |      30 % |       19,5 |     19,2 |
| C. Calidad del circulante |      25 % |       13,7 |     13,1 |
| **Total `scoreSolo`**     | **100 %** |   **62,0** | **62,0** |

### Lectura de Northbrook

- El margen de caja todavía es moderado, pero mejora de forma continuada desde abril.
- No presenta una racha activa de impagos recurrentes.
- El principal lastre sigue siendo el retraso de cobro a clientes.
- La calidad operativa es compatible con una recuperación, aunque todavía no con un estado sano.

### Lectura de Velasco

- Mantiene una foto aceptable de liquidez, pero pierde aportación mes a mes.
- El uso continuado de la póliza sin amortización activa `hardcoreRevolving` y penaliza A5.
- Aumentan la morosidad comercial y el retraso a proveedores.
- La misma nota final oculta una dirección claramente menos favorable.

## Factores explicativos

| Explicación                  | Northbrook                       | Velasco                          |
| ---------------------------- | -------------------------------- | -------------------------------- |
| Factor determinante autónomo | A1: mejora del margen de caja    | C4: aumento de facturas vencidas |
| Delta de aportación mensual  | +2,1 puntos                      | −1,9 puntos                      |
| Factor incluyendo holding    | Holding: +3,0 puntos             | Holding: −2,5 puntos             |
| Canario en la mina           | No detectado                     | C6: aumento de recibos devueltos |
| Alerta temprana              | No                               | Sí                               |
| Inflexión autónoma           | Suelo alcista en abril           | Pico bajista en marzo            |
| Detonante observado          | A1: primer aumento de aportación | C4: primera caída de aportación  |

El texto de la web debe hablar de **cambios observados**. Por ejemplo: “La aportación de C4 comenzó a caer después del pico de marzo”. No debe afirmar que una decisión concreta de la dirección causó el deterioro.

## Contexto del holding

### Northbrook

- `ajusteHolding`: **+16 puntos**.
- `scoreGrupo`: **78**.
- Perfil: **filial subvencionada**.
- La empresa recibe recursos netos del grupo y las hermanas presentan capacidad suficiente.
- `requiereAvalMatriz`: **sí**, porque el ajuste es al menos +15.

El apoyo permite estudiar una oferta condicionada, pero no transforma el diagnóstico autónomo. La pantalla debe conservar ambos scores y explicar que el límite depende de un aval solidario de la matriz.

### Velasco

- `ajusteHolding`: **−16 puntos**.
- `scoreGrupo`: **46**.
- Perfil: **drenaje de tesorería**.
- La empresa genera capacidad positiva, pero transfiere una parte relevante de sus cobros al grupo.
- `alertaPignoracionCaja`: **sí**, porque el ajuste es igual o inferior a −15.

La lectura para el banco es que parte de la caja disponible puede no permanecer en la filial. El holding empeora la exposición y no debe utilizarse para relajar condiciones.

## Forecast

| Horizonte | Northbrook Solo | Northbrook Grupo | Velasco Solo | Velasco Grupo |
| --------- | --------------: | ---------------: | -----------: | ------------: |
| Observado |              62 |               78 |           62 |            46 |
| 3 meses   |              68 |               82 |           55 |            39 |
| 6 meses   |              71 |               84 |           51 |            35 |

### Drivers previstos de Northbrook

1. Mejora gradual del margen operativo A1.
2. Reducción de meses en déficit A2.
3. Menor retraso de cobro C3.

### Drivers previstos de Velasco

1. Aumento de vencidos C4.
2. Penalización persistente por uso estructural de la línea A5.
3. Deterioro del retraso a proveedores B3.

La interfaz debe indicar para cada objetivo si el forecast está **aplicado a decisión** o en **modo sombra**. También debe aclarar que una probabilidad de deterioro operativo no es una probabilidad de impago.

## Señales EWI y ciclo de caja

| Señal                          | Northbrook | Velasco        |
| ------------------------------ | ---------- | -------------- |
| Impago tributario o recurrente | No         | No             |
| Morosidad comercial            | No         | Sí             |
| Tensión de cobertura           | No         | Sí             |
| Déficit persistente            | No         | No             |
| Revisión Stage 2 candidata     | **No**     | **Sí: 2 de 4** |
| Gap de ciclo                   | +42 días   | +35 días       |
| Hardcore revolving             | No         | Sí             |

`revisionStage2Candidata` es una regla interna de revisión temprana. No debe presentarse como una clasificación regulatoria formal.

### Oportunidad para cada empresa

**Northbrook:** “La empresa tiene la oportunidad de reducir su gap comercial de +42 días y liberar caja antes. Puede acelerar el cobro de facturas, revisar los plazos comerciales y, si encaja con su operativa, financiar de forma selectiva las cuentas por cobrar.”

**Velasco:** “La empresa tiene la oportunidad de sanear su circulante: reducir los +35 días de desfase, recuperar vencidos, pactar mejor los calendarios de pago y disminuir la dependencia estructural de la línea de crédito.”

La oportunidad pertenece a la empresa y describe una mejora posible de su tesorería. Productos como el anticipo de facturas o el confirming pueden aparecer después como instrumentos para ejecutarla, siempre sujetos a elegibilidad y riesgo.

## Decisión crediticia ilustrativa

Las siguientes decisiones muestran cómo podría interpretarse la información en la demo. Los importes y condiciones son ilustrativos; el motor real debe calcularlos con sus reglas y datos de capacidad.

### Northbrook Industrial

**Resultado:** oferta condicionada a aval solidario de matriz.

- Acción: **ampliar con condiciones**.
- Banda utilizada: grupo, al existir apoyo verificable y no fallar una puerta dura.
- Condición contractual: **aval solidario de la matriz**.
- Producto sugerido: anticipo de facturas.
- Plazo orientativo: 90 días.
- Motivo: recuperación autónoma, gap comercial financiable y soporte positivo del holding.

Texto para la web:

> Northbrook presenta una salud autónoma intermedia y una recuperación sostenida desde abril. El apoyo del holding mejora su capacidad dentro del grupo, pero la oferta queda condicionada a un aval solidario de la matriz. El principal uso propuesto es financiar el desfase entre pagos y cobros.

### Velasco Distribución

**Resultado:** revisión preventiva y reducción de exposición.

- Acción: **no ampliar**.
- Banda utilizada: la peor entre Solo y Grupo.
- Plazo máximo orientativo de una línea viva: 60 días.
- Condición de seguimiento: revisión EWI y control de transferencias intragrupo.
- Motivo: deterioro de morosidad, hardcore revolving y drenaje de caja.

Texto para la web:

> Velasco conserva un score autónomo de 62, pero su trayectoria es descendente y el contexto del holding reduce la capacidad disponible. La combinación de morosidad comercial y tensión de cobertura activa una revisión interna. No se recomienda abrir ni ampliar exposición hasta revisar el circulante y el uso de la línea.

## Playbook de Northbrook

### Diagnóstico post-inflexión

- Tipo de inflexión: **suelo alcista**.
- Mes de origen: **abril de 2026**.
- Mes analizado: **agosto de 2026**.
- Antelación: **4 meses**.
- `scoreSolo` en el origen: **48**.
- `scoreSolo` actual: **62**.
- Variación total: **+14 puntos**.
- Diagnóstico: **en recuperación**.

### Cambios significativos observados

| Variable | Delta de aportación | Lectura                                | Clasificación             |
| -------- | ------------------: | -------------------------------------- | ------------------------- |
| A1       |                +4,8 | Mejora del margen de caja              | Acierto observado         |
| C4       |                +2,6 | Reducción de facturas vencidas         | Acierto observado         |
| B3       |                +1,7 | Mejora del plazo de pago a proveedores | Acierto observado         |
| A5       |                −1,6 | Mayor utilización de la línea          | Error o presión observada |

Los cambios seleccionados no descomponen necesariamente los 14 puntos completos. El resto puede proceder de variables sin plantilla, movimientos menores o cambios de confianza.

### Qué mantener

- Mantener el seguimiento del margen de caja y del calendario de cobros.
- Preservar la reducción observada de facturas vencidas.
- Mantener acuerdos de pago compatibles con la generación de caja.

### Qué evitar

- Evitar que la línea de crédito sustituya de forma permanente a la caja operativa.
- Evitar un nuevo aumento del saldo dispuesto sin un calendario de amortización.

### Acciones inmediatas

1. Revisar las facturas elegibles para anticipo y priorizar las de pagadores con mejor calidad.
2. Definir un calendario de reducción del saldo dispuesto de la línea.
3. Mantener una revisión mensual del margen de caja y de los vencidos.

### Contexto del holding

- Delta de aportación del holding: **+6 puntos** desde la inflexión.
- Observación: el apoyo neto del grupo acompaña la recuperación autónoma.
- Recomendación contextual: documentar el compromiso mediante aval solidario si la oferta depende de ese apoyo.

El holding se muestra por separado y no participa en el diagnóstico autónomo del playbook.

## Lectura bancaria de postura de riesgo

Esta lectura es interna del partner financiero y se construye con el histórico de scoring y de
decisiones. No se muestra a la empresa ni sustituye las puertas de elegibilidad.

| Empresa               | Conducta observada tras las alertas                                                             | Postura cualitativa | Control contextual                                              |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------- |
| Northbrook Industrial | Redujo exposición después del deterioro de cobros, recuperó C4 y no mantuvo una racha de B2.    | `prudente`          | Monitorización normal si las puertas siguen abiertas.           |
| Velasco Distribución  | Mantuvo la línea con C4/B2 persistentes, uso crónico de A5 y dependencia creciente del holding. | `tolerante`         | Plazo corto, sin ampliación automática y revisión condicionada. |

El mismo `scoreSolo = 62` no implica la misma postura de riesgo: el score describe la capacidad
autónoma al cierre, mientras la postura describe cómo se gestionó la exposición durante el
deterioro. La clasificación se publicaría con confianza, meses observados y los eventos que la
sustentan. Si el histórico no permite observar una reacción comparable, el resultado sería
`no_evaluable`, nunca una inferencia negativa por falta de datos.

## Playbook de Velasco

### Diagnóstico post-inflexión

- Tipo de inflexión: **pico bajista**.
- Mes de origen: **marzo de 2026**.
- Mes analizado: **agosto de 2026**.
- Antelación: **5 meses**.
- `scoreSolo` en el origen: **76**.
- `scoreSolo` actual: **62**.
- Variación total: **−14 puntos**.
- Diagnóstico: **reacción destructiva**.

### Cambios significativos observados

| Variable | Delta de aportación | Lectura                                   | Clasificación             |
| -------- | ------------------: | ----------------------------------------- | ------------------------- |
| C4       |                −4,2 | Aumento de facturas vencidas              | Error o presión observada |
| A5       |                −3,0 | Uso más intenso y persistente de la línea | Error o presión observada |
| B3       |                −2,1 | Aumento del retraso a proveedores         | Error o presión observada |
| C6       |                −1,8 | Aumento de recibos devueltos              | Error o presión observada |
| A1       |                +1,6 | Mejora puntual del margen de caja         | Acierto observado         |

La suma de impactos desfavorables supera el impacto favorable. El diagnóstico utiliza puntos de aportación, no el número de variables.

### Qué mantener

- Mantener las medidas que sostienen el margen de caja positivo.
- Conservar el seguimiento diario de entradas y salidas mientras dure la tensión.

### Qué evitar

- Evitar financiar de forma indefinida el circulante con una póliza sin amortización.
- Evitar ampliar plazos a proveedores sin acuerdos explícitos.
- Evitar transferencias al grupo que reduzcan la liquidez necesaria para la operación.

### Acciones inmediatas

1. Revisar vencidos y priorizar el cobro de las facturas con mayor impacto.
2. Negociar acuerdos formales de pago con proveedores para evitar retrasos no pactados.
3. Establecer un calendario de amortización y descansos para la línea de crédito.
4. Revisar los recibos devueltos y las condiciones de cobro de los clientes afectados.
5. Limitar salidas intragrupo mientras no se recupere el colchón operativo.

### Contexto del holding

- Delta de aportación del holding: **−12 puntos** desde la inflexión.
- Observación: las salidas netas hacia el grupo agravan el deterioro observado en la filial.
- Recomendación contextual: revisar la política de transferencias y proteger la caja necesaria para obligaciones operativas.

El contexto del holding explica una presión adicional, pero no se mezcla con los aciertos y errores autónomos.

## Orden recomendado de la pantalla

1. **Cabecera comparativa:** nombre, `scoreSolo`, `scoreGrupo`, estado y decisión.
2. **Gráfico histórico:** ambas trayectorias y previsiones, con eje fijo de 0 a 100.
3. **Composición del score:** bloques y aportaciones que explican el empate.
4. **Factores e inflexión:** driver actual, detonante inicial, canario y alertas.
5. **Holding:** ajuste, perfil, aval o pignoración de caja.
6. **Forecast:** horizontes, intervalos y estado aplicado/modo sombra.
7. **EWI y oportunidad empresarial:** señales internas, gap del ciclo de caja y mejora posible de la tesorería.
8. **Decisión:** acción, condiciones, puertas y razón legible.
9. **Playbook:** diagnóstico, evidencia, mantener, evitar y acciones inmediatas.

## Mensaje final de la comparativa

> **El score final empata; la decisión no.** Northbrook y Velasco cierran agosto con 62 puntos de salud autónoma, pero Northbrook viene de una recuperación sostenida y cuenta con apoyo positivo del holding. Velasco se deteriora, utiliza la línea de forma estructural y pierde caja hacia el grupo. La fotografía mensual es la misma; la trayectoria, el contexto y la actuación recomendada son diferentes.
