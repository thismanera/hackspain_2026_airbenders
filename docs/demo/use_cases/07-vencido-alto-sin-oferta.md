# 07 — Vencido alto: 74 puntos y no hay oferta

> «Banda B, confianza 0,85, forecast estable a 77. El 42 % de la facturación está vencida. Puerta clientes.»

**Empresa:** `COMP_0255` (GROUP_0025)
**Pantallas:** ficha, bloque C, alerta `vencido_alto`.
**Corte:** 2026-08.

## Qué demuestra

Una sola puerta. El resto de la ficha parece financiable. C4 0,42 > 0,40 cierra.

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` / `scoreGrupo` | 74,5 / 74,5 |
| Confianza | 0,85 |
| A / B / C | 85 / 87 / **40** |
| Estado | Riesgo / riesgo |
| C4 | 0,42 |
| Alertas | `vencido_alto`, `alerta_temprana_deterioro` |
| Inflexión | Suelo 2026-01 (49,7) |
| Decisión | **cerrar** |
| Puertas | `['clientes']` |
| Motivo | Vencido alto (alerta) |
| Forecast 3m / 6m | 77,0 / 77,6 |

## Cómo contarlo

1. Cascada: A y B altos, C 40.
2. «No es un 74 opaco: son facturas vencidas.»
3. Sin menú. Producto sugerido en playbook, si se abre RCA: factoring, no línea.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha / bloque C | `captures/07-ficha-comp-0255.png` |
| Alerta vencido | `captures/07-alerta-vencido.png` |

## Qué no decir

Que «está en riesgo porque el score es bajo». El score es 74; el estado
`riesgo` sale de la alerta de vencidos.

## Relacionado

[03 sin oferta](./03-misma-nota-sin-oferta.md) · [06 impago](./06-impago-con-nota-buena.md) · [11 cross-default](./11-cross-default.md)
