# 09 — Datos insuficientes

> «60 puntos y 1,7 millones de cobros medios. Confianza 0,26. No evaluable.»

**Empresa:** `COMP_0158` (GROUP_0001)
**Pantallas:** ficha con estado `sin_datos`.
**Corte:** 2026-08.

## Qué demuestra

La confianza es evidencia disponible, no probabilidad de acierto. Tamaño no
sustituye historia. Puerta `historia` (umbral 0,4).

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` | 60,1 |
| Confianza | **0,26** |
| Estado | `sin_datos` / `sin_datos` |
| A / B / C | 68 / 50 / 58 |
| Cobros medios 3m | 1.755.075 € |
| Alertas | `datos_insuficientes` |
| Decisión | **cerrar** |
| Puertas | `historia`, `fiabilidad` |
| Motivo | Historial insuficiente: confianza 0,26 < 0,4 |
| Forecast 3m | 57,5 (también en sombra, poco informativo) |

Hay un suelo marcado en 2026-01 (50). No se enseña como recuperación
defendible: la confianza no da para eso.

## Cómo contarlo

1. «Un 60. Cobros de millón y medio.»
2. Badge `sin_datos`. Confianza 26 %.
3. «Sin datos suficientes es una respuesta válida. Nunca un número seguro sobre tres meses flojos.»

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha / confianza | `captures/09-ficha-comp-0158.png` |
| Cartera filtro sin_datos | `captures/09-cartera-sin-datos.png` |

## Qué no decir

Que el 60 sea comparable al 59 de [03](./03-misma-nota-sin-oferta.md). Uno no
se evalúa; el otro sí.

## Relacionado

[17 sana](./17-cartera-sana-estable.md) · [03 sin oferta](./03-misma-nota-sin-oferta.md)
