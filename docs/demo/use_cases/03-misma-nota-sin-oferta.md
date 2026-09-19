# 03 — Misma nota, una pide y la otra no

> «Otro 59. Una recupera y hay oferta. La otra llega al mismo 59 desde 70 y no hay botón.»

**Empresas:** `COMP_1228` (GROUP_0049) y `COMP_0664` (GROUP_0058)
**Pantallas:** vista pyme de cada una (con y sin «pedir circulante») + fichas.
**Corte:** 2026-08.

Holding ~0 en ambas, para no repetir los casos 01 y 02.

## Qué demuestra

La nota no aprueba; las puertas sí. Caso negativo limpio.

## Cifras

| | COMP_1228 | COMP_0664 |
| --- | ---: | ---: |
| `scoreSolo` / `scoreGrupo` | **59,0 / 59,0** | **59,0 / 59,0** |
| Confianza | 0,63 | 0,93 |
| A / B / C | 55,1 / 61,4 / 63,1 | **31,7** / 89,0 / 71,9 |
| Dirección | Mejora estructural | Deterioro temporal |
| Playbook | `en_recuperacion` (suelo feb, 48→59) | `reaccion_destructiva` (pico mar, 70→59) |
| Decisión | **abrir** 196 k€, 60 días | **cerrar, menú vacío** |
| Motivo | — | Pilar A 31,7 < 50 (puerta `caja`) |
| TAE | 10,5 % / 11,0 % | — |
| Forecast 3m / 6m | **71 / 75** (mejora) | **57 / 54** |

## Cómo contarlo

1. Empate a 59, holding neutro.
2. Vista pyme 1228: botón y menú 32 k€ / 65 k€.
3. Vista pyme 0664: sin botón. Motivo de caja, no el forecast.
4. Playbook 0664: A3 −5,2, A2 −3,0. Recuperable 71 no salta la puerta.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Pyme 1228 (con botón) | `captures/03-pyme-comp-1228.png` |
| Pyme 0664 (sin botón) | `captures/03-pyme-comp-0664.png` |
| Fichas | `captures/03-fichas.png` |

## Qué no decir

Que el forecast a la baja es lo que cierra a 0664. Cierra la puerta de caja.
Que 59 sea un umbral mágico de aprobación.

## Relacionado

[04 pedir](./04-pedir-circulante-en-mejora.md) · [06 impago](./06-impago-con-nota-buena.md) · [07 vencido](./07-vencido-alto-sin-oferta.md) · [08 forecast](./08-forecast-no-salva.md)
