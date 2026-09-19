# 14 — Cierre pendiente (histéresis)

> «Falla caja un mes. No cerramos: preaviso, vigente 245 k€, cierrePendiente.»

**Empresa:** `COMP_1106` (GROUP_0056)
**Pantallas:** ficha con estado `cierre pendiente`, no un cierre confirmado.
**Corte:** 2026-08.

## Qué demuestra

Un mes de puerta blanda (`caja` por umbral de A, sin déficit persistente) no
mata la línea. El partner ve un preaviso. El segundo mes confirmaría.

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` | 65,9 |
| Confianza | 0,66 |
| A / B / C | **48** / 82 / 78 |
| Dirección | Estable |
| Inflexión | Pico 2026-04 (81,7) |
| Decisión | **mantener**, **no elegible** |
| `cierrePendiente` | **true** |
| L / vigente | 0 / **245.000 €** |
| Plazo | 60 días |
| Puerta | `caja` (A 48,2 < 50) |
| Menú | sigue existiendo sobre el vigente (40 k€ / 81 k€) |
| Forecast 3m / 6m | 62,1 / 60,5 |

EWI interno sí, de ahí el tope a 60 días.

## Cómo contarlo

1. «65 puntos, A se ha ido a 48.»
2. No es `cerrar`. Es `mantener` + preaviso.
3. «Un bache de un mes no es un default. El mes que viene, si sigue, sí.»

Contraste: [07](./07-vencido-alto-sin-oferta.md) y déficit persistente cierran
sin espera.

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha preaviso | `captures/14-ficha-comp-1106.png` |
| Badge cierre pendiente | `captures/14-cierre-pendiente.png` |

## Qué no decir

Que sea elegible (no lo es: no hay grifo nuevo). Que el vigente se haya
anulado. Que «mantener» signifique que todo va bien.

## Relacionado

[15 bache](./15-bache-puntual-mantiene.md) · [08 forecast](./08-forecast-no-salva.md) · [05 ampliar](./05-ampliar-linea-en-mejora.md)
