# 03 — La misma nota puede tener una oferta o ninguna

> Caso documentado con datos del corte 2026-08.

## Qué demuestra

Un analista puede ver dos empresas con la misma nota y asumir que merecen el
mismo tratamiento. En crédito de circulante eso falla: el score resume la
salud observada, mientras que las puertas determinan si esa salud cumple la
política mínima para ofrecer financiación.

**Ejemplo localizado** (corte 2026-08):

|                            |        `COMP_1228` |         `COMP_0664` |
| -------------------------- | -----------------: | ------------------: |
| `scoreSolo` / `scoreGrupo` |        59,0 / 59,0 |         59,0 / 59,0 |
| Confianza                  |               0,63 |                0,93 |
| A / B / C                  | 55,1 / 61,4 / 63,1 |  31,7 / 89,0 / 71,9 |
| Dirección                  | Mejora estructural |  Deterioro temporal |
| Decisión                   |              Abrir |              Cerrar |
| Puerta clave               |               Pasa | Caja: A = 31,7 < 50 |

## Explicación del caso

`COMP_1228` y `COMP_0664` terminan agosto con exactamente la misma lectura:
59,0 tanto en `scoreSolo` como en `scoreGrupo`. El holding es neutro para las
dos, por lo que no sirve para explicar el resultado. Si el proceso terminara en
la nota, ambas empresas quedarían empatadas y el analista no dispondría de un
criterio visible para diferenciarlas.

La cascada A/B/C muestra que el empate se construye de maneras muy distintas.
`COMP_1228` presenta bloques relativamente equilibrados —55,1 en caja, 61,4 en
fiabilidad y 63,1 en circulante— y mantiene todos los pilares por encima de los
mínimos exigidos. La empresa pasa las puertas y la decisión puede traducirse en
una oferta con límite, plazo y TAE. Su dirección de mejora estructural aporta
contexto favorable, aunque no sustituye ninguna comprobación.

`COMP_0664`, en cambio, combina una fiabilidad muy alta, 89,0, y un circulante
de 71,9 con un bloque de caja de solo 31,7. La buena puntuación de B y C compensa
la debilidad de A dentro del promedio y lleva el score total hasta 59,0, pero
esa compensación no es válida para conceder crédito: la caja debe superar su
propia puerta. Como A queda por debajo de 50, la empresa cierra sin oferta y la
pantalla identifica **Caja** como motivo concreto.

La diferencia entre ambos resultados no es una excepción manual ni un umbral
mágico asociado al 59. Es la consecuencia de separar dos preguntas: «¿cómo se
ordena la empresa?» y «¿cumple todas las condiciones mínimas para financiarla
hoy?». El score responde la primera; las puertas responden la segunda. Así se
evita aprobar una debilidad crítica porque otros bloques la compensen y también
se evita denegar sin una explicación verificable.

**Pantallas:** `/pares?empresas=COMP_1228,COMP_0664`,
`/cartera/COMP_1228?mes=2026-08` y
`/cartera/COMP_0664?mes=2026-08`.

## Capturas sugeridas y ubicación

| Dónde pegarla               | Qué debe mostrar                                                                                    | Archivo sugerido                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Después del primer párrafo  | Comparación en paralelo con el empate 59,0 / 59,0 y ajuste de holding neutro.                       | `../use_cases_implementados/images/03-comparacion.png`          |
| Después del segundo párrafo | Ficha de `COMP_1228` con los tres bloques por encima del mínimo, puertas abiertas y menú de oferta. | `../use_cases_implementados/images/03-comp-1228-oferta.png`     |
| Después del tercer párrafo  | Ficha de `COMP_0664` con A = 31,7, puerta de caja fallida, motivo visible y menú vacío.             | `../use_cases_implementados/images/03-comp-0664-sin-oferta.png` |

**Qué no decir.** Que 59 sea un umbral mágico. Que pasar una puerta equivalga a
un préstamo aprobado.
