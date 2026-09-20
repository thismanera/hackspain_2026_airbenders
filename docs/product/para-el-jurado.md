# Embat Flow — paquete de entrega

Documento de entrada para el jurado. El resto de `docs/` es referencia interna.
Brief completo de producto: [PRODUCT.md](./PRODUCT.md).

Embat Flow calcula cada mes la salud de tesorería de una empresa, una oferta de
circulante y un playbook de qué ha cambiado. Embat no presta. El partner
financiero pone el dinero. La empresa decide si pide.

> _Embat no le cuenta al banco cómo va la empresa. Le da una nota y una oferta;
> la empresa decide si la usa. El banco presta viendo, la empresa paga lo que
> merece, y Embat cobra por ponerlos en contacto._

## Qué hay construido

| Pieza                                    | Qué hace                                                                 | Dónde se ve                                              |
| ---------------------------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| Scoring                                  | Nota 0–100 autónoma (`scoreSolo`) y con holding (`scoreGrupo`)           | Ficha y `/empresa`                                       |
| Decisión                                 | Seis puertas, límite, plazo, TAE, acción mensual                         | Ficha y vista empresa                                    |
| Forecast                                 | Previsión a 3 y 6 meses, **modo sombra**: se enseña y no mueve la oferta | Ficha                                                    |
| Playbook                                 | Qué cambió desde un giro confirmado del score                            | Ficha                                                    |
| Cartera, grupo, alertas, pares, backtest | Panel sobre el run importado en Prisma                                   | `/cartera`, `/grupos`, `/alertas`, `/pares`, `/backtest` |

Cálculo determinista. Ningún LLM decide elegibilidad, límite, plazo ni precio.
La interfaz no recalcula: lee filas materializadas. Sin run compatible no hay
datos de relleno.

Contrato: `scoreSolo-holding-v7`. Corte de demo: **agosto 2026**.

## Qué no afirmar

- El score no es probabilidad de impago ni una aprobación.
- Los límites son de la política simulada, no líneas contratadas.
- El forecast en sombra no recorta ni amplía la oferta.
- El playbook describe cambios observados, no una decisión del tesorero.
- Un `ajusteHolding` positivo no es un aval jurídico.
- El botón «pedir circulante» vive en la pestaña (`sessionStorage`). La cartera
  del partner aún lista el dataset completo; el filtro de servidor queda fuera
  de esta entrega.

## Lectura (20–25 min)

1. Este fichero.
2. [Guía de módulos](./modules-guide.md) — qué es cada pieza y cómo leer una ficha.
3. [Guía de métricas](../engines/scoring-metrics.md) — §1 y §2 bastan; el resto
   reconstruye un número de la pantalla.
4. [Casos de uso](../demo/README.md) — introducción y los dos pares de la demo.

No hace falta `SOURCE.md`, `history/` ni `superpowers/`.

## Casos de uso

Mes `2026-08`. El vídeo de demo son estos dos pares. Detalle y cifras en cada
ficha.

| Orden | Abrir                                                | Golpe                                                                   |
| ----- | ---------------------------------------------------- | ----------------------------------------------------------------------- |
| 1     | `/cartera/COMP_0524` y `/cartera/COMP_0563`          | Las dos tienen 67. Holding y rumbo opuestos; una abre y la otra reduce. |
| 2     | `/grupos` → `GROUP_0217` (`COMP_0512` / `COMP_0926`) | El 71 de la filial lo pone el grupo. Quien absorbe no tiene oferta.     |

Puertas, impago, forecast, datos, aval y pignoración son factibles en el mismo
run; no están grabados. Relato teórico en
[use_cases_factibles](../demo/use_cases_factibles/README.md).

## Preguntas frecuentes

| Pregunta                                         | Respuesta                                                                                                                                                                                                                                    |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ¿No se van los clientes si compartís sus datos?  | El flujo de empresa tiene un opt-in y comparte score y límite, no movimientos. En esta demo la marca vive en la sesión y el filtro de cartera del partner en servidor aún está pendiente; no lo presentamos como una garantía ya desplegada. |
| ¿Por qué solo Embat puede hacerlo?               | Un banco ve sus propias cuentas; Embat ve todos los bancos, el ERP y el grupo. Tres meses de movimientos bastan.                                                                                                                             |
| ¿Quién paga?                                     | La empresa, el módulo dentro de Embat; el partner, fee por límite monitorizado y/o comisión por originación.                                                                                                                                 |
| ¿Por qué el partner se fía del score?            | Catorce variables explicables, cascada exacta, backtest publicado con sus cifras (buenas y malas), cero LLM en el cálculo.                                                                                                                   |
| ¿Y el riesgo regulatorio de intermediar crédito? | Punto a estudiar; no lo afirmamos resuelto.                                                                                                                                                                                                  |

No decimos: «avisamos al banco», «vendemos datos», «Embat presta».
