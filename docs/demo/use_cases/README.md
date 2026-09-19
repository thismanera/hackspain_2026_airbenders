# Casos de uso para la demo

Un fichero por caso, con empresas del run `73ef3e1227d705245c047eec`
(`scoreSolo-holding-v7`, corte **2026-08**). Las capturas del dashboard van en
[`captures/`](./captures/).

La previsión está en **modo sombra**: se enseña y no modifica la oferta. Los
límites son simulaciones, no líneas contratadas. El playbook describe cambios
observados, no lo que hizo el tesorero.

El ejemplo ficticio Northbrook/Velasco está en
[`../../history/2026-09-19-demo-comparativa-empresas.md`](../../history/2026-09-19-demo-comparativa-empresas.md).
El guion de 90 s sigue en [`../README.md`](../README.md).

## Cómo usar cada ficha

1. Lee el golpe de una línea (cita al inicio).
2. Abre las empresas en el dashboard y pega las capturas en `captures/` con el
   nombre que indica el fichero.
3. Cuenta score → holding si aplica → decisión → forecast (sombra) → playbook.
4. Cierra con «qué no decir».

## Golden path (90 s)

| # | Caso | Golpe |
| --- | --- | --- |
| [01](./01-empate-nota-holding-opuesto.md) | Empate a 67 | Misma nota, holding y rumbo opuestos |
| [02](./02-grupo-absorbe-vs-drena.md) | Cash pooling | Quien absorbe vs quien pierde capital |
| [03](./03-misma-nota-sin-oferta.md) | Sin botón | Otro 59: una pide y la otra no |

## Vista pyme

| # | Caso | Golpe |
| --- | --- | --- |
| [04](./04-pedir-circulante-en-mejora.md) | Pedir circulante | Recupera, hay oferta, pulsa el botón |
| [05](./05-ampliar-linea-en-mejora.md) | Ampliar | Ya tiene línea; la política sube el vigente |

## Puertas (la nota no aprueba)

| # | Caso | Golpe |
| --- | --- | --- |
| [06](./06-impago-con-nota-buena.md) | Impago | 66 puntos, forecast al alza, impago → no hay grifo |
| [07](./07-vencido-alto-sin-oferta.md) | Clientes | 74 puntos y solo falla `vencido_alto` |
| [08](./08-forecast-no-salva.md) | Sombra | Forecast a 89; la puerta de caja cierra igual |
| [09](./09-datos-insuficientes.md) | Historia | 60 puntos y 1,7 M€ de cobros, confianza 0,26 |

## Grupo y política

| # | Caso | Golpe |
| --- | --- | --- |
| [10](./10-aval-condicionado.md) | Aval | Solo 58, grupo 76: oferta condicionada a aval |
| [11](./11-cross-default.md) | Contagio | Filial a 78 cerrada porque cierra la hermana |
| [12](./12-techo-de-grupo.md) | Techo | Recomendado 1,22 M€; vigente 881 k€ por techo |
| [13](./13-pignoracion-caja.md) | Pignoración | Autónoma 90, holding −30, plazo topado a 90 días |

## Memoria mensual

| # | Caso | Golpe |
| --- | --- | --- |
| [14](./14-cierre-pendiente.md) | Histéresis | Falla caja un mes: no cierra, preaviso |
| [15](./15-bache-puntual-mantiene.md) | Bache | Pico, patrón bache, la línea se mantiene |
| [16](./16-ewi-recorta-plazo.md) | EWI | Abre, pero el plazo máximo baja a 60 días |
| [17](./17-cartera-sana-estable.md) | Control | Empresa aburrida y sana: el sistema también sabe no tocar |

## Lo que no se dice en ninguno

- Que el score sea probabilidad de impago o una aprobación.
- Que el forecast conectado mueva la oferta.
- Que el playbook pruebe una decisión de gestión.
- Que un ajuste positivo sea un aval jurídico firmado.
