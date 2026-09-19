# Casos factibles, no grabados

El producto ya cubre estas situaciones. Las empresas existen en el run
`scoreSolo-holding-v7`, corte `2026-08`. No forman parte del vídeo de tres
minutos: por tiempo no rellenamos guion, capturas ni recorrido en pantalla.

Cada ficha describe el problema que vería un banco o un tesorero, y **cómo
Embat Flow lo resolvería** con scoring, puertas, holding, forecast y playbook.
Las cifras son de referencia para localizar el ejemplo; no son un relato de
demo.

La demo grabada son [01](../use_cases/01-misma-nota-dos-empresas.md) y
[02](../use_cases/02-holding-absorbe-y-drena.md).

## Índice

| #                                                | Caso                                       | Problema que resuelve                                      |
| ------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------------- |
| [03](./03-misma-nota-puertas-distintas.md)       | La misma nota puede tener oferta o ninguna | Separar salud de elegibilidad.                             |
| [04](./04-impago-nota-buena.md)                  | Una nota buena no tapa un impago           | Priorizar obligaciones observadas.                         |
| [05](./05-forecast-en-sombra.md)                 | El forecast informa, pero no decide        | Anticipar sin saltarse la política del mes.                |
| [06](./06-datos-insuficientes.md)                | Sin datos suficientes                      | No vender una opinión incompleta como oferta.              |
| [07](./07-aval-condicionado.md)                  | Apoyo del holding con aval condicionado    | Usar el grupo sin borrar puertas duras.                    |
| [08](./08-pignoracion-caja.md)                   | Una empresa sana puede drenar caja         | Poner cortafuegos a la exposición intragrupo.              |

## Cómo lo resolvería la solución

El banco hoy ve una nota, o no ve nada. Embat Flow descompone esa nota y
aplica una política explícita:

1. **`scoreSolo`** ordena la capacidad autónoma (caja, cobros, pagos).
2. **Bloques A/B/C** dicen de dónde sale esa nota; no hay un número opaco.
3. **`scoreGrupo` y `ajusteHolding`** publican el contexto del grupo sin
   mezclarlo con la generación propia.
4. **Puertas** comprueban confianza, obligaciones, caja, clientes y grupo.
   Fallar una puerta documentada cierra o condiciona; no se esconde en el
   score.
5. **Decisión** traduce eso a límite, plazo, TAE y acción del mes.
6. **Forecast en sombra** enseña 3 y 6 meses hacia delante y no mueve la
   oferta en esta entrega.
7. **Playbook** resume qué cambió y qué preguntar; no atribuye intención.

Esa cascada es la misma en la demo grabada y en estos casos. Aquí falta el
recorrido de pantalla, no la capacidad.

## Qué no afirmar

- Que estos seis casos estén preparados para el vídeo.
- Que el forecast en sombra cambie el límite.
- Que un ajuste de holding sea un aval jurídico o un contrato de pignoración.
- Que `sin_datos` sea una empresa mala.
