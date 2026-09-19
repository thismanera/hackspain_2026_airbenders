# 10 — Oferta condicionada a aval

> «Autónoma 58, grupo 76. La oferta existe porque el holding aporta +17, y se etiqueta como condicionada a aval.»

**Empresa:** `COMP_0550` (GROUP_0246)
**Pantallas:** ficha con `condicionAvalMatriz` + bloque D.
**Corte:** 2026-08.

Única empresa del corte que sale **elegible** con aval condicionado.

## Qué demuestra

La ruta de aval puede superar la puerta de nota/caja débil. No tapa
incumplimiento, vencidos ni déficit persistente (eso es [02](./02-grupo-absorbe-vs-drena.md)).
El dataset no identifica matriz legal: la condición es de producto, no un
contrato.

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` / `scoreGrupo` | 58,3 / **75,8 (+17,5)** |
| Confianza | 0,88 |
| A / B / C | 51 / 66 / 62 |
| D4 | 0,97 (casi toda la entrada es de grupo) |
| `requiereAvalMatriz` / `condicionAvalMatriz` | sí / **sí** |
| Decisión | **reducir**, elegible |
| L / vigente | 174 k€ / 234 k€ |
| Banda / plazo | A (la del grupo) / 60 días |
| Menú | 39 k€ a 30 días (5,0 %) · 78 k€ a 60 (5,5 %) |
| Inflexión | Pico 2026-06 (80,5) |
| Forecast 3m solo / grupo | 52,4 / 69,6 |

## Cómo contarlo

1. Solo 58 no abriría sola. Grupo 76 y +17,5.
2. Etiqueta de aval. Banda A del grupo, factor A autónomo recorta importe.
3. «D4 0,97: está bebiendo del holding. Por eso el aval es condición, no adorno.»
4. Reduce el vigente: la ruta no es un cheque en blanco.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha / aval | `captures/10-ficha-comp-0550.png` |
| Bloque grupo | `captures/10-grupo-0246.png` |

## Qué no decir

Que haya un aval notarial. Que 0512 ([02](./02-grupo-absorbe-vs-drena.md))
debería haber pasado por aquí: allí fallan caja persistente y vencidos.

## Relacionado

[02 grupo](./02-grupo-absorbe-vs-drena.md) · [12 techo](./12-techo-de-grupo.md) · [01 empate](./01-empate-nota-holding-opuesto.md)
