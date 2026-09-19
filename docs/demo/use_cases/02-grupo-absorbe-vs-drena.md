# 02 — Mismo grupo: quien absorbe vs quien pierde capital

> «Un banco que solo ve a 0512 lee un 71. Embat ve que 19 puntos los pone el grupo y que el 90 % de la entrada es de hermanas.»

**Empresas:** `COMP_0512` (receptor) y `COMP_0926` (donante), ambas `GROUP_0217`
**Pantallas:** ficha de grupo + dos fichas de filial.
**Corte:** 2026-08.

No uses `COMP_0081` del mismo grupo: su D4 ≈ 735 es un artefacto de cobros ~0.

## Qué demuestra

Cash pooling. La nota autónoma se calcula sin espejos; el holding los devuelve
como apoyo o drenaje. Prestar contra el 71 de la filial es prestar contra el
dinero de la matriz. El aval no tapa déficit persistente ni vencidos.

## Cifras

| | COMP_0512 receptor | COMP_0926 donante |
| --- | ---: | ---: |
| `scoreSolo` | 52,0 | 95,0 |
| `scoreGrupo` | **71,4 (+19,4)** | **82,5 (−12,5)** |
| Perfil | `filial_subvencionada` | `drenaje_tesoreria` |
| D4 | **+0,90** | **−0,70** |
| Dirección | Deterioro estructural | Mejora temporal |
| Playbook | `reaccion_destructiva` (pico abr, 60→52) | `en_recuperacion` (suelo may, 86→95) |
| Decisión | **cerrar, sin menú** | **ampliar** 11,8 M€, banda A, 180 días |
| Motivo | Déficit persistente; también `clientes` | — |
| Banda / efectiva | C / D | A / A |
| Forecast 3m grupo | 70 | 80 |

El 95 de 0926 no es tamaño descomunal: es generación propia **después** de
quitar espejos. `contagio_grupo` le resta 12,5 y aun así `ampliar`.

## Cómo contarlo

1. Vista de grupo: 22 filiales, un bloque que absorbe y otro que drena.
2. 0512: Solo 52, Grupo 71, puertas `caja` + `clientes`. «El aval no abre esto.»
3. Playbook: A1 −5,1 y A2 −3,7 mientras el holding **aumenta** el apoyo.
4. 0926: menú A, TAE desde 4,5 %.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Grupo 0217 | `captures/02-grupo-0217.png` |
| Ficha 0512 | `captures/02-ficha-comp-0512.png` |
| Ficha 0926 | `captures/02-ficha-comp-0926.png` |

## Qué no decir

Que 0512 sea «sana por el 71». Que 0926 sea una empresa de miles de millones.
Que el +19 pruebe un aval firmado.

## Relacionado

[01 empate](./01-empate-nota-holding-opuesto.md) · [10 aval](./10-aval-condicionado.md) · [11 cross-default](./11-cross-default.md) · [13 pignoración](./13-pignoracion-caja.md)
