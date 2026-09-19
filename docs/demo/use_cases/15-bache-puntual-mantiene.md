# 15 — Bache puntual: la línea se mantiene

> «Pico en abril a 82, ahora 68, patrón bache. Elegible, acción mantener, vigente 806 k€.»

**Empresa:** `COMP_0362` (GROUP_0142)
**Pantallas:** ficha con `patronTrayectoria = bache_puntual` + serie.
**Corte:** 2026-08.

## Qué demuestra

No todo deterioro es estructural. Un bache no dispara `reducir` ni `cerrar` si
las puertas siguen en pie. Contraste con 0563 ([01](./01-empate-nota-holding-opuesto.md),
inestabilidad) y 0512 ([02](./02-grupo-absorbe-vs-drena.md), caída estructural).

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` | 67,9 |
| Confianza | 0,80 |
| A / B / C | 54 / 90 / 66 |
| Dirección / naturaleza | Estable / sin cambio |
| Patrón | **`bache_puntual`** |
| Inflexión | Pico 2026-04 (82,5) |
| Alertas | `alerta_temprana_deterioro` |
| Decisión | **mantener**, elegible |
| L / vigente | 458 k€ / **806 k€** |
| Banda / plazo | B / 120 días |
| Menú | 134 k€ a 30 días (7,0 %) |
| Forecast 3m / 6m | 63,8 / 66,1 |

El vigente (806 k€) está por encima del recomendado (458 k€): la bajada del
recomendado no se aplica entera este mes (histéresis ±25 % y umbral 85 %).

## Cómo contarlo

1. Slider: 82 en abril, 68 ahora.
2. Etiqueta bache, no caída estructural.
3. «Alerta temprana sí; recorte de golpe no.»

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha / patrón | `captures/15-ficha-comp-0362.png` |
| Slider abril→agosto | `captures/15-slider-comp-0362.png` |

## Qué no decir

Que 82→68 sea ruido blanco ignorado. Hay alerta temprana. Que el vigente vaya
a quedarse en 806 k€ para siempre.

## Relacionado

[14 cierre pendiente](./14-cierre-pendiente.md) · [01 empate](./01-empate-nota-holding-opuesto.md) · [16 EWI](./16-ewi-recorta-plazo.md)
