# Casos de uso

Embat Flow se enseña con empresas reales del corte **2026-08** y el contrato
`scoreSolo-holding-v7`. Cada ficha responde a una pregunta distinta y apunta
a una pantalla donde comprobarla.

Hay dos carpetas:

| Carpeta                                                  | Qué hay                                                                                                                                                                              | Estado                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| [`use_cases_implementados/`](./use_cases_implementados/) | [01](./use_cases_implementados/01-misma-nota-dos-empresas.md), comparación de empresas, y [02](./use_cases_implementados/02-holding-absorbe-y-drena.md), holding que absorbe y drena | Recorridos principales de la aplicación       |
| [`other_use_cases/`](./other_use_cases/)                 | Puertas, impago, forecast, datos, aval y pignoración                                                                                                                                 | Casos adicionales localizados en el mismo run |

Las fichas Markdown preparan el relato. La aplicación necesita un run
compatible materializado en Prisma; sin ese run no hay datos de relleno. El
forecast está en **modo sombra** y los límites son simulados.

La calibración congelada está en
[`artifacts/inference/scoreSolo-holding-v7/`](../../artifacts/inference/scoreSolo-holding-v7/).

## Qué cubren los dos casos principales

**01 — La misma nota, dos empresas.** `COMP_0484` y `COMP_0875` rondan 61.
Las dos cierran, pero la cobertura, las alertas y el motivo de fiabilidad no
coinciden. El score ordena; la evidencia explica.

**02 — El holding absorbe o drena.** En `GROUP_0217`, `COMP_0512` recibe apoyo
(Solo 52, Grupo 71) y cierra por puertas; `COMP_0926` aporta caja al grupo
(Solo 95, Grupo 82) y puede ampliar. El banco necesita las dos lecturas.

Juntas responden la idea central: la nota no es la empresa, y el banco no ve
el grupo si mira solo a la filial.

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

## Casos adicionales

El producto cubre más situaciones en el mismo run. Cada ficha contiene una
explicación escrita autosuficiente y una guía que indica dónde insertar las
capturas. El índice está en [`other_use_cases/`](./other_use_cases/).

| #                                                          | Pregunta                             | Cómo lo resolvería                                          |
| ---------------------------------------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| [03](./other_use_cases/03-misma-nota-puertas-distintas.md) | Misma nota, ¿oferta o ninguna?       | El score ordena; las puertas eligen.                        |
| [04](./other_use_cases/04-impago-nota-buena.md)            | ¿Una nota buena tapa un impago?      | La puerta de obligaciones manda sobre tendencia y forecast. |
| [05](./other_use_cases/05-forecast-en-sombra.md)           | ¿La previsión aprueba hoy?           | Se enseña en sombra; no mueve el límite.                    |
| [06](./other_use_cases/06-datos-insuficientes.md)          | ¿Volumen alto basta para evaluar?    | `sin_datos` cierra por falta de evidencia, no por ser mala. |
| [07](./other_use_cases/07-aval-condicionado.md)            | ¿El grupo arregla a la filial?       | Apoyo visible y condicionado; no borra puertas duras.       |
| [08](./other_use_cases/08-pignoracion-caja.md)             | ¿Una empresa sana puede drenar caja? | Solo, Grupo y cortafuegos en la misma ficha.                |

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
