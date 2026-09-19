# 04 — Una nota buena no tapa un impago

> Factible. No grabado: la demo no entra en puertas duras de obligaciones.

**Problema.** Una empresa mejora, el score sube y el analista se tienta a
abrir. Si hay un impago de obligaciones, esa tendencia no paga lo ya vencido.
Sin una puerta propia, el impago se diluye en la nota o se discute a mano.

**Cómo lo resolvería Embat Flow.** Las obligaciones tienen una puerta de
fiabilidad independiente del score y del forecast. El motor puede mostrar 66
puntos, mejora temporal y previsión al alza, y aun así cerrar con menú vacío
mientras exista `impago_obligaciones`. El holding no maquilla esa señal. Es
protección de política, no una penalización escondida dentro de A/B/C.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

| Campo                      |                 Valor |
| -------------------------- | --------------------: |
| Empresa                    | `COMP_0540` (GROUP_0048) |
| `scoreSolo` / `scoreGrupo` |           66,3 / 59,4 |
| Confianza                  |                  0,77 |
| A / B / C                  |          69 / 59 / 69 |
| Dirección                  |       Mejora temporal |
| Alerta                     | `impago_obligaciones` |
| Decisión                   |    Cerrar, menú vacío |
| Forecast Solo 3m / 6m      |           73,8 / 76,8 |

**Qué no decir.** Que el forecast garantice la recuperación. Que el ajuste de
holding sea la causa del cierre. Que el playbook contradiga la decisión: miden
cosas distintas.
