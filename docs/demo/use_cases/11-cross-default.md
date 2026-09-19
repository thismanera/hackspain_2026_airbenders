# 11 — Cross-default: la hermana cierra y arrastra

> «Filial a 78, en mejora, forecast a 85. Cierra porque se cierra COMP_0868, el 30 % del grupo.»

**Empresas:** `COMP_0245` (arrastrada) y `COMP_0868` (origen), `GROUP_0096`
**Pantallas:** ficha 0245 (puerta `grupo`) + ficha 0868 + vista de grupo.
**Corte:** 2026-08.

D1 de 0245 = 0,30: justo el umbral de contagio por cierre propio de una hermana.

## Qué demuestra

Un banco ve una cuenta sana. Embat ve el grupo. Cross-default no es el ajuste
de holding (−5,2 aquí es menor): es una puerta de decisión.

## Cifras

| | COMP_0245 arrastrada | COMP_0868 origen |
| --- | ---: | ---: |
| `scoreSolo` | 78,2 | 70,4 |
| `ajusteHolding` | −5,2 | 0 |
| Confianza | 0,98 | 0,97 |
| Dirección | Mejora estructural | Estable |
| Alertas | `recuperacion` | `vencido_alto` |
| Decisión | **cerrar** | **cerrar** |
| Puerta | **`grupo`** | `clientes` |
| Motivo | Cierre de COMP_0868 (30 % del grupo) | Vencido alto |
| Cross-default | **activo**, causa `COMP_0868` | no (es el origen) |
| Forecast 3m | 85,0 | 66,4 |

## Cómo contarlo

1. 0245: 78, recupera, forecast 85. «Parece Y.»
2. Motivo: cierre de la hermana.
3. 0868: vencido alto, D1 0,33.
4. «No es un recorte de nota. Es una puerta de grupo.»

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha 0245 | `captures/11-ficha-comp-0245.png` |
| Ficha 0868 | `captures/11-ficha-comp-0868.png` |
| Grupo 0096 | `captures/11-grupo-0096.png` |

## Qué no decir

Que 0245 esté mal de caja. Que el −5 de holding sea el contagio: el contagio
aquí es el cross-default.

## Relacionado

[02 grupo](./02-grupo-absorbe-vs-drena.md) · [07 vencido](./07-vencido-alto-sin-oferta.md) · [12 techo](./12-techo-de-grupo.md)
