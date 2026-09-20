# Casos de uso implementados

Cinco recorridos verificables en la aplicación, cada uno con una pregunta de
negocio, cifras de referencia, explicación y guía de capturas. La introducción
al catálogo y las reglas de lectura están en [`../README.md`](../README.md).

## Índice

| #                                          | Caso                                          | Idea que aporta                                              |
| ------------------------------------------ | --------------------------------------------- | ------------------------------------------------------------ |
| [01](./01-misma-nota-dos-empresas.md)      | La misma nota, dos empresas distintas         | El score ordena; la evidencia explica diferencias.           |
| [02](./02-holding-absorbe-y-drena.md)      | El holding puede absorber o drenar caja       | Capacidad autónoma frente a exposición intragrupo.           |
| [03](./03-misma-nota-puertas-distintas.md) | La misma nota puede abrir o cerrar una oferta | Los bloques y las puertas evitan compensar riesgos críticos. |
| [04](./04-impago-nota-buena.md)            | Una nota buena no tapa un impago              | Una obligación incumplida prevalece sobre el promedio.       |
| [05](./05-forecast-en-sombra.md)           | El forecast informa, pero todavía no decide   | La previsión orienta sin modificar la oferta actual.         |

Cifras del corte `2026-08`, contrato `scoreSolo-holding-v7`. Imágenes en
[`images/`](./images/).

En conjunto, los cinco casos recorren las capas esenciales del producto:
score, confianza, bloques A/B/C, holding, puertas de crédito, decisión y
forecast. Ninguna ficha debe interpretarse solo por la nota final.
