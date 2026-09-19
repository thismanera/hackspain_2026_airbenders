# 03 — La misma nota puede tener una oferta o ninguna

> Factible. No grabado: el vídeo se queda en el empate (01) y el holding (02).

**Problema.** Un analista ve dos empresas con la misma nota y asume el mismo
tratamiento. En crédito de circulante eso falla: la nota resume salud, no
elige. Sin puertas visibles, o se aprueba de más o se niega sin motivo
enseñable.

**Cómo lo resolvería Embat Flow.** El score ordena; la decisión aplica una
política de puertas (confianza, obligaciones, caja, clientes, grupo). Dos
empresas pueden cerrar a 59 y divergir: una pasa y recibe menú (límite, plazo,
TAE); la otra falla caja y queda cerrada con el motivo a la vista. El holding
neutro no decide. El forecast puede contextualizar, pero no borra una puerta
del mes actual.

**Ejemplo localizado** (corte 2026-08, no recorrido de demo):

|                            |        `COMP_1228` |         `COMP_0664` |
| -------------------------- | -----------------: | ------------------: |
| `scoreSolo` / `scoreGrupo` |        59,0 / 59,0 |         59,0 / 59,0 |
| Confianza                  |               0,63 |                0,93 |
| A / B / C                  | 55,1 / 61,4 / 63,1 |  31,7 / 89,0 / 71,9 |
| Dirección                  | Mejora estructural |  Deterioro temporal |
| Decisión                   |              Abrir |              Cerrar |
| Puerta clave               |               Pasa | Caja: A = 31,7 < 50 |

Pantallas, si se retoma: `/empresa?empresa=COMP_1228&mes=2026-08` frente a
`COMP_0664`, y las fichas de `/cartera/`.

**Qué no decir.** Que 59 sea un umbral mágico. Que pasar una puerta equivalga a
un préstamo aprobado.
