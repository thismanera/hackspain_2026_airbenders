# Playbook de tesorería: aprender de los cambios observados

Revisado contra el código el 19-09-2026. Un **playbook** es una guía de actuación:
qué conviene mantener, qué presión merece atención y qué revisar primero.
El análisis RCA compara aportaciones desde un giro confirmado del score.
Aunque RCA suele traducirse como «análisis de causa raíz», aquí identifica
cambios observados; no demuestra las causas económicas ni decisiones de gestión.

## 1. Qué recibe y cuándo puede explicar algo

La función pública es
[`analizarReaccionPostInflexion(companyRows, targetMonth?)`](../../lib/features/rca/engine.ts).
Recibe el histórico de una empresa. Ordena una copia y, si no se indica mes,
usa el último disponible.

Devuelve `null` cuando no existe el mes solicitado, no hay inflexión autónoma
confirmada, falta su origen o no hay al menos dos meses posteriores consecutivos.
Todo el período origen–destino debe tener continuidad mensual.

Rechaza empresas mezcladas, meses duplicados o inválidos, y versiones distintas
dentro del período analizado. No utiliza los valores posteriores al destino
para calcular hallazgos; sí comprueba la empresa, duplicados y formato de mes
de toda la entrada. Valida el resultado con Zod.

## 2. Cómo selecciona la evidencia

Las 14 variables A–C tienen plantilla. Cada una debe tener valor bruto, subnota
y aportación finitos, aplicabilidad activa y peso efectivo constante durante
todo el período. Si falla esa comparabilidad se excluye esa variable, no se
inventa una interpretación.

El cambio de aportación es actual menos origen. Se considera material si cumple
al menos una de estas condiciones, antes de redondear:

```text
cambio absoluto de aportación ≥ max(0,30; 1,5 × pesoEfectivo / 0,10)
cambio absoluto de subnota ≥ 25 puntos
```

Ejemplos: con peso 10 % el umbral de aportación es 1,5 puntos; con 7 %, 1,05;
con 1,5 %, 0,30. La segunda condición permite detectar un cambio fuerte en una
variable pequeña. El signo de la aportación decide si el hallazgo es favorable
o desfavorable, aunque la regla que lo hizo material fuera la subnota.

El código admite cambios de confianza; no exige confianza constante ni un mínimo
adicional. Por ello una variación de aportación puede incluir ese efecto. En
la explicación no debe atribuirse automáticamente todo el cambio a una mejora operativa.

Los hallazgos se ordenan por impacto absoluto sin redondear. En empate se usa
A1–A5, B1–B3 y C1–C6. Los valores publicados usan hasta tres decimales, con una
excepción para no convertir un impacto no nulo diminuto en cero.

## 3. Qué quiere decir el diagnóstico

| Valor interno          | Forma comprensible de explicarlo                                 | Regla                                               |
| ---------------------- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `reaccion_resiliente`  | Los cambios favorables seleccionados compensan los desfavorables | Saldo de impactos positivo tras un pico bajista     |
| `reaccion_destructiva` | Las presiones seleccionadas pesan más que las mejoras            | Saldo negativo tras un pico bajista                 |
| `reaccion_pasiva`      | No hay un saldo material favorable o desfavorable                | Empate o ausencia de hallazgos tras un pico bajista |
| `en_recuperacion`      | La trayectoria muestra un rebote confirmado                      | La inflexión autónoma es un suelo alcista           |

Se comparan puntos, no cantidad de aciertos y errores. Dos mejoras de 0,5 no
compensan una pérdida de 3. El holding queda fuera del diagnóstico autónomo.

Las palabras internas «acierto» y «error» clasifican cambios favorables y
desfavorables. No prueban que la dirección tomara una buena o mala decisión.
Para un cliente es preferible hablar de «mejora observada» y «presión a revisar».

## 4. Recomendaciones e instrumentos posibles

| Variables | Canal      | Qué revisar                                                 | `productoSugerido`       |
| --------- | ---------- | ----------------------------------------------------------- | ------------------------ |
| A1/A2     | Operativo  | Gastos, previsión de caja y calendario de cobros/pagos      | `ninguno`                |
| A3/A4/A5  | Financiero | Cuotas, vencimientos y uso de línea                         | `reestructuracion_deuda` |
| B1/B2     | Financiero | Regularización y reserva para obligaciones recurrentes      | `ninguno`                |
| B3        | Financiero | Acuerdos de pago con proveedores                            | `embat_confirming`       |
| C1/C2     | Comercial  | Dependencia de clientes/proveedores y alternativas          | `ninguno`                |
| C3/C4     | Comercial  | Cobros, vencimientos, reclamación y condiciones comerciales | `embat_factoring`        |
| C5        | Comercial  | Variabilidad de cobros y reserva para meses irregulares     | `ninguno`                |
| C6        | Comercial  | Devoluciones y condiciones de pago de clientes afectados    | `gestion_cobros`         |
| Holding   | Holding    | Barridos de caja, compromisos y saldo operativo mínimo      | `cortafuegos_holding`    |

**La oportunidad pertenece a la empresa.** El factoring permite anticipar
facturas; el confirming puede facilitar la gestión o financiación de pagos a
proveedores. Son instrumentos que pueden estudiarse, sujetos a elegibilidad.
El código de producto no significa que esa financiación esté concedida ni que
una factura vencida sea automáticamente financiable.

`mantener` recoge lecciones de mejoras y `evitar`, de presiones.
`accionesInmediatas` contiene las recomendaciones de errores por impacto y la
del mayor acierto, eliminando duplicados. Las recomendaciones de holding
permanecen exclusivamente en `contextoHolding`.

## 5. Contexto de holding

Se compara `aportacionGrupo` actual con la del origen. Un cambio de al menos
+2 o de como máximo −2 puntos añade una observación del mismo formato que los
hallazgos, con canal holding y producto `cortafuegos_holding`. Los cambios menores
conservan su delta, pero `observacion` es nula.

Una caída del apoyo puede empeorar la nota de grupo aunque la empresa mejore
por sí misma. Esto explica por qué no se mezcla ese contexto con los aciertos
y errores autónomos. Tampoco demuestra qué transferencias causaron el ajuste.

## 6. Los dos escenarios recuperables

```text
scoreRecuperableEstimado = min(100; scoreSolo actual + pérdidas autónomas seleccionadas)
scoreRecuperableGrupoEstimado = min(100; escenario anterior + max(0; −aportacionGrupo actual))
```

Las pérdidas seleccionadas son los valores absolutos de los errores RCA, usando
sus impactos sin redondear antes de publicar. El cálculo conserva la precisión
del motor, hasta tres decimales. El segundo campo usa el drenaje **actual**, no
el cambio del holding desde la inflexión.

Ejemplo: nota autónoma 62, errores por 11,1 puntos y aportación holding actual
−16. Los escenarios son 73,1 y 89,1. La segunda cifra añade aritméticamente la
eliminación de esa presión a la primera. No es una recomposición de la fórmula
del holding ni una predicción de la futura nota de grupo, pese al nombre del campo.

Estos escenarios no fijan una fecha, no garantizan financiación y no entran en
decisión. Los hallazgos seleccionados tampoco explican necesariamente todo el
cambio de score: quedan fuera cambios pequeños o no comparables.

## 7. Contratos y uso técnico

[types.ts](../../lib/features/rca/types.ts) define `AnalisisPostInflexion` y
`DecisionPostInflexion`; [contracts.ts](../../lib/features/rca/contracts.ts) valida
meses, rangos, productos, signos y coherencia del resultado.

El resultado contiene origen/destino, notas, diagnóstico, detonante inicial,
aciertos, errores, playbook, escenarios recuperables y contexto de grupo.
No escribe en base de datos. La exportación puede usar sus errores para
seleccionar un instrumento sugerido; no lo convierte en una decisión crediticia.

Las [pruebas](../../lib/features/rca/engine.test.ts) cubren umbrales, continuidad,
pesos, aplicabilidad, signos, productos, escenarios, pureza y determinismo.

## 8. Lectura bancaria de aversión al riesgo: propuesta pendiente

Se planteó un segundo playbook para el banco con las etiquetas «prudente»,
«equilibrada», «tolerante» y «no evaluable». **Ese clasificador no está
implementado:** no forma parte del resultado RCA ni existe un contrato Zod
operativo que lo produzca en este módulo.

Hay además una distinción de datos necesaria: `DecisionRow` registra lo que
recomienda el motor. No registra si la empresa solicitó más crédito, aceptó la
oferta, amortizó voluntariamente o rechazó una recomendación. Utilizar solo
esas acciones para juzgar su aversión al riesgo confundiría la política bancaria
con la conducta de la empresa.

Para desarrollar esa lectura harían falta eventos de conducta observada,
criterios para comparar episodios y validación de etiquetas. Hasta entonces se
pueden mostrar al banco las señales y su evolución, sin asignar una personalidad
financiera. El [diseño anterior](../history/2026-09-19-decision-engine.md) y la
[demo histórica](../history/2026-09-19-demo-comparativa-empresas.md) conservan el
contexto de la propuesta; no deben presentarse como funcionalidades disponibles.
