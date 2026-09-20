# 05 — El forecast informa, pero todavía no decide

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

El forecast puede anticipar una recuperación sin modificar la política del mes
actual. Mostrar ambas lecturas permite mirar hacia delante sin financiar una
mejora que todavía no se ha producido.

**Ejemplo localizado** (corte 2026-08):

| Campo                 |                    Valor |
| --------------------- | -----------------------: |
| Empresa               | `COMP_0558` (GROUP_0026) |
| `scoreSolo`           |                     66,8 |
| Confianza             |                     0,92 |
| A / B / C             |             46 / 85 / 82 |
| Dirección             |       Mejora estructural |
| Decisión              |                   Cerrar |
| Motivo                |      Pilar A = 46,1 < 50 |
| Forecast Solo 3m / 6m |              88,8 / 90,3 |
| Estado del forecast   |              Modo sombra |

## Explicación del caso

`COMP_0558` obtiene 66,8 puntos en agosto y presenta una mejora estructural. Los
bloques B y C son fuertes —85 y 82—, pero el bloque A se queda en 46,1. La nota
total parece razonable porque la fiabilidad y el circulante compensan parte de
la debilidad de caja; para la decisión de crédito, sin embargo, A debe superar
su propio mínimo de 50.

La puerta de caja falla y la decisión actual es **Cerrar**. Este resultado usa
solo la evidencia disponible en el corte de agosto: la empresa todavía no ha
demostrado capacidad suficiente en el pilar que debe atender el servicio de la
deuda. El sistema muestra el motivo de forma explícita, en lugar de esconderlo
dentro de la nota agregada.

Al mismo tiempo, el forecast anticipa una mejora muy relevante: 88,8 puntos a
tres meses y 90,3 a seis. Esta previsión es útil para priorizar el seguimiento,
preparar documentación o detectar una posible reapertura futura. No obstante,
aparece etiquetada como **modo sombra** (`desconectado`), lo que significa que
no cambia el límite, el plazo ni la TAE de agosto.

La interfaz mantiene deliberadamente juntas las dos verdades. La primera es
operativa: hoy la caja no pasa la puerta y no existe oferta. La segunda es
prospectiva: si la evolución estimada acaba materializándose, la empresa podría
llegar a una banda mucho mejor. En el siguiente corte se volverán a medir las
variables reales; no se concede hoy contra una cifra prevista.

Esta separación hace auditable el uso del forecast. El usuario puede saber qué
parte de la pantalla describe hechos observados, qué parte es una estimación y
cuál de ellas participa realmente en la decisión. También evita interpretar
88,8 como una probabilidad de pago o como una garantía de recuperación.

**Pantallas:** `/empresa?empresa=COMP_0558&mes=2026-08` y
`/cartera/COMP_0558?mes=2026-08`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                                          | Archivo sugerido                                                  |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Después del primer párrafo  | Cascada A/B/C con score 66,8 y bloque A = 46,1 resaltado.                                                                 | `../use_cases_implementados/images/05-score-y-caja.png`           |
| Después del segundo párrafo | Puertas de decisión con **Caja** fallida, acción **Cerrar**, límite cero o menú vacío.                                    | `../use_cases_implementados/images/05-decision-actual.png`        |
| Después del tercer párrafo  | Panel completo de forecast con 88,8 a 3m, 90,3 a 6m, intervalos y etiqueta **modo sombra**. Esta es la captura principal. | `../use_cases_implementados/images/05-forecast-sombra.png`        |
| Después del cuarto párrafo  | Si la interfaz lo permite, una imagen conjunta de decisión actual y previsión para que se vea que son capas distintas.    | `../use_cases_implementados/images/05-hoy-frente-a-prevision.png` |

**Qué no decir.** Que 88,8 sea probabilidad de impago o una garantía. Que el
forecast conectado forme parte de esta decisión.
