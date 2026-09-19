# Motor de decisión: de la salud observada a una oferta

Implementación revisada el 19-09-2026. Motor `v1`, parámetros identificados por
hash y vinculados a la versión del scoring. La
[guía general](../product/modules-guide.md) presenta los conceptos sin requisitos técnicos.

## 0. Qué hace

Aplica una política de crédito a la información del scoring y, cuando está
conectada, a la previsión. Responde si hay una oferta, qué límite mantiene,
qué plazos admite, qué precio calcula y cómo cambia respecto al mes anterior.

Son decisiones del sistema, no operaciones efectivamente contratadas por la
empresa. Un límite simulado no prueba uso de financiación ni una conducta de
riesgo de su dirección.

## 1. Entrada

[input.ts](../../lib/features/decision/input.ts) transforma `ScoreRow` en
`DecisionInput`. `score` es aquí el nombre interno de `scoreSolo`, y `estado`
el de `estadoSolo`. Estos alias internos siguen existiendo; no son dos notas
persistidas por scoring.

Además entran los pilares A/B/C, confianza, tendencias, tipos de alerta, D1/D5,
`ajusteHolding`, `scoreGrupo`, estado de grupo, señales de aval/pignoración y
revisión EWI. La única escala monetaria es `tamano = cobrosOpMedia3m`.
No se vuelve a calcular C4, B2 ni una capacidad de cuota estresada.

`PrevisionInput` aporta Solo/Grupo con conexión independiente. Los objetivos
desconectados se neutralizan: nota prevista nula y banda actual. Aunque el
forecast siga publicado en su contrato propio, no interviene en esta decisión.

## 2. Parámetros principales

[params.ts](../../lib/features/decision/params.ts) es la referencia numérica.

| Concepto                                           | Valor                                       |
| -------------------------------------------------- | ------------------------------------------- |
| Confianza mínima                                   | 0,4                                         |
| Nota mínima                                        | 45, con la excepción de aval descrita abajo |
| Pilares mínimos A/B/C                              | 50 / 60 / 50                                |
| Bandas A/B/C/D                                     | ≥75 / ≥60 / ≥45 / <45                       |
| Factores de límite por banda                       | 1 / 0,7 / 0,4 / 0                           |
| Confianza que deja de recortar límite              | 0,6                                         |
| Pilar A que deja de recortar límite                | 70                                          |
| Cambio que permite estudiar ampliación / reducción | L >115 % / L <85 % del vigente anterior     |
| Confirmación de reducción ordinaria / reapertura   | 2 meses / 2 meses                           |
| Cambio mensual ordinario máximo del vigente        | ±25 %, con redondeo y excepciones           |
| Tope por revisión EWI / pignoración                | 60 / 90 días                                |
| Caída prevista que bloquea ampliación              | 5 puntos o más, Solo conectado              |

## 3. Elegibilidad: los controles de acceso

Una «puerta» es una condición que debe pasar la empresa. Se evalúan todas y
se publica la primera fallida como motivo principal.

| Puerta     | Condición de paso                            |
| ---------- | -------------------------------------------- |
| Historia   | Confianza ≥0,4                               |
| Estado     | Nota autónoma ≥45                            |
| Fiabilidad | Pilar B ≥60 y sin `impago_obligaciones`      |
| Caja       | Pilar A ≥50 y sin `deficit_persistente`      |
| Clientes   | Pilar C ≥50 y sin `vencido_alto`             |
| Grupo      | Sin cross-default activo del estado anterior |

La puerta llamada `estado` compara una nota, no la etiqueta `estadoSolo`.
No es correcto resumir el código como «toda empresa etiquetada riesgo queda
siempre rechazada»: existe una ruta de aval para debilidad de nota/caja.

Con una línea viva, un fallo exclusivamente de confianza o de pilar A puede
esperar un segundo mes antes del cierre. En el primero se publica
`cierrePendiente: true`, `elegible: false`, límite recomendado cero y vigente
anterior. Un fallo de otra puerta, incluido déficit persistente, cierra sin
esa espera. Para una apertura nueva no hay línea que conservar.

### Oferta condicionada a aval

La ruta puede activarse si se requiere aval según scoring, o si Solo <45 y
Grupo ≥45 con ajuste positivo. Exige nota de grupo ≥45 y, si su forecast está
conectado, previsión de grupo ≥45.

Solo permite superar la puerta de nota y el umbral del pilar A. No permite
superar confianza insuficiente, incumplimiento de fiabilidad, vencidos/pilar C,
déficit persistente o cross-default. El factor A autónomo sigue recortando el
importe. Se publica `condicionAvalMatriz` y la etiqueta contractual.

Ejemplo conceptual: Solo 42 y Grupo 52 con apoyo +10 puede abrir esa ruta si
pasa los demás controles. Que el apoyo sea menor de +15 no la excluye.
La empresa garante y la validez jurídica del aval deben concretarse fuera del
cálculo: el dataset no identifica una matriz legal ni un aval firmado.

## 4. Límite recomendado y bandas

La banda utilizada es la de Grupo en la ruta condicionada. Si Grupo tiene una
banda peor que Solo, se conserva esa peor banda. En los demás casos se usa Solo.
El deterioro estructural rebaja un escalón la banda efectiva para límite/precio;
el contagio de una hermana relevante puede añadir otro escalón.

```text
limiteOp = 0,8 × tamano × 3
factorA = min(1, max(0, subscore A) / 70)
L bruto = limiteOp × factor de banda efectiva × min(1, confianza / 0,6) × factorA
L = L bruto redondeado hacia abajo a miles de euros
```

`limiteOp` es una escala inicial, no una oferta. `L` es el límite recomendado
por la política; `LVigente` es el que se mantiene tras continuidad mensual y
techo de grupo. Pueden ser distintos. Ninguno es una disposición real.

Ejemplo aritmético: cobros medios 100.000 €, banda B, confianza 0,6 y pilar A
70 producen `240.000 × 0,7 = 168.000 €` antes de otros efectos del motor.

## 5. Plazo máximo

La tabla usa la peor banda entre la actual seleccionada y la previsión utilizada:

| Banda | Sin deterioro | Deterioro temporal | Deterioro estructural |
| ----- | ------------: | -----------------: | --------------------: |
| A     |      180 días |                120 |                    60 |
| B     |      120 días |                 90 |                    30 |
| C     |       60 días |                 30 |                     0 |
| D     |        0 días |                  0 |                     0 |

Después se toma el mínimo con los topes aplicables: revisión EWI 60 días y
pignoración 90. Afectan a aperturas y líneas vivas. Un cierre tiene plazo cero.
Tener ambas señales deja como máximo 60 días, o menos si la tabla ya lo exige.

## 6. Precio y coste

El campo `tae` se almacena como fracción: `0.07` representa 7 %. Es el precio
anual calculado por esta política, no un precio obtenido de defaults observados.

| Componente         | Regla                                                                         |
| ------------------ | ----------------------------------------------------------------------------- |
| Base               | Banda efectiva A 5 %, B 7 %, C 10 %; D sin oferta                             |
| Prima de plazo     | +0,5 puntos porcentuales por cada tramo de 30 días después de los primeros 30 |
| Prima de confianza | +1 punto porcentual si confianza <0,7                                         |
| Tendencia          | −0,5 puntos si mejora; +1 si deterioro                                        |
| Previsión          | +0,5 puntos si la banda prevista usada es peor que la actual seleccionada     |

Los componentes se suman y la tasa se redondea a cuatro decimales. El coste
simulado es `importe × tasa anual × días / 360`, redondeado a céntimos. No
incluye una simulación completa de comisiones o calendario contractual.

## 7. Menú de opciones

Se consideran plazos de 30, 60, 90, 120 y 180 días hasta `TMax`. El importe
máximo de cada opción es:

```text
cantidadMax = redondear abajo a miles(LVigente × min(1, plazo / 180))
```

Se eliminan opciones de importe cero o sin precio. El plazo natural sugerido
es 60 días; no se calcula con C3. Para el ejemplo de vigente 168.000 €, 60 días
permiten 56.000 € y 120 días 112.000 €, si el plazo máximo los admite.

Pasar las seis puertas no basta para publicar elegibilidad: también debe haber
plazo positivo y un menú con al menos una opción.

## 8. Acción y memoria mensual

| Acción     | Sentido                                                                             |
| ---------- | ----------------------------------------------------------------------------------- |
| `abrir`    | Iniciar una línea positiva cuando pasa los controles y no está esperando reapertura |
| `ampliar`  | Aumentar el límite vigente bajo las condiciones de política                         |
| `mantener` | Conservar el vigente; también puede significar esperar en cero                      |
| `reducir`  | Disminuir exposición por política, tendencia, previsión o grupo                     |
| `cerrar`   | Dejar la línea en cero                                                              |

La ampliación ordinaria exige L >1,15×vigente previo, dirección no deterioro,
banda prevista no peor y ausencia de pignoración y de caída Solo conectada ≥5.
EWI también transforma una ampliación propuesta en mantener.

Un L <0,85×vigente requiere dos meses para reducción ordinaria. Las variaciones
ordinarias se acotan al entorno ±25 %, respetando escalones de miles. El
empeoramiento estructural y el contagio de grupo permiten recortes inmediatos
sin esa amortiguación. Una banda prevista peor dos meses permite reducción preventiva.

Un forecast Solo conectado <45 bloquea nuevas aperturas, salvo la ruta de aval
válida. Una previsión en sombra se neutraliza. Las banderas EWI/pignoración por
sí solas no prohíben toda apertura, aunque recortan plazo.

Tras un cierre propio se exige continuidad de elegibilidad para reabrir. Si una
empresa elegible cierra exclusivamente porque el techo de grupo la deja a cero,
se conserva acción cerrar y vigente cero, pero `cerradoDesde = null`: puede
reabrir al mes siguiente si las condiciones lo permiten.

## 9. Techo y contagio del grupo

El techo aplica la fórmula del límite al grupo, sumando tamaños y ponderando
nota autónoma, confianza y pilar A por tamaño. Con tamaño total cero se usan
medias simples. Si la suma de vigentes supera ese techo, se prorratea y se
redondea hacia abajo. No se utiliza `scoreGrupo` como una nota consolidada.

Un cierre nuevo y propio de una empresa con D1 ≥0,30 puede activar contagio
(_cross-default_) en hermanas. No se vuelve a contar como nuevo un cierre ya
existente ni un cierre causado exclusivamente por la puerta grupo. El motor
recalcula límites del mes y conserva la señal para los siguientes, con reglas
de recuperación para evitar un bloqueo circular permanente.

## 10. Salida

[DecisionRow](../../lib/features/decision/types.ts) y su
[Zod](../../lib/features/decision/contracts.ts) incluyen elegibilidad, motivos,
puertas fallidas, bandas, escala monetaria, factor A, L, vigente, plazo, menú,
acción, previsiones utilizadas y estado de memoria.

La fila también publica la condición de aval y revisión interna EWI. La señal
de pignoración se conserva en scoring y se refleja en plazo y motivo de acción.

## 11. Motivos comprensibles

La explicación debe distinguir «no pasa un control» de «pasa los controles,
pero el importe o plazo no permite una oferta». Las etiquetas contractuales se
añaden en orden: aval de matriz y después pignoración/cortafuegos.

Los nombres internos `revisionStage2Candidata` y «pignoración» no certifican una
clasificación regulatoria ni una garantía constituida. Para el cliente:
«revisión interna de riesgo» y «revisar la protección de caja o garantías».

## 12. Ejecución

`decideGroup` procesa empresas por grupo y mes, desde la primera fila hasta la
última. El resultado depende de ese historial, no solo del score del mes final.
`scoring:decide` escribe filas y parámetros de decisión; `pipeline:eval` lo
incluye después de forecast. Rutas y uso en el [README](../../README.md).

Si faltan forecast o sus parámetros, el script admite trabajar desconectado
con aviso. Si los artefactos presentes son corruptos o incompatibles, se rechazan.

## 13. Pruebas

Los [tests del módulo](../../lib/features/decision/) cubren puertas, límite, plazo,
precio, menú, acciones, contagio, aval y señales preventivas. Los ejemplos de
esta documentación son cálculos pedagógicos; no sustituyen la ejecución de un
historial completo con `decideGroup`.

## 14. Métricas

[metrics.ts](../../lib/features/decision/metrics.ts) calcula exposición evitada,
ingresos simulados, cambios de límite, cierres falsos y antelación. El uso
simulado es el 60 % del vigente. Son escenarios de política, no ingresos reales
ni evidencia de conducta del prestatario. Los totales históricos de límites
suman exposiciones mensuales: no representan exposición simultánea.

## 15. Alcance

La política está parametrizada para el producto actual y sus datos. La postura
bancaria de aversión al riesgo sigue siendo una propuesta documental; no es una
puerta ni un resultado producido por este motor. Véanse el
[playbook](./treasury-playbook.md) y la [auditoría documental](../product/documentation-audit.md).
