# 08 — Una empresa sana puede estar drenando caja al grupo

> Factible. No grabado: 02 ya enseña drenaje; este caso añade cortafuegos y
> plazo.

**Problema.** Una empresa con nota alta parece excelente si se mira sola. Si
está cediendo caja al holding, el banco financia un drenaje sin saberlo. Sin
separar salud autónoma y exposición intragrupo no hay precio ni plazo
defendibles.

**Cómo lo resolvería Embat Flow.** Publica las dos lecturas en la misma ficha:
`scoreSolo`, `scoreGrupo`, `ajusteHolding` y el perfil `drenaje_tesoreria`.
Ese perfil describe flujos observados, no una intención. La alerta
`alertaPignoracionCaja` limita ampliación y plazo (cortafuegos); no equivale
por sí sola a un cierre ni a un contrato de pignoración firmado.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

| Campo                      |               Valor |
| -------------------------- | ------------------: |
| Empresa                    | `COMP_1022` (GROUP_0126) |
| `scoreSolo` / `scoreGrupo` |         90,2 / 60,2 |
| Ajuste holding             |                 −30 |
| Perfil                     | `drenaje_tesoreria` |
| A / B / C                  |        98 / 97 / 68 |
| Estado Solo / Grupo        |      Sana / Vigilar |
| `alertaPignoracionCaja`    |                  Sí |
| Plazo máximo               |             90 días |

**Qué no decir.** Que la empresa esté quebrada. Que exista un contrato de
pignoración firmado. Que el ajuste de −30 sea una pérdida autónoma de la
empresa.
