# Casos de uso

Embat Flow se enseña con empresas reales del corte **2026-08** y el contrato
`scoreSolo-holding-v7`. Cada ficha responde a una pregunta distinta y apunta
a una pantalla donde comprobarla.

Hay dos carpetas:

| Carpeta | Qué hay | Estado |
| ------- | ------- | ------ |
| [`use_cases/`](./use_cases/) | [01](./use_cases/01-misma-nota-dos-empresas.md) empate a 67 y [02](./use_cases/02-holding-absorbe-y-drena.md) holding que absorbe y drena | Completos: cifras, recorrido y capturas |
| [`use_cases_factibles/`](./use_cases_factibles/) | Puertas, impago, forecast, datos, aval y pignoración | Factibles en el mismo run; por tiempo no rellenamos guion ni capturas. Cada ficha explica el problema y cómo lo resolvería el producto |

Las fichas Markdown preparan el relato. La aplicación necesita un run
compatible materializado en Prisma; sin ese run no hay datos de relleno. El
forecast está en **modo sombra** y los límites son simulados.

La calibración congelada está en
[`artifacts/inference/scoreSolo-holding-v7/`](../../artifacts/inference/scoreSolo-holding-v7/).

## Qué cubren los dos casos completos

**01 — La misma nota, dos empresas.** `COMP_0524` y `COMP_0563` rondan 67.
Los bloques A/B/C, la trayectoria, el holding y la decisión no coinciden. El
score ordena; la evidencia explica.

**02 — El holding absorbe o drena.** En `GROUP_0217`, `COMP_0512` recibe apoyo
(Solo 52, Grupo 71) y cierra por puertas; `COMP_0926` aporta caja al grupo
(Solo 95, Grupo 82) y puede ampliar. El banco necesita las dos lecturas.

Juntas responden la idea central: la nota no es la empresa, y el banco no ve
el grupo si mira solo a la filial.

## Cómo leer una ficha

En todas se repite el mismo orden, esté grabada o no:

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

## Casos factibles

El producto ya cubre más situaciones en el mismo run. No están en el vídeo.
El índice y el texto teórico están en
[`use_cases_factibles/`](./use_cases_factibles/).

| # | Pregunta | Cómo lo resolvería |
| - | -------- | ------------------ |
| [03](./use_cases_factibles/03-misma-nota-puertas-distintas.md) | Misma nota, ¿oferta o ninguna? | El score ordena; las puertas eligen. |
| [04](./use_cases_factibles/04-impago-nota-buena.md) | ¿Una nota buena tapa un impago? | La puerta de obligaciones manda sobre tendencia y forecast. |
| [05](./use_cases_factibles/05-forecast-en-sombra.md) | ¿La previsión aprueba hoy? | Se enseña en sombra; no mueve el límite. |
| [06](./use_cases_factibles/06-datos-insuficientes.md) | ¿Volumen alto basta para evaluar? | `sin_datos` cierra por falta de evidencia, no por ser mala. |
| [07](./use_cases_factibles/07-aval-condicionado.md) | ¿El grupo arregla a la filial? | Apoyo visible y condicionado; no borra puertas duras. |
| [08](./use_cases_factibles/08-pignoracion-caja.md) | ¿Una empresa sana puede drenar caja? | Solo, Grupo y cortafuegos en la misma ficha. |

## Capturas

Una por idea, no una por pantalla. Guía en
[`use_cases/captures/`](./use_cases/captures/). Solo 01 y 02 las llevan.

## Qué no decir

- Que `scoreSolo` o `scoreGrupo` sean probabilidades de impago.
- Que el forecast en sombra modifique el límite.
- Que un ajuste positivo de holding sea un aval jurídico.
- Que el playbook demuestre causalidad o decisiones de gestión.
- Que los casos factibles estén preparados para presentarlos como demo.
