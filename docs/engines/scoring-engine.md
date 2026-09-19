# Motor de scoring: cómo se calcula la salud de una empresa

Especificación de la implementación revisada el 19-09-2026. Contrato
`scoreSolo-holding-v7`. Para una primera lectura, consultar la
[guía general](../product/modules-guide.md) y la [guía de métricas](./scoring-metrics.md).

## 0. Qué hace

Para cada empresa y mes calcula una nota autónoma, la confianza en sus datos,
un diagnóstico y señales de evolución. Después calcula cómo cambia la nota al
considerar las otras empresas del grupo. No fija límites, plazos ni precios.

`scoreSolo` resume A–C. `scoreGrupo` es la nota de esa empresa con el ajuste del
holding; no es el consolidado. Ambas están entre 0 y 100 y ninguna es una
probabilidad de impago. La decisión de financiación corresponde al
[motor de decisión](./decision-engine.md).

## 1. Entradas

[ingest.ts](../../lib/features/scoring/ingest.ts) carga empresas, productos bancarios,
productos de deuda, transacciones y facturas. El cuadro de deuda es opcional.
El CSV de categorías reclasificadas también es opcional; si falta se utilizan
las categorías disponibles del dataset.

Solo se consideran transacciones `booked` dentro del calendario de análisis.
Los importes se convierten a euros. Facturas emitidas después del cierre no
entran en ese mes. Los saldos finales de cuentas y productos no se usan como
si fueran una historia mensual.

## 2. Parámetros y versiones

[params.ts](../../lib/features/scoring/params.ts) contiene pesos, escalas y umbrales.
[types.ts](../../lib/features/scoring/types.ts) define `Parameters`, y
[contracts.ts](../../lib/features/scoring/contracts.ts) valida su estructura.

| Parámetro                                       | Valor vigente                                   |
| ----------------------------------------------- | ----------------------------------------------- |
| Calendario                                      | Septiembre de 2024 a agosto de 2026, 24 cierres |
| Ventanas                                        | 3, 6 y 12 meses según la medida                 |
| Pesos A/B/C                                     | 45 % / 30 % / 25 %                              |
| Confianza para `sin_datos` / para `sana`        | Inferior a 0,3 / al menos 0,5                   |
| Nota de riesgo / referencia de salud            | Inferior a 45 / al menos 70                     |
| Dirección trimestral                            | ±6 puntos                                       |
| Alerta por caída trimestral                     | −8 puntos o menos                               |
| Ajuste holding                                  | Entre −30 y +20                                 |
| Factor mínimo de relación de grupo              | 0,35                                            |
| Penalización por disposiciones sin amortización | 20 puntos de subnota A5                         |

`paramsHash` identifica las reglas; `version` identifica los parámetros ajustados
con su procedencia. El contrato, el hash y la versión no son intercambiables.
Una diferencia de fingerprint del dataset produce un aviso al puntuar con
parámetros congelados; una incompatibilidad de contrato o hash se rechaza.

## 3. Preparación de datos

### Divisas

[fx.ts](../../lib/features/scoring/fx.ts) convierte primero a moneda de la empresa
mediante `amount / exchange_rate` y después a euros. Las tasas de respaldo se
estiman a partir de facturas y se completan con una tabla fija. Si no se puede
convertir un importe, se registra esa falta de cobertura.

Las tasas se construyen durante la ingesta. Su origen debe distinguirse del
corte temporal usado para ajustar las escalas. No se debe afirmar que toda la
preparación se entrenó exclusivamente antes del corte; véase la
[auditoría](../product/documentation-audit.md).

### Traspasos y categorías

[mirrors.ts](../../lib/features/scoring/mirrors.ts) busca movimientos con la misma
fecha, importe opuesto al céntimo y empresas compatibles. Prioriza parejas de
la misma empresa y después del mismo grupo, con orden determinista y un solo
uso de cada movimiento. El emparejamiento se realiza en cuentas operativas;
no elimina las disposiciones propias de una línea de crédito.

[flows.ts](../../lib/features/scoring/flows.ts) clasifica cobros, pagos, servicio de
deuda, devoluciones, disposiciones y amortizaciones. Los traspasos emparejados
salen de la operación; los intragrupo alimentan sus propios campos.

Una disposición `debt_drawdown` en cuenta operativa solo se reconoce como tal
si no hay producto `lineofcredit`, para evitar contar también su espejo en la
línea. Los movimientos neutrales, desconocidos o excluidos afectan a cobertura.

### Facturas

Solo se usan documentos `invoice` con estados admitidos por la ingesta. El
signo positivo identifica cliente; el negativo, proveedor. Un pago requiere
`status = paid` y fecha de pago anterior o igual al cierre. Una fecha rellenada
sin estado pagado no acredita un cobro. Los retrasos mayores de 365 días en
valor absoluto se excluyen de las medianas.

C4 reconstruye vencidos con estos datos; el estado es una foto final y limita
la fidelidad histórica. `C4Estimado` señala los meses anteriores a agosto de 2026.

## 4. Flujos y meses observados

Los flujos distinguen cobros/pagos operativos, servicio de deuda, crédito,
obligaciones recurrentes, transferencias de grupo y calidad de clasificación.
Los importes de cada clase se almacenan positivos; el signo ya determinó la clase.

Un mes con movimiento no es necesariamente un mes observado: debe existir
actividad reconocida por el cálculo. Las ventanas son de calendario. Las medias
monetarias dividen por los meses de calendario transcurridos de la ventana,
no solo por meses con dato. La confianza sí utiliza meses observados.

El motor emite una fila para cada empresa y cada mes del calendario, incluso
si no tiene transacciones. La ausencia de información se conserva como tal y
no elimina empresas de la salida.

## 5. Las variables

La [guía de métricas](./scoring-metrics.md) contiene las 14 fórmulas, unidades,
ventanas, pesos y reglas de confianza. La división es:

- A1–A5: margen, frecuencia de déficit, cobertura de deuda, carga financiera y dependencia de línea.
- B1–B3: cumplimiento de obligaciones, rachas sin pago y retraso a proveedores.
- C1–C6: concentración de contrapartes, retraso de cobro, vencidos, volatilidad y devoluciones.

B1/B2 solo usan categorías con pagos positivos en tres meses de la ventana de
seis. B2 cuenta pagos ausentes, no cualquier desviación respecto al importe
esperado. C5 requiere al menos seis meses observados en los últimos doce.

`hardcoreRevolving` exige línea, al menos tres meses observados en seis, una
disposición positiva en todos y amortización cero en todos. Su penalización
solo afecta a A5 activa. Es una señal de movimientos, no un saldo reconstruido.

## 6. Subnotas, agregación y estados

A1/A3/A4/A5/B1/C4/C6 usan anclajes económicos; B2, una escala propia de rachas;
las demás variables usan p5/p95 congelados. Una variable activa ausente recibe
subnota 50. Una variable no aplicable recibe subnota nula y peso cero.

```text
nota efectiva = 50 + conf × (subnota − 50)
aportación = peso efectivo × nota efectiva
scoreSolo = suma de aportaciones A–C
subscore del bloque = suma de sus aportaciones / peso activo del bloque
```

| Régimen de A        |   A1 |   A2 |   A3 |   A4 |  A5 |
| ------------------- | ---: | ---: | ---: | ---: | --: |
| Sin cuotas ni línea | 25 % | 20 % |  0 % |  0 % | 0 % |
| Cuotas sin línea    | 12 % | 12 % | 11 % | 10 % | 0 % |
| Con línea           | 10 % | 10 % | 10 % |  8 % | 7 % |

B pesa 12/12/6 %; C pesa 1,5/1,5/4/8/3/7 %. La confianza de cada bloque sigue
sus pesos activos, salvo A sin deuda, que usa la media simple de A1/A2.
La confianza global pondera bloques con 45/30/25 %.

`estadoSolo` se resuelve en este orden:

| Estado      | Condición                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------- |
| `sin_datos` | Confianza < 0,3                                                                                         |
| `riesgo`    | Score < 45, racha B2 ≥ 2 o C4 observado > 0,40                                                          |
| `sana`      | Score ≥ 70, confianza ≥ 0,5, A1 observado ≥ 0,10, racha B2 = 0, B2 ausente o cero y C4 ausente o ≤ 0,20 |
| `vigilar`   | Resto                                                                                                   |

Estas etiquetas no son las bandas A/B/C/D de decisión. La política de crédito
aplica sus propios controles y contempla una excepción condicionada a aval.

## 7. Ajuste y perfil del grupo

Primero se calculan todas las notas autónomas del mes. Después se seleccionan
hermanas con cobros positivos en doce meses o confianza ≥ 0,3. D1–D5 se definen
en la [guía de métricas](./scoring-metrics.md#8-holding-la-empresa-dentro-de-su-grupo).

La capacidad neta de cada miembro es:

```text
Ci = cobrosOpMedia6m − pagosOpMedia6m − servicioDeudaMedia6m
S = suma de Ci positivos de miembros con confianza ≥ 0,3
D = suma del valor absoluto de Ci negativos de esos miembros
factorD5 = clamp(max(0,35; D5 / 0,15), 0, 1)
```

Si la empresa genera excedente y su nota supera D2:

```text
ajuste base = −min(30; min(1, D/S) × (scoreSolo − D2) × 0,8 × factorD5)
```

Si tiene déficit y D2 supera su nota:

```text
ajuste base = min(20; min(1, S/D) × (D2 − scoreSolo) × 0,7 × factorD5)
```

En el resto, ajuste cero; también sin hermanas, D2, excedente o déficit
compatibles. S y D representan recursos monetarios: no se exige que los puntos
sumen cero entre empresas. La función actual vuelve a calcular esos totales
al evaluar cada miembro; no es una asignación de transferencias ni de garantías.

`scoreGrupo` se limita a 0–100. `ajusteHolding` y `aportacionGrupo` publican la
aportación efectiva tras ese límite, con precisión de hasta doce decimales.

Los perfiles describen flujos:

- `filial_subvencionada`: caja operativa media negativa o A1 negativo, D4 > 0,30,
  B2 observado sin racha y D2 ≥ 60.
- `drenaje_tesoreria`: Ci positivo y D4 < −0,40.
- `estandar`: resto; siempre que no haya hermanas evaluables.

Los perfiles no añaden otra penalización. No explican motivos fiscales ni
identifican una matriz legal. `estadoGrupo` conserva `sin_datos`; si el autónomo
es riesgo, como máximo pasa a vigilar con ajuste positivo y perfil subvencionado.
Para los demás casos se aplican las condiciones de estado con la nota ajustada.

## 8. Evolución e inflexiones

Las tendencias de 3/6/12 meses usan `scoreSolo` y referencias exactas. La
dirección es mejora desde +6 puntos trimestrales y deterioro desde −6. Si las
tendencias 3m y 6m tienen signos opuestos, se marca estable.

`naturaleza` es estructural si la dirección no estable persiste dos meses y
al menos dos variables mueven un punto de aportación a su favor, incluyendo
alguna A1–A3. En el resto es temporal; dirección estable produce `sin_cambio`.

`patronTrayectoria` es otra clasificación, con prioridad:

1. Caída estructural: deterioro dos meses y pérdida trimestral ≥1 punto de aportación en al menos dos variables A activas.
2. Inestabilidad crónica: C5 > p80 congelado y al menos tres alternancias de caja en seis meses consecutivos observados, sin ceros ni ausencias.
3. Bache puntual: caída mensual ≤−5, score previo ≥65, racha de déficit ≤1 y racha B2 cero.
4. Mejora: dirección mejora.
5. Deterioro temporal: dirección deterioro que no entró antes.
6. Estable.

`diagnosticoMejora` exige además referencia trimestral, aumento ≥6, ausencia de
caída en las comparaciones recientes usadas por el motor y aportación trimestral
positiva de A1, A2, B1, B2 o C4. Elige el mayor aumento con desempate canónico.
No es equivalente a `patronTrayectoria = mejora`.

La inflexión se calcula por separado en Solo/Grupo. Busca el extremo anterior
en los seis meses previos, el más reciente si hay empate, y exige dos meses
posteriores consecutivos y distancia actual ≥6 puntos. Admite meses planos y
oscilaciones que no sobrepasen el extremo adversamente en más de un punto.

La memoria conserva el origen anterior si sigue presente, el período es continuo,
el régimen se cumple y la distancia actual sigue siendo ≥6. Un giro contrario
confirmado lo sustituye. La memoria puede durar más de seis meses. El detonante
es la aportación que más se mueve en el sentido del giro en el primer mes tras
el extremo, no el factor del mes actual. Solo el análisis de grupo incluye holding.

## 9. Alertas y otras señales

| Alerta                       | Regla                                                  |
| ---------------------------- | ------------------------------------------------------ |
| `deterioro` / `recuperacion` | Dos meses consecutivos en la dirección correspondiente |
| `deterioro_estructural`      | Dirección deterioro y naturaleza estructural           |
| `deficit_persistente`        | Tres meses seguidos de déficit operativo               |
| `impago_obligaciones`        | Racha B2 ≥2                                            |
| `vencido_alto`               | C4 >0,40                                               |
| `contagio_grupo`             | Ajuste ≤−10                                            |
| `datos_insuficientes`        | Confianza <0,3                                         |
| `alerta_temprana_deterioro`  | Cualquiera de las reglas tempranas siguientes          |

La alerta temprana se activa con caída mensual ≤−4, caída contra exactamente
3 meses antes ≤−8, primer déficit tras cuatro márgenes mensuales positivos,
aumento mensual de C4 >0,15, o C6 positivo y nuevo/creciente. C6 igual o
menor no la reactiva por esa condición. `desdeMes` guarda el inicio de la racha
de la señal que sigue activa.

El canario analiza una caída de subnota estrictamente mayor de 30 en B2/C6;
el primer impago B2 desde 100 hasta 70 no basta. Se selecciona B2 primero si
ambas lo cumplen.

La revisión interna EWI se propone al cumplir dos de estas cuatro señales:
racha B2 ≥1; C4 >0,25 o C6 >0; A3 aplicable observado <1,3; racha de déficit ≥2.
Es una regla de revisión del producto, no una clasificación regulatoria.

El ajuste ≥15 activa `requiereAvalMatriz`; ≤−15, `alertaPignoracionCaja`.
`gapCicloDias` resta los retrasos C3−B3. Desde más de 30 días emite una
recomendación de revisar cobros. No es el ciclo de conversión de caja completo.

## 10. Contrato de salida

[ScoreRow](../../lib/features/scoring/types.ts) y su
[esquema Zod](../../lib/features/scoring/contracts.ts) son la referencia de campos.

| Familia          | Campos principales                                                             |
| ---------------- | ------------------------------------------------------------------------------ |
| Identificación   | `company`, `month`, `groupId`, `versionParametros`                             |
| Salud            | `scoreSolo`, `confianza`, `subscores`, `confs`, `estadoSolo`                   |
| Holding          | `scoreGrupo`, `estadoGrupo`, `ajusteHolding`, `aportacionGrupo`, D1–D5, perfil |
| Explicación      | `variables`, `deltaContrib`, factores, inflexiones, mejora y canario           |
| Evolución        | Tendencias, dirección, naturaleza, trayectoria, rachas, señales y alertas      |
| Datos auxiliares | Medias monetarias, cobertura, EWI, gap y señales contractuales                 |

La suma A–C explica `scoreSolo`; añadir la aportación holding explica `scoreGrupo`,
salvo tolerancia numérica. Para descomponer cambios hay que restar las
aportaciones entre meses. **`deltaGrupo` tiene una discrepancia vigente:** se
asigna desde el factor ganador, que puede ser A–C. No debe leerse como delta
exclusivo de holding; véase la [auditoría](../product/documentation-audit.md).

Zod valida forma, tipos, rangos y longitud de contribuciones, pero no demuestra
por sí solo todas las identidades contables. Los tests verifican propiedades
adicionales. `score` existe en la entrada interna de decisión como alias de
`scoreSolo`; no es una segunda nota autónoma de `ScoreRow`.

## 11. Ajuste de escalas

[fit.ts](../../lib/features/scoring/fit.ts) reparte grupos 70/30 de forma determinista
con SHA-256 y semilla textual `42`. Los percentiles usan muestras del 70 % de
ajuste, hasta febrero de 2026 y con confianza de variable ≥0,5. Los anclajes
no se estiman por percentiles. C5 almacena además su p80 real.

Los parámetros congelados se encuentran en
[`artifacts/inference/scoreSolo-holding-v7/`](../../artifacts/inference/scoreSolo-holding-v7/).
La ejecución habitual no los vuelve a ajustar.

## 12. Pruebas

Los tests de `aggregate`, `variables`, `group`, `evolution` y `engine` cubren
pesos, falta de datos, estados, límites del holding, evolución y explicaciones.
Los de ingesta, divisas, espejos y flujos cubren la preparación. Consultar los
archivos `*.test.ts` del [módulo](../../lib/features/scoring/) para los casos ejecutables.

## 13. Validación de resultados

[backtest.ts](../../lib/features/scoring/backtest.ts) compara por separado Solo y
Grupo, reconstruyendo dirección y alertas de cada objetivo. Los eventos siguen
siendo episodios de caja observada. El deterioro requiere tres déficits seguidos
tras un período observado de seis meses con como máximo uno; la recuperación
requiere tres meses sin déficit después de una fase de déficit.

Se publican asociación con margen futuro, AUC/PR-AUC de estrés futuro, deciles,
recall, falsas alarmas y antelación. El bootstrap de AUC usa 200 remuestreos de
pares, no remuestreo por holding. Los seis meses finales se censuran para no
contar como falsas alarmas señales sin seguimiento suficiente.

El script reserva grupos y evalúa septiembre de 2025 a agosto de 2026. El tramo
hasta febrero de 2026 coincide en tiempo con el ajuste; no es todo un corte
futuro independiente. Septiembre de 2026 queda fuera por estar truncado.
Las métricas anteriores de otros modelos no son resultados de esta versión.

## 14. Ejecución

Para uso habitual, `corepack pnpm pipeline:eval` ejecuta ingesta, scoring,
forecast, decisión y exportación con parámetros congelados. No ejecuta backtests
ni importa a Prisma. Para recalibrar o validar por etapas, seguir el
[README](../../README.md), manteniendo el mismo `SCORING_OUT` y rutas de parámetros.

Los resultados se organizan en `SCORING_OUT/runs/<version>/<fingerprint>/`.
La ingesta se rehace si falta, está dañada o cambian sus metadatos de entrada.
El fingerprint actual usa nombres, tamaños y fechas de modificación de archivos;
no es un hash del contenido completo.

## 15. Límites conocidos

No hay etiqueta real de impago bancario, historial completo de saldos, prueba de
intenciones de gestión ni garantía jurídica automática del grupo. C4 histórico,
conversión monetaria y categorías tienen las limitaciones descritas. Las
[diferencias documentadas](../product/documentation-audit.md) requieren trabajo de código
separado. Las [especificaciones anteriores](../history/README.md) se conservan
como historial, no como comportamiento vigente.
