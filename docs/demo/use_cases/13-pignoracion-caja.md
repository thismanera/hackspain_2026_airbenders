# 13 — Pignoración de caja

> «Autónoma 90, holding −30 (el tope). Sigue habiendo oferta, con plazo máximo 90 días y alerta de pignoración.»

**Empresa:** `COMP_1022` (GROUP_0126)
**Pantallas:** ficha (scoreSolo vs scoreGrupo) + señal `alertaPignoracionCaja`.
**Corte:** 2026-08.

## Qué demuestra

Drenaje extremo. La empresa es `sana` en autónomo y `vigilar` con grupo.
Pignoración recorta plazo a 90 días; no prohíbe toda apertura. Distinto del
cross-default ([11](./11-cross-default.md)), que sí cierra.

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` / `scoreGrupo` | **90,2 / 60,2 (−30)** |
| Perfil | `drenaje_tesoreria` |
| D4 | −0,44 |
| Estado | Sana / vigilar |
| A / B / C | 98 / 97 / 68 |
| Alertas | `contagio_grupo` |
| `alertaPignoracionCaja` | **sí** (ajuste ≤ −15) |
| Decisión | **mantener**, elegible |
| L / vigente | 154 k€ / 99 k€ |
| Banda efectiva / plazo | B / **90 días** (tope de pignoración) |
| TAE menú | 7,0–8,0 % |
| Forecast 3m solo / grupo | 90,2 / 61,7 |

Banda B (no A) porque el grupo es peor que Solo y se conserva la peor.

## Cómo contarlo

1. «90 sola. 60 con grupo. El motor no deja restar más de 30.»
2. Sigue habiendo menú, plazo 90.
3. «No es un cierre. Es: esta caja está comprometida con el holding.»

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha Solo vs Grupo | `captures/13-ficha-comp-1022.png` |
| Señal pignoración | `captures/13-pignoracion.png` |

## Qué no decir

Que esté quebrada. Que −30 identifique un contrato de pignoración real: es una
señal de producto a partir del ajuste.

## Relacionado

[02 grupo](./02-grupo-absorbe-vs-drena.md) · [10 aval](./10-aval-condicionado.md) · [16 EWI](./16-ewi-recorta-plazo.md)
