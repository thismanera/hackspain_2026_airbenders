# 07 — Apoyo del holding con aval condicionado

> Factible. No grabado: el vídeo enseña absorción y drenaje en 02, no la
> condición de aval.

**Problema.** Una filial débil vive del grupo. El banco o bien niega porque el
autónomo no da, o bien asume que «el holding lo arregla» sin condición
visible. En ambos casos se mezcla capacidad propia con apoyo ajeno.

**Cómo lo resolvería Embat Flow.** `scoreSolo` sigue siendo la capacidad
autónoma. `scoreGrupo` publica el contexto. Si la política lo permite y no hay
puerta dura (impago, morosidad grave, déficit persistente, cross-default, falta
de datos), la oferta puede existir con `requiereAvalMatriz` a la vista. La
condición es de producto: no prueba un aval jurídico firmado. El factor
autónomo y la capacidad propia siguen formando parte del límite.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

| Campo                      |             Valor |
| -------------------------- | ----------------: |
| Empresa                    | `COMP_0550` (GROUP_0246) |
| `scoreSolo` / `scoreGrupo` |       58,3 / 75,8 |
| Ajuste holding             |             +17,5 |
| Confianza                  |              0,88 |
| A / B / C                  |      51 / 66 / 62 |
| `requiereAvalMatriz`       |                Sí |
| Decisión                   | Reducir, elegible |
| Plazo                      |           60 días |

**Qué no decir.** Que haya un aval notarial confirmado. Que el holding pueda
superar cualquier puerta dura. Que `scoreGrupo` sustituya al análisis autónomo.
