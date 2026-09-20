# 05 — El forecast informa, pero todavía no decide

> Factible. No grabado: en el vídeo el forecast se nombra y no se recorre.

**Problema.** Una previsión fuerte invita a adelantar crédito. Si se mezcla
con la decisión del mes, el banco aprueba una caja que aún no pasa la puerta.
Si se oculta, el tesorero no ve el horizonte.

**Cómo lo resolvería Embat Flow.** Separamos análisis futuro y política
actual. El forecast publica Solo y Grupo a 3 y 6 meses, con intervalo, y en
esta entrega lleva etiqueta **modo sombra**: se enseña y no mueve límite,
plazo ni TAE. La puerta de caja del corte sigue mandando. El usuario ve las
dos lecturas y sabe cuál está aplicada.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

| Campo                 |               Valor |
| --------------------- | ------------------: |
| Empresa               | `COMP_0558` (GROUP_0026) |
| `scoreSolo`           |                66,8 |
| Confianza             |                0,92 |
| A / B / C             |        46 / 85 / 82 |
| Dirección             |  Mejora estructural |
| Decisión              |              Cerrar |
| Motivo                | Pilar A = 46,1 < 50 |
| Forecast Solo 3m / 6m |         88,8 / 90,3 |
| Estado del forecast   |         Modo sombra |

Pantallas, si se retoma: `/empresa?empresa=COMP_0558&mes=2026-08` y la ficha
del partner.

**Qué no decir.** Que 88,8 sea probabilidad de impago o una garantía. Que el
forecast conectado forme parte de esta decisión.
