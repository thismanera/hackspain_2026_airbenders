# 06 — Sin datos suficientes no significa una empresa mala

> Factible. No grabado: la demo no recorre el filtro `sin_datos`.

**Problema.** Volumen alto y una nota intermedia parecen evaluables. Con poca
historia, esa nota no es comparable a la de una empresa con cobertura. El
banco o bien financia a ciegas, o bien trata la falta de datos como riesgo
económico.

**Cómo lo resolvería Embat Flow.** La confianza mide evidencia disponible, no
tamaño. El motor calcula el score que puede calcular, marca estado
`sin_datos` y cierra por la puerta de historia si la confianza queda por
debajo del umbral. No penaliza a la empresa por no conocerla: evita presentar
una opinión incompleta como oferta. Lo que debe pasar es acumular meses
observados y volver a evaluar.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

| Campo            |                     Valor |
| ---------------- | ------------------------: |
| Empresa          | `COMP_0158` (GROUP_0001)  |
| `scoreSolo`      |                      60,1 |
| Confianza        |                      0,26 |
| Estado           |               `sin_datos` |
| A / B / C        |              68 / 50 / 58 |
| Cobros medios 3m |               1.755.075 € |
| Decisión         |                    Cerrar |
| Puerta           | Historia: confianza < 0,4 |

**Qué no decir.** Que 60 sea comparable a una empresa con confianza alta. Que
la falta de datos implique riesgo económico. Que el forecast sea fiable sin
historia suficiente.
