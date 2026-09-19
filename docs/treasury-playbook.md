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
| `scoreRecuperableGrupoEstimado`                      | Escenario autónomo más el drenaje negativo actual del holding, limitado a 100.        |
| `playbook`                                           | Acciones para mantener, evitar y ejecutar de inmediato.                               |
| `contextoHolding`                                    | Cambio y observación del holding, separado del diagnóstico autónomo.                  |

`scoreRecuperableEstimado` suma al score actual el valor absoluto de los errores significativos
seleccionados y queda limitado a 100. `scoreRecuperableGrupoEstimado` añade únicamente
`max(0, -aportacionGrupo)` del mes actual. Ambos son escenarios contables de restitución de
aportaciones al nivel de origen: no son forecasts, probabilidades de impago, financiación
garantizada ni entradas del motor de decisión.

## Evidencia comparable

El diccionario cubre A1, A2, A3, A4, A5, B1, B2, B3, C1, C2, C3, C4, C5 y C6. Cada hallazgo exige:

- valor bruto, subnota y aportación observados en todos los meses del período;
- aplicabilidad activa durante todo el período;
- peso efectivo constante;
- cambio de aportación material según `max(0,30; 1,5 × pesoEfectivo / 0,10)`, o una variación
  absoluta de subnota de al menos 25 puntos, antes de redondear.

Los hallazgos se ordenan por impacto absoluto. Los empates usan el orden canónico de las
variables. Las categorías son:

| Tipo                | Interpretación                                    |
| ------------------- | ------------------------------------------------- |
| `acierto_mitigante` | La aportación autónoma mejora de forma material.  |
| `error_agravante`   | La aportación autónoma empeora de forma material. |

Cada hallazgo publica un `canal`: `operativo`, `financiero`, `comercial` o `holding`. El holding
solo aparece en `contextoHolding`, y nunca altera el saldo de aciertos y errores autónomos.

Cada decisión incluye `productoSugerido`. Factoring se reserva para C3/C4, confirming para B3,
reestructuración para A3/A4/A5, gestión de cobros para C6 y cortafuegos para el holding. A1,
A2, B1, B2, C1, C2 y C5 usan `ninguno`: el playbook propone una revisión empresarial sin
atribuir automáticamente un producto.

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

## Playbook bancario: postura de riesgo observada

El playbook de la empresa y la lectura para el banco son productos distintos. El primero ayuda a
la empresa a aprender de sus aciertos y errores. El segundo es un bloque interno del partner
financiero que resume cómo ha reaccionado la empresa cuando aparecieron señales de tensión. No se
publica en la ficha de la empresa ni se mezcla con `contextoHolding`.

La postura no describe una intención ni una personalidad. Es una clasificación de conducta
observada y necesita dos fuentes:

- `ScoreRow[]` para conocer las señales, su persistencia, confianza y recuperación;
- `DecisionRow[]` para saber si la empresa abrió, mantuvo, amplió o redujo exposición mientras
  esas señales estaban activas.

El contrato previsto para el canal bancario es:

```ts
type PosturaRiesgoBanco = {
  nivelAversion: "prudente" | "equilibrada" | "tolerante" | "no_evaluable";
  confianza: number;
  mesesObservados: number;
  evidencia: Array<{
    id: string;
    descripcion: string;
    mesesPersistencia: number;
    impacto: number;
  }>;
  conductaExposicion: string;
  controlSugerido: "normal" | "monitorizar" | "condicionada" | "restringir";
};
```

La etiqueta solo se calcula con al menos seis meses observados, una confianza mediana de al menos
0,5 y un episodio de tensión identificable (`alertaTempranaDeterioro`, deterioro, déficit,
impago, vencido o una acción de reducción/cierre). Si no se cumplen esas condiciones, el resultado
es `no_evaluable` y no se usa la falta de datos como señal de tolerancia al riesgo.

| Nivel          | Evidencia observada                                                                                                                                         | Control contextual para el banco                                       |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `prudente`     | Reduce o mantiene la exposición cuando aparecen alertas, regulariza obligaciones y mejora caja o cobros en un máximo de dos meses, sin repetir el episodio. | `normal`, si las puertas duras siguen abiertas.                        |
| `equilibrada`  | Responde a parte de las señales, pero deja alguna presión abierta o necesita más de dos meses para corregirla.                                              | `monitorizar`, con revisión mensual.                                   |
| `tolerante`    | Mantiene o amplía exposición con alertas activas, repite B2/C4/C6/A5 o solo recupera la nota mediante apoyo del holding.                                    | `condicionada` o `restringir`, según las puertas y la exposición viva. |
| `no_evaluable` | Historia corta, confianza insuficiente o ausencia de un episodio de tensión comparable.                                                                     | Sin ajuste conductual; se aplican las reglas ordinarias.               |

La postura es informativa y nunca supera impagos, morosidad grave, déficit persistente,
cross-default, falta de datos ni el resto de puertas de decisión. `scoreSolo` mide capacidad
autónoma y `scoreGrupo` describe el contexto del holding; ninguno sustituye la evidencia de
conducta de `DecisionRow`.

Ejemplo con el empate de la demo: Northbrook y Velasco terminan con `scoreSolo = 62`, pero
Northbrook reduce exposición y recupera C4 tras su alerta, por lo que su postura observada es
`prudente`. Velasco mantiene la línea con C4/B2 persistentes y uso crónico de A5, por lo que su
postura es `tolerante`. La diferencia explica un control bancario distinto sin cambiar el score
autónomo ni afirmar causalidad económica.

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
