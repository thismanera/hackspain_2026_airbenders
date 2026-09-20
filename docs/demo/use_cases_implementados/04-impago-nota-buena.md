# 04 — Una nota buena no tapa un impago

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

Una nota favorable y una trayectoria de mejora no pueden neutralizar un impago
observado. La puerta de obligaciones protege la política de crédito frente a
promedios que podrían diluir una señal crítica.

**Ejemplo localizado** (corte 2026-08):

| Campo                      |                    Valor |
| -------------------------- | -----------------------: |
| Empresa                    | `COMP_0540` (GROUP_0048) |
| `scoreSolo` / `scoreGrupo` |              66,3 / 59,4 |
| Confianza                  |                     0,77 |
| A / B / C                  |             69 / 59 / 69 |
| Dirección                  |          Mejora temporal |
| Alerta                     |    `impago_obligaciones` |
| Decisión                   |       Cerrar, menú vacío |
| Forecast Solo 3m / 6m      |              73,8 / 76,8 |

## Explicación del caso

`COMP_0540` llega a agosto con un `scoreSolo` de 66,3 y bloques bastante
equilibrados: 69 en caja, 59 en fiabilidad y 69 en circulante. Además, su
dirección es de mejora temporal y el forecast proyecta 73,8 puntos a tres meses
y 76,8 a seis. Una lectura basada únicamente en el nivel y la pendiente del
score podría llevar a recomendar la apertura de una línea.

La alerta `impago_obligaciones` cambia la decisión. No se trata de restar unos
puntos adicionales al promedio, sino de comprobar una condición independiente:
mientras exista un incumplimiento observado, la puerta de fiabilidad permanece
cerrada. Por eso la decisión es **Cerrar** y el menú de financiación queda
vacío, aunque el score esté por encima de 60 y la tendencia sea favorable.

El `scoreGrupo` de 59,4 tampoco debe utilizarse como explicación principal del
cierre. El ajuste del holding aporta contexto sobre la exposición, pero la
causa decisiva ya aparece en la evidencia autónoma: hay un impago activo. Del
mismo modo, el forecast sigue en modo sombra. Su mejora prevista sirve para
preparar el seguimiento, no para dar por resuelta una obligación vencida.

La lectura completa es, por tanto, coherente: la empresa muestra señales de
recuperación, pero todavía no cumple una condición básica para recibir crédito.
El sistema puede reconocer ambas cosas a la vez. La financiación podrá volver a
evaluarse cuando se regularice la obligación y la puerta deje de fallar; hasta
entonces, la mejora esperada no sustituye el pago observado.

**Pantalla:** `/cartera/COMP_0540?mes=2026-08`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                                                          | Archivo sugerido                                           |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Después del primer párrafo  | Cabecera de la ficha con score 66,3, bloques A/B/C y dirección de mejora temporal.                                                        | `../use_cases_implementados/images/04-score-y-mejora.png`  |
| Después del segundo párrafo | Sección de alertas y puertas con `impago_obligaciones`, fiabilidad fallida, acción **Cerrar** y menú vacío. Esta es la captura principal. | `../use_cases_implementados/images/04-puerta-impago.png`   |
| Después del tercer párrafo  | Forecast 3m/6m con 73,8 / 76,8 y etiqueta de modo sombra, junto al contexto del holding si cabe en la misma imagen.                       | `../use_cases_implementados/images/04-forecast-sombra.png` |

**Qué no decir.** Que el forecast garantice la recuperación. Que el ajuste de
holding sea la causa del cierre. Que el playbook contradiga la decisión: miden
cosas distintas.
