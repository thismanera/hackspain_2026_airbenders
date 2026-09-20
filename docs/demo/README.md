# Casos de uso

Embat Flow se explica con cinco casos verificables del corte **2026-08** y el
contrato `scoreSolo-holding-v7`. Cada ficha responde a una pregunta distinta,
documenta sus cifras y apunta a la pantalla donde comprobarlas.

Todos los recorridos están en
[`use_cases_implementados/`](./use_cases_implementados/):

| #                                                                  | Pregunta                                        | Respuesta del producto                                          |
| ------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------- |
| [01](./use_cases_implementados/01-misma-nota-dos-empresas.md)      | ¿Una nota parecida describe la misma situación? | No. La evidencia, confianza y trayectoria explican la nota.     |
| [02](./use_cases_implementados/02-holding-absorbe-y-drena.md)      | ¿Cómo cambia la lectura dentro de un holding?   | Se separan capacidad autónoma, apoyo y drenaje de caja.         |
| [03](./use_cases_implementados/03-misma-nota-puertas-distintas.md) | ¿La misma nota produce la misma oferta?         | No. Los bloques y las puertas deciden si se puede financiar.    |
| [04](./use_cases_implementados/04-impago-nota-buena.md)            | ¿Una nota buena puede tapar un impago?          | No. El incumplimiento mantiene cerrada la puerta de fiabilidad. |
| [05](./use_cases_implementados/05-forecast-en-sombra.md)           | ¿Una previsión favorable permite aprobar hoy?   | No. En modo sombra informa, pero no modifica la decisión.       |

Las fichas Markdown preparan el relato. La aplicación necesita un run
compatible materializado en Prisma; sin ese run no hay datos de relleno. El
forecast está en **modo sombra** y los límites son simulados.

La calibración congelada está en
[`artifacts/inference/scoreSolo-holding-v7/`](../../artifacts/inference/scoreSolo-holding-v7/).

## Qué cubren los cinco casos

**01 — La misma nota, dos empresas distintas.** `COMP_0484` y `COMP_0875`
rondan 61. Las dos cierran, pero la cobertura, las alertas y el motivo de
fiabilidad no coinciden. El score ordena; la evidencia explica.

**02 — El holding absorbe o drena.** En `GROUP_0217`, `COMP_0512` recibe apoyo
(Solo 52, Grupo 71) y cierra por puertas; `COMP_0926` aporta caja al grupo
(Solo 95, Grupo 82) y puede ampliar. El banco necesita las dos lecturas.

**03 — La misma nota, puertas distintas.** `COMP_1228` y `COMP_0664` terminan
con 59 puntos, pero la primera puede abrir y la segunda cierra porque su bloque
de caja queda por debajo del mínimo. El promedio no compensa una debilidad
crítica.

**04 — Una nota buena no tapa un impago.** `COMP_0540` obtiene 66,3 puntos y
mejora, pero la alerta de obligaciones incumplidas mantiene cerrada la puerta
de fiabilidad. Una señal crítica prevalece sobre nivel, tendencia y forecast.

**05 — El forecast informa, pero todavía no decide.** `COMP_0558` proyecta una
mejora desde 61,0 hasta 86,1 a tres meses, pero su caja actual no pasa la puerta.
La previsión está visible en modo sombra y no concede hoy contra una mejora
futura.

Los cinco recorridos sostienen una misma idea: la nota no es la empresa. Para
tomar una decisión hay que leer su evidencia, el equilibrio entre bloques, el
grupo, las puertas y qué información participa realmente en la política.

## Cómo leer una ficha

En todas se repite el mismo orden:

`scoreSolo → bloques A/B/C → scoreGrupo y holding → estado y puertas → decisión
→ forecast → playbook`.

- `scoreSolo` es la capacidad autónoma.
- `scoreGrupo` añade el contexto del holding; no sustituye la generación propia.
- La decisión aplica puertas y política.
- El forecast anticipa 3 y 6 meses y en esta entrega no cambia la oferta.
- El playbook describe cambios observados y propone preguntas de tesorería. No
  afirma causalidad ni garantiza financiación.

Pantallas:

- Partner: `/cartera/COMP_xxxx?mes=2026-08`
- Empresa: `/empresa?empresa=COMP_xxxx&mes=2026-08`
- Holding: `/grupos?mes=2026-08`

Si la pantalla no coincide con la ficha, no mezcles cifras. Comprueba primero
contrato, run y mes.

## Capturas

Cada ficha propone de tres a cuatro capturas y especifica después de qué párrafo
insertarlas. Los archivos se guardan en
[`use_cases_implementados/images/`](./use_cases_implementados/images/), con el
número del caso como prefijo. Conviene capturar una idea por imagen y recortar
la interfaz hasta dejar visibles el dato y su explicación.

## Qué no decir

- Que `scoreSolo` o `scoreGrupo` sean probabilidades de impago.
- Que el forecast en sombra modifique el límite.
- Que un ajuste positivo de holding sea un aval jurídico.
- Que el playbook demuestre causalidad o decisiones de gestión.
- Que una captura de otro mes o de otro run demuestre las cifras documentadas.
