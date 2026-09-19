# 12 — Techo de grupo

> «La política le daría 1,22 millones. El techo del grupo deja el vigente en 881 mil.»

**Empresa:** `COMP_0094` (GROUP_0021)
**Pantallas:** ficha (L vs vigente) + ficha de grupo.
**Corte:** 2026-08.

## Qué demuestra

El límite no es solo de la empresa. `L` y `LVigente` pueden diferir. El techo
se calcula con tamaños del grupo, no con `scoreGrupo` consolidado.

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` / `scoreGrupo` | 75,1 / 75,1 |
| Confianza | 0,65 |
| A / B / C | 74 / 74 / 78 |
| Estado | Sana / sana |
| Decisión | **abrir**, elegible |
| L recomendado | **1.220.000 €** |
| L vigente | **881.000 €** |
| Motivo de grupo | Techo de grupo: 881.000 € |
| Banda / plazo | A / 180 días |
| Menú (sobre vigente) | 146 k€ a 30 días (6,0 %) |
| Forecast 3m / 6m | 77,1 / 74,5 |

Otras del mismo grupo (0871, 0925) fallan puertas y el techo aparece igual en
su ficha: el techo es del grupo, no un castigo individual.

## Cómo contarlo

1. Empresa sana, abre, banda A.
2. «Recomendado 1,22 M. Vigente 881 k. El menú usa el vigente.»
3. Vista de grupo: hay más filiales compitiendo por el mismo techo.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha (L vs vigente) | `captures/12-ficha-comp-0094.png` |
| Grupo 0021 | `captures/12-grupo-0021.png` |

## Qué no decir

Que le hayamos recortado por riesgo propio. Que 881 k€ estén dispuestos.

## Relacionado

[10 aval](./10-aval-condicionado.md) · [11 cross-default](./11-cross-default.md) · [05 ampliar](./05-ampliar-linea-en-mejora.md)
