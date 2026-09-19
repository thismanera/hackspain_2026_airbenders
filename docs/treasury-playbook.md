# RCA post-inflexión y playbook de tesorería

Este módulo explica qué cambios observados acompañaron a una inflexión autónoma y convierte esa
evidencia en acciones de seguimiento para la empresa. No atribuye intenciones a la dirección,
no afirma causalidad económica y no modifica el score ni la decisión crediticia.

## Entrada y salida

La función pública es:

```ts
analizarReaccionPostInflexion(companyRows: ScoreRow[], targetMonth?: string)
```

Ordena una copia de las filas. Si no se indica `targetMonth`, usa el último mes disponible. Si se
solicita un mes inexistente devuelve `null`, sin sustituirlo por otro. También devuelve `null`
cuando no hay inflexión autónoma confirmada, no existe la fila de origen o no hay dos meses
posteriores consecutivos.

Rechaza entradas con varias empresas, meses duplicados, versiones de scoring incompatibles,
meses inválidos o incoherencia entre las fechas y los números. El destino es un corte estricto:
las filas posteriores no participan en el análisis.

El resultado contiene:

| Campo                                                | Significado                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `mesInflexion`, `mesActual`, `mesesTranscurridos`    | Origen y destino observados; la antelación se recalcula desde las fechas.             |
| `scoreEnInflexion`, `scoreActual`, `deltaScoreTotal` | Evolución autónoma basada exclusivamente en `scoreSolo`.                              |
| `tipoInflexion`                                      | `pico_bajista` o `suelo_alcista`.                                                     |
| `detonanteOriginal`                                  | Variable y canal que iniciaron el giro según scoring; describe observación.           |
| `aciertos`, `errores`                                | Hallazgos materiales con plantilla y evidencia comparable.                            |
| `diagnosticoRespuesta`                               | `reaccion_resiliente`, `reaccion_destructiva`, `reaccion_pasiva` o `en_recuperacion`. |
| `scoreRecuperableEstimado`                           | Escenario contable de recuperación de pérdidas autónomas seleccionadas.               |
| `playbook`                                           | Acciones para mantener, evitar y ejecutar de inmediato.                               |
| `contextoHolding`                                    | Cambio y observación del holding, separado del diagnóstico autónomo.                  |

`scoreRecuperableEstimado` suma al score actual el valor absoluto de los errores significativos
seleccionados y queda limitado a 100. Es una simulación de restitución de aportaciones al origen:
no es un forecast, una probabilidad de impago, una financiación garantizada ni una entrada del
motor de decisión.

## Evidencia comparable

El diccionario cubre A1, A2, A3, A4, A5, B1, B2, B3, C3, C4 y C6. Cada hallazgo exige:

- valor bruto, subnota y aportación observados en todos los meses del período;
- aplicabilidad activa durante todo el período;
- peso efectivo constante;
- cambio de aportación de al menos `+1,5` o como máximo `−1,5` puntos, antes de redondear.

Los hallazgos se ordenan por impacto absoluto. Los empates usan el orden canónico de las
variables. Las categorías son:

| Tipo                | Interpretación                                    |
| ------------------- | ------------------------------------------------- |
| `acierto_mitigante` | La aportación autónoma mejora de forma material.  |
| `error_agravante`   | La aportación autónoma empeora de forma material. |

Cada hallazgo publica un `canal`: `operativo`, `financiero`, `comercial` o `holding`. El holding
solo aparece en `contextoHolding`, y nunca altera el saldo de aciertos y errores autónomos.

## Diagnóstico

Para un `pico_bajista`, el diagnóstico compara puntos de aportación, no el número de variables:

- saldo positivo de aciertos y errores: `reaccion_resiliente`;
- saldo negativo: `reaccion_destructiva`;
- empate o ausencia de cambios materiales: `reaccion_pasiva`.

Un `suelo_alcista` confirmado se presenta como `en_recuperacion`, aunque todavía existan errores
observados. Esta prioridad evita confundir el estado actual con el sentido del giro.

Las listas no descomponen todo `deltaScoreTotal`: quedan fuera variables sin plantilla, cambios
por debajo del umbral y efectos de confianza o aplicabilidad que el motor no puede atribuir a un
hallazgo operativo.

## Playbook para la empresa

Las recomendaciones se formulan como opciones de revisión. Un producto puede ser un instrumento
para ejecutarlas, pero la oportunidad pertenece a la empresa:

| Evidencia            | Oportunidad empresarial                                                       | Instrumentos posibles                                               |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| C3/C4 desfavorables  | Reducir el desfase de cobro y recuperar facturas vencidas.                    | Revisión de condiciones comerciales, anticipo selectivo, factoring. |
| B3 desfavorable      | Recuperar previsibilidad en pagos a proveedores.                              | Acuerdos de pago, confirming, renegociación de vencimientos.        |
| A3/A4 desfavorables  | Liberar capacidad financiera y evitar que la deuda consuma la caja operativa. | Revisión de cuotas, carencia o reestructuración sujeta a análisis.  |
| B1/B2 desfavorables  | Regularizar obligaciones críticas y proteger la continuidad operativa.        | Calendario verificable de pago y reserva para nóminas y tributos.   |
| A1/A2 desfavorables  | Recuperar margen y cortar la racha de déficit.                                | Revisión de gastos, previsión semanal y priorización de cobros.     |
| A5 desfavorable      | Reducir dependencia estructural de la línea.                                  | Calendario de amortización y límites de uso.                        |
| Holding desfavorable | Proteger un saldo operativo mínimo en la filial.                              | Cortafuegos de tesorería y revisión de barridos intragrupo.         |

`accionesInmediatas` incluye los errores por impacto y el mayor acierto, elimina duplicados y
mantiene el lenguaje observacional. El equipo financiero puede convertir esas acciones en tareas,
pero el módulo no afirma que ya se hayan ejecutado.

## Ejemplo de lectura

```text
scoreSolo en el origen: 48
scoreSolo actual:       62
delta autónomo:         +14
diagnóstico:            en_recuperacion
acierto:                A1 +4,8 puntos — mejora observada del margen de caja
error:                  A5 −1,6 puntos — mayor dependencia observada de la línea
score recuperable:      63,6 (escenario contable, no forecast)
holding:                +6 puntos — contexto separado
```

La lectura correcta es: la empresa se recupera, existe una presión financiera concreta que
conviene revisar y el holding aporta contexto adicional. El módulo no concluye qué decisión de
gestión produjo los cambios ni concede financiación por sí mismo.

## Garantías del contrato

Los contratos Zod validan meses, scores entre 0 y 100, números finitos, signos de los deltas,
distancia temporal, tipos de inflexión, coherencia de las listas y consistencia del holding. La
función no muta las filas de entrada y produce el mismo resultado para la misma entrada.
