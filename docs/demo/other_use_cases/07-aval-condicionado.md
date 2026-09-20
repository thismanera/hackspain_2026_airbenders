# 07 — Apoyo del holding con aval condicionado

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

El apoyo del holding puede mejorar la viabilidad de una operación sin ocultar
la debilidad autónoma de la filial. Cuando la oferta depende de ese apoyo, la
condición debe aparecer de forma explícita y verificable.

**Ejemplo localizado** (corte 2026-08):

| Campo                      |                    Valor |
| -------------------------- | -----------------------: |
| Empresa                    | `COMP_0550` (GROUP_0246) |
| `scoreSolo` / `scoreGrupo` |              58,3 / 75,8 |
| Ajuste holding             |                    +17,5 |
| Confianza                  |                     0,88 |
| A / B / C                  |             51 / 66 / 62 |
| `requiereAvalMatriz`       |                       Sí |
| Decisión                   |        Reducir, elegible |
| Plazo                      |                  60 días |

## Explicación del caso

`COMP_0550` obtiene 58,3 puntos por sí sola. Sus bloques —51 en caja, 66 en
fiabilidad y 62 en circulante— describen una empresa ajustada, pero no una
empresa que deba sustituirse por la media de sus hermanas. El `scoreSolo`
permanece visible porque representa la capacidad que la filial genera con sus
propios datos.

El contexto cambia al incorporar el holding. El ajuste suma 17,5 puntos y lleva
el `scoreGrupo` hasta 75,8. Esa diferencia indica que el resto del grupo aporta
capacidad suficiente para respaldar la exposición. No obstante, el sistema no
reescribe el 58,3 como si fuera rendimiento autónomo: muestra ambos valores y
atribuye expresamente la mejora al bloque de grupo.

La empresa es elegible, pero la decisión es **Reducir** y el plazo máximo queda
en 60 días. Además, aparece `requiereAvalMatriz = Sí`. La condición de aval hace
visible que la operación propuesta depende del apoyo corporativo y evita que el
analista interprete el 75,8 como una capacidad sin restricciones. Límite y plazo
siguen considerando la situación propia de la filial.

Esta solución solo es válida si las puertas duras permanecen abiertas. Un
impago, morosidad grave, déficit persistente, cross-default o una falta de datos
no se resolverían sumando puntos del grupo. El holding puede condicionar una
oferta permitida por la política; no puede borrar evidencias que la política
considera incompatibles con la financiación.

Finalmente, `requiereAvalMatriz` expresa una condición que el producto debería
exigir antes de formalizar la operación. No demuestra que ya exista un aval
notarial ni que la matriz lo haya firmado. La interfaz separa así tres hechos:
capacidad autónoma, apoyo económico observado y requisito contractual pendiente.

**Pantallas:** `/cartera/COMP_0550?mes=2026-08` y grupo
`/grupos?mes=2026-08` buscando `GROUP_0246`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                                     | Archivo sugerido                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Después del primer párrafo  | Cascada autónoma con `scoreSolo` 58,3 y bloques A/B/C.                                                               | `../use_cases_implementados/images/07-capacidad-autonoma.png`  |
| Después del segundo párrafo | Bloque de holding con ajuste +17,5 y `scoreGrupo` 75,8, manteniendo visibles ambos scores.                           | `../use_cases_implementados/images/07-apoyo-holding.png`       |
| Después del tercer párrafo  | Decisión **Reducir**, elegibilidad, plazo de 60 días y condición `requiereAvalMatriz`. Esta es la captura principal. | `../use_cases_implementados/images/07-oferta-condicionada.png` |
| Después del cuarto párrafo  | Panel de puertas abiertas para demostrar que el aval condiciona una operación elegible y no anula una puerta dura.   | `../use_cases_implementados/images/07-puertas.png`             |

**Qué no decir.** Que haya un aval notarial confirmado. Que el holding pueda
superar cualquier puerta dura. Que `scoreGrupo` sustituya al análisis autónomo.
