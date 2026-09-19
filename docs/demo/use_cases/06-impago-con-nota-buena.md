# 06 — Impago con nota buena y forecast al alza

> «66 puntos, mejora, forecast a 74. Hay un impago de obligaciones: no hay grifo.»

**Empresa:** `COMP_0540` (GROUP_0048)
**Contraste opcional:** `COMP_0447` ([04](./04-pedir-circulante-en-mejora.md)), 67,4 y sí abre.
**Pantallas:** ficha + alerta `impago_obligaciones`.
**Corte:** 2026-08.

## Qué demuestra

Puerta `fiabilidad`. La nota y el forecast no tapan un impago. Negativo más
duro que el 03 (allí fallaba caja; aquí la historia parece buena).

## Cifras

| Campo | Valor |
| --- | ---: |
| `scoreSolo` / `scoreGrupo` | 66,3 / 59,4 (−6,9) |
| Confianza | 0,77 |
| A / B / C | 69 / **59** / 69 |
| Dirección | Mejora temporal |
| Inflexión | Suelo 2026-02 (50,6) → 66,3 |
| Playbook | `en_recuperacion` (A3 +5,1, A1 +2,7, B3 +2,1) |
| Alertas | `impago_obligaciones` |
| Decisión | **cerrar**, menú vacío |
| Motivo | Impago de obligaciones (puerta `fiabilidad`) |
| Forecast 3m / 6m solo | **73,8 / 76,8** (mejora) |

EWI interno sí. El holding −6,9 es secundario: no es el motivo del cierre.

## Cómo contarlo

1. «Nota 66, en recuperación, el modelo ve 74.»
2. Alerta de impago. Pilar B 59 < 60.
3. Sin botón. «No prestamos sobre una nota que ignora la nómina o el tributo.»

## Capturas

| Pantalla | Archivo |
| --- | --- |
| Ficha / alerta | `captures/06-ficha-comp-0540.png` |
| Contraste pyme 0447 | `captures/06-contraste-0447.png` |

## Qué no decir

Que el −7 de holding sea la causa. Que el playbook `en_recuperacion` contradiga
el cierre: el playbook mira A–C desde el suelo; la puerta mira la alerta B2.

## Relacionado

[03 sin oferta](./03-misma-nota-sin-oferta.md) · [07 vencido](./07-vencido-alto-sin-oferta.md) · [08 forecast](./08-forecast-no-salva.md)
