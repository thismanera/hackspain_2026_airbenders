# 06 — Sin datos suficientes no significa una empresa mala

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

La cantidad de dinero que mueve una empresa no garantiza que exista evidencia
suficiente para evaluarla. La confianza mide cobertura y calidad del historial,
no tamaño ni solvencia.

**Ejemplo localizado** (corte 2026-08):

| Campo            |                     Valor |
| ---------------- | ------------------------: |
| Empresa          |  `COMP_0158` (GROUP_0001) |
| `scoreSolo`      |                      60,1 |
| Confianza        |                      0,26 |
| Estado           |               `sin_datos` |
| A / B / C        |              68 / 50 / 58 |
| Cobros medios 3m |               1.755.075 € |
| Decisión         |                    Cerrar |
| Puerta           | Historia: confianza < 0,4 |

## Explicación del caso

`COMP_0158` registra cobros medios de 1.755.075 € en los últimos tres meses y
un `scoreSolo` de 60,1. Por volumen y nota podría parecer una empresa lista para
ser evaluada, pero su confianza es solo 0,26. El motor dispone de datos para
calcular una primera aproximación —68 en A, 50 en B y 58 en C—, aunque todavía
no tiene historia suficiente para tratar ese resultado como una opinión
comparable con la de una empresa plenamente observada.

Por este motivo, el estado no es **Riesgo**, sino `sin_datos`. La distinción es
importante: el sistema no afirma que la empresa sea mala ni convierte la
ausencia de información en una penalización económica. Indica que la evidencia
todavía no supera el mínimo de confianza de 0,4 que exige la política.

La puerta de historia bloquea la financiación y la decisión es **Cerrar**. El
score permanece visible porque resume lo que sí se ha podido medir, pero no se
usa para simular una certeza inexistente. De esta manera, el analista puede
explicar por qué no hay oferta sin atribuir a la empresa un deterioro que los
datos no demuestran.

La actuación adecuada es acumular nuevos meses observados, mejorar la cobertura
de movimientos y volver a ejecutar la evaluación. Cuando la confianza supere el
umbral, la empresa podrá compararse con el resto de la cartera y se aplicarán
las demás puertas con normalidad. Hasta entonces, cualquier forecast debe
interpretarse con especial cautela porque parte de una serie demasiado corta.

Este caso evita dos errores opuestos: financiar a ciegas por el mero hecho de
ver volumen alto y rechazar a la empresa como si existiera evidencia de riesgo.
`sin_datos` es una suspensión del juicio, no una sentencia negativa.

**Pantallas:** filtro `sin_datos` en `/cartera?mes=2026-08` y ficha
`/cartera/COMP_0158?mes=2026-08`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                                        | Archivo sugerido                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Después del primer párrafo  | Cabecera con score 60,1, confianza 0,26, cobros medios y bloques A/B/C.                                                 | `../use_cases_implementados/images/06-score-con-poca-evidencia.png` |
| Después del segundo párrafo | Estado `sin_datos` y detalle de cobertura o meses observados; debe quedar claro que no aparece como **Riesgo**.         | `../use_cases_implementados/images/06-estado-sin-datos.png`         |
| Después del tercer párrafo  | Puerta de historia fallida con umbral 0,4, acción **Cerrar** y motivo explícito. Esta es la captura principal.          | `../use_cases_implementados/images/06-puerta-historia.png`          |
| Después del quinto párrafo  | Vista de cartera filtrada por `sin_datos`, para contextualizar que es una categoría operativa aplicable a más empresas. | `../use_cases_implementados/images/06-filtro-sin-datos.png`         |

**Qué no decir.** Que 60 sea comparable a una empresa con confianza alta. Que
la falta de datos implique riesgo económico. Que el forecast sea fiable sin
historia suficiente.
