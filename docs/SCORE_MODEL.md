# Modelo teórico del score de salud financiera

> **Documento de trabajo, versión 0.1.** Los indicadores, pesos, ventanas y
> umbrales son propuestas para revisar antes de programar. Este score no es una
> probabilidad de impago, una calificación crediticia regulatoria ni una oferta
> de financiación.

## 1. Qué queremos medir

Para cada empresa y cada cierre de mes queremos mostrar tres cosas distintas:

1. **Salud:** si la actividad genera caja suficiente y resiste obligaciones y
  variaciones de cobros.
2. **Dirección:** si la salud mejora o empeora, aunque el nivel actual todavía
  parezca aceptable.
3. **Confianza:** cuánto historial y cuántas señales fiables sustentan la nota.

El resultado principal es un **score de 0 a 100**. La capacidad para asumir
deuda nueva se calcula aparte, con las mismas señales y supuestos explícitos
sobre cuotas, plazo y escenarios adversos. No se convierte directamente un
score de 70 en una cantidad de euros.

La inspiración de [FICO](https://www.myfico.com/credit-education/whats-in-your-credit-score)
sirve para considerar historial de pagos y deuda utilizada, pero sus pesos
corresponden a personas. Para empresas son especialmente relevantes el flujo de
caja, la cobertura de deuda y el análisis prospectivo, como recoge la
[guía de la EBA sobre concesión y seguimiento de préstamos](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2020/Guidelines%20on%20loan%20origination%20and%20monitoring/884283/EBA%20GL%202020%2006%20Final%20Report%20on%20GL%20on%20loan%20origination%20and%20monitoring.pdf).

## 2. Qué permite medir el dataset

El [diccionario de datos](./dataset/data_dictionary.md) describe ocho CSV con
1.286 empresas agrupadas en 250 grupos empresariales. La tabla separa campos
directos de conceptos que solo podemos estimar.


| Archivo                    | Campos útiles                                                                                                                                                                           | Uso y límite                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `companies.csv`            | `company_id`, `group_id`, `currency`, `created_at`                                                                                                                                      | Identidad, moneda de referencia y pertenencia a grupo. `created_at` es alta en la plataforma, no fecha de fundación de la empresa.         |
| `groups.csv`               | `group_id`, `n_companies_in_sample`                                                                                                                                                     | Evitar mezclar filiales del mismo grupo en entrenamiento y evaluación. El número de empresas del grupo no equivale a una garantía de pago. |
| `banking_products.csv`     | `product_id`, `company_id`, `type`, `currency`, `created_at`                                                                                                                            | Identificar a qué tipo de cuenta pertenece cada movimiento y evitar sumar dos veces flujos internos.                                       |
| `transactions.csv`         | `company_id`, `product_id`, `date`, `amount`, `exchange_rate`, `status`, `category`, `counterparty_id`                                                                                  | Fuente principal de cobros, pagos, intereses y cuotas *observados*. La categoría y el signo necesitan depuración.                          |
| `invoices.csv`             | `company_id`, `document_type`, `issuance_date`, `due_date`, `payment_date`, `amount`, `pending_amount`, `currency`, `accounting_currency`, `exchange_rate`, `status`, `counterparty_id` | Retrasos y concentración de clientes, con reconstrucción temporal cautelosa. La factura emitida no equivale a dinero cobrado.              |
| `debt_products.csv`        | `company_id`, `product_id`, `type`, `granted`, `outstanding`, `liquidity`, `currency`                                                                                                   | Identificar financiación y estudiar la posición **final**. No contiene una serie mensual de deuda pendiente.                               |
| `debt_schedule_config.csv` | `company_id`, `product_id`, `amortising_frequency`, `outstanding_balance`, `next_payment_date`, `annual_interest_rate_or_spread`                                                        | Contrastar cuotas y condiciones cuando hay cuadro de amortización. Su cobertura es escasa.                                                 |
| `balances.csv`             | `company_id`, `product_id`, `date`, `balance`, `liquidity`                                                                                                                              | Liquidez observada al final del periodo. No es una serie histórica de caja.                                                                |
| `data_dictionary.md`       | Definiciones de campos                                                                                                                                                                  | Referencia para revisar el significado de cada señal antes de implementarla.                                                               |


**Cobertura observada al revisar los CSV:** las transacciones alcanzan a las
1.286 empresas, pero solo 373 tienen actividad en los 24 meses completos; la
mediana es 18 meses activos. Hay facturas de 785 empresas, productos de deuda
de 378 y cuadros de amortización de 40. La falta de registros de deuda no
demuestra que una empresa no tenga deuda fuera de las conexiones disponibles.

**Tiempo:** septiembre de 2024 a agosto de 2026 son los 24 meses completos
para comparar. Septiembre de 2026 contiene movimientos parciales y la mayor
parte de los saldos se fotografían el 1 de septiembre de 2026. No comparar ese
mes parcial con uno completo.

**Campos ausentes:** no hay sector/CNAE, cuenta de resultados, EBITDA,
patrimonio neto, inventario, inmuebles, valoración de activos ni garantías.
Los cobros bancarios son una aproximación de caja recibida, no ingresos
contables; el saldo bancario no representa todos los activos. No fabricar
estas variables a partir de otros campos ni asignar un sector por intuición.

**Calidad que condiciona la fórmula:** `balances.balance`,
`debt_products.outstanding` y `invoices.pending_amount` son datos de
extracción final, no valores históricos. En facturas pendientes,
`payment_date` coincide casi siempre con `due_date`, por lo que no acredita
un pago. Cerca de una cuarta parte de las transacciones usa categoría `-`;
también existen movimientos sobre productos de crédito. Estas observaciones
obligan a medir la cobertura de cada indicador.

## 3. Fórmula inicial editable

Cada indicador válido se expresa en una subnota `sᵢ` entre 0 y 100, donde
**más alto siempre significa mejor**. Los pesos iniciales suman exactamente 100; reflejan una hipótesis de trabajo, no una estimación estadística de riesgo. Change


| Nº  | Bloque             | Indicador                               | Peso    |
| --- | ------------------ | --------------------------------------- | ------- |
| 1   | Generación de caja | Margen operativo cobrado                | 18      |
| 2   | Generación de caja | Frecuencia de déficit operativo         | 12      |
| 3   | Presión de deuda   | Cobertura del servicio de deuda         | 14      |
| 4   | Presión de deuda   | Carga de intereses                      | 6       |
| 5   | Circulante         | Retraso real en cobros de clientes      | 8       |
| 6   | Circulante         | Facturas de clientes vencidas sin cobro | 8       |
| 7   | Circulante         | Retraso en pagos a proveedores          | 4       |
| 8   | Trayectoria        | Tendencia de cobros operativos          | 10      |
| 9   | Trayectoria        | Tendencia del margen de caja            | 10      |
| 10  | Resistencia        | Concentración de clientes               | 5       |
| 11  | Resistencia        | Volatilidad de cobros                   | 5       |
|     |                    | **Total**                               | **100** |


**Agregación propuesta.** Si una señal no existe o es poco fiable, su nota
efectiva vuelve progresivamente a 50, en lugar de considerarla buena o mala:

```text
nota_efectivaᵢ(t) = 50 + confianzaᵢ(t) × (sᵢ(t) − 50)
score(t)           = Σ [pesoᵢ / 100 × nota_efectivaᵢ(t)]
confianza_global(t)= Σ [pesoᵢ / 100 × confianzaᵢ(t)]
```

`confianzaᵢ` va de 0 a 1. Vale 0 cuando no se puede medir, y se aproxima a 1
al disponer de una ventana suficiente y registros válidos. Por ejemplo, una
ventana de seis meses con un solo mes observable inspira menos confianza que
seis meses completos. La confianza se muestra **separada** del score: un
historial corto no es por sí mismo mala salud.

**Normalización propuesta.** Los porcentajes acotados pueden transformarse
directamente a 0–100; los ratios y días sin cota se escalan con percentiles
robustos de empresas de entrenamiento, fijados y versionados antes de evaluar
empresas o meses nuevos. Invertir la escala cuando un valor alto indique más
riesgo. Para cambios de trayectoria, anclar el cambio cero en 50 y llevar
mejoras hacia 100 y deterioros hacia 0. Un denominador cero o una conversión
de moneda no verificada hacen el indicador no disponible, no infinito.

### 3.1. Margen operativo cobrado — 18 puntos

- **Pregunta:** de cada euro efectivamente cobrado por la actividad, ¿cuánto
queda tras pagos operativos observados?
- **Campos:** `transactions.date`, `amount`, `category`, `status`,
`product_id`; `banking_products.type`, `currency`.
- **Cálculo bruto:** `(cobros_operativos − pagos_operativos) / cobros_operativos`, con importes positivos para ambas magnitudes.
- **Ventana:** seis meses móviles, usando los meses disponibles al principio y
reduciendo la confianza hasta completar la ventana.
- **Dirección:** mayor margen, mejor nota. Si no hay cobros operativos
identificables, indicador no disponible.
- **Para perfeccionar:** separar pagos recurrentes de extraordinarios y medir
cuánto volumen queda sin clasificar. No incluir disposiciones de crédito como
cobros ni cuotas de deuda como gasto operativo.



### 3.2. Frecuencia de déficit operativo — 12 puntos

- **Pregunta:** ¿es habitual que la operación consuma más caja de la que cobra?
- **Campos:** los mismos movimientos operativos del indicador 1, agrupados por
`date` y `company_id`.
- **Cálculo bruto:** meses con `cobros_operativos < pagos_operativos` divididos
entre meses observables de la ventana.
- **Ventana:** seis meses móviles; la confianza depende de cuántos meses
completos tienen movimientos suficientes.
- **Dirección:** menos meses de déficit, mejor nota. Un mes sin actividad
verificable no se cuenta automáticamente como déficit cero.
- **Para perfeccionar:** distinguir inversión o estacionalidad de una secuencia
de déficits y revisar la dependencia de aportaciones de socios.



### 3.3. Cobertura del servicio de deuda — 14 puntos

- **Pregunta:** ¿la caja operativa observada alcanza para principal e
intereses que vencen?
- **Campos:** `transactions.amount`, `date`, `category`, `status`,
`product_id`; `debt_schedule_config` para contraste cuando exista.
- **Cálculo bruto:** caja operativa antes de deuda dividida entre pagos
observados de `debt_repayment` más `interest_charge`, sin duplicar los dos
lados de un traspaso entre cuentas. Es una **aproximación** a cobertura de
servicio, no un DSCR contable con EBITDA.
- **Ventana:** seis meses móviles; contrastar también doce cuando haya datos.
- **Dirección:** más cobertura, mejor nota. Si no hay pagos de deuda
observables, el indicador es desconocido: no se asigna 100.
- **Para perfeccionar:** contrastar cargos con cuadros de amortización,
vencimientos y movimientos de líneas de crédito; separar principal de
intereses donde el banco no lo haya hecho.



### 3.4. Carga de intereses — 6 puntos

- **Pregunta:** ¿qué parte de los cobros operativos absorbe el coste financiero?
- **Campos:** `transactions.category = interest_charge`, `amount`, `date`,
`status`, y los cobros definidos en el indicador 1.
- **Cálculo bruto:** intereses pagados / cobros operativos en la ventana.
- **Ventana:** seis meses móviles.
- **Dirección:** menor carga, mejor nota. Sin cargos identificables y sin
confirmación de ausencia de deuda, dejarla neutral con baja confianza.
- **Para perfeccionar:** detectar comisiones financieras y subidas de coste
por tipo variable, sin duplicarlas con `fee` genérico.



### 3.5. Retraso real en cobros de clientes — 8 puntos

- **Pregunta:** ¿cuánto tardan en pagar los clientes respecto al vencimiento?
- **Campos:** `invoices.document_type`, `amount`, `due_date`, `payment_date`,
`status`, `currency`.
- **Cálculo bruto:** mediana de `payment_date − due_date` para facturas de
clientes pagadas realmente **antes o en** el cierre del mes. La hipótesis
inicial es que importe positivo identifica factura a cliente; hay que
contrastarla con ejemplos y cobros bancarios.
- **Ventana:** facturas pagadas en los últimos seis meses; si hay muy pocas,
reducir confianza.
- **Dirección:** menos días de retraso, mejor nota. Los cobros anticipados no
deben dar bonificaciones ilimitadas.
- **Para perfeccionar:** revisar pagos parciales y fechas de pago futuras o
incompatibles con la extracción; no usar `payment_date` de facturas
pendientes como pago real.



### 3.6. Facturas de clientes vencidas sin cobro — 8 puntos

- **Pregunta:** ¿se acumula facturación cuyo plazo de cobro ya pasó?
- **Campos:** `invoices.issuance_date`, `due_date`, `payment_date`, `amount`,
`status`, `document_type`.
- **Cálculo bruto:** importe de facturas de clientes con `due_date ≤ cierre`
y sin pago efectivo conocido a ese cierre, dividido entre importe de
facturas de clientes vencidas en la ventana. Usar el importe original como
aproximación, **no** `pending_amount` final como saldo histórico.
- **Ventana:** vencimientos de los últimos seis meses.
- **Dirección:** menor proporción vencida, mejor nota.
- **Para perfeccionar:** reconstruir pagos parciales y cancelaciones si se
obtienen eventos históricos. Con los CSV actuales la reconstrucción puede
sobreestimar lo pendiente; marcar el resultado como estimado o llevar la
confianza a cero si la validación de fechas falla.



### 3.7. Retraso en pagos a proveedores — 4 puntos

- **Pregunta:** ¿la empresa está estirando sus propios vencimientos?
- **Campos:** `invoices.amount`, `due_date`, `payment_date`, `status`,
`document_type`.
- **Cálculo bruto:** mediana de `payment_date − due_date` para facturas de
proveedor pagadas realmente antes o en el cierre. La hipótesis inicial es
que importe negativo identifica proveedor; comprobarla.
- **Ventana:** seis meses de pagos observados.
- **Dirección:** retrasos persistentes y elevados reducen la nota. Pagar
antes de plazo no otorga necesariamente la nota máxima.
- **Para perfeccionar:** distinguir condiciones pactadas, confirming y
aplazamientos voluntarios de impagos por falta de caja.



### 3.8. Tendencia de cobros operativos — 10 puntos

- **Pregunta:** ¿los clientes están aportando más o menos caja que antes?
- **Campos:** cobros operativos identificados en `transactions`, por `date` y
`company_id`.
- **Cálculo bruto:** variación de cobros de los últimos tres meses frente a
los tres anteriores, expresada sobre el volumen del periodo anterior; si
existe un año comparable, revisar además el mismo trimestre del año previo.
- **Ventana:** seis meses para la comparación inicial; hasta doce meses
adicionales para contraste estacional.
- **Dirección:** mejora sostenida, mayor nota; retroceso, menor nota. Cambio
cero equivale a 50 antes de considerar confianza.
- **Para perfeccionar:** eliminar entradas extraordinarias y evitar premiar
crecimiento obtenido solo por vender a un cliente muy concentrado.



### 3.9. Tendencia del margen de caja — 10 puntos

- **Pregunta:** ¿la empresa convierte mejor o peor sus cobros en caja libre
para obligaciones?
- **Campos:** los componentes mensuales del indicador 1.
- **Cálculo bruto:** margen operativo agregado de los últimos tres meses
menos margen agregado de los tres anteriores. Se comparan márgenes, no solo
saldos absolutos.
- **Ventana:** seis meses para la comparación; contrastar con el mismo
periodo del año anterior cuando exista.
- **Dirección:** mejora, mayor nota; deterioro, menor nota; estabilidad, 50
antes de considerar confianza.
- **Para perfeccionar:** controlar cambios de clasificación y efectos de
estacionalidad. Este indicador mide **cambio**, mientras el 1 mide **nivel**.



### 3.10. Concentración de clientes — 5 puntos

- **Pregunta:** ¿depende una gran parte de la facturación de pocos clientes?
- **Campos:** `invoices.amount`, `counterparty_id`, `issuance_date`,
`document_type`, `currency`.
- **Cálculo bruto:** importe facturado a los tres principales clientes /
facturación identificada de clientes. Mantener la misma moneda antes de
agregar o convertirla con una tasa verificada.
- **Ventana:** hasta doce meses; con menos historia, calcular sobre lo
disponible y reducir confianza.
- **Dirección:** menor concentración, mejor nota. Contrapartes sin ID reducen
la confianza.
- **Para perfeccionar:** contrastar con concentración de cobros reales y
distinguir clientes recurrentes de una factura extraordinaria.



### 3.11. Volatilidad de cobros — 5 puntos

- **Pregunta:** ¿qué tan predecible es la entrada de caja?
- **Campos:** cobros operativos mensuales de `transactions.date`, `amount`,
`category`, `status`.
- **Cálculo bruto:** dispersión robusta de cobros mensuales dividida entre el
cobro mensual típico; evitar que un solo cobro extremo determine la nota.
- **Ventana:** seis a doce meses según historial disponible.
- **Dirección:** menor variabilidad, mejor nota. Si el volumen típico es cero,
el indicador no está disponible.
- **Para perfeccionar:** separar estacionalidad repetible de cambios
imprevisibles. Una empresa estacional puede ser sana si conserva caja para
los meses débiles.



## 4. Reglas comunes para que el score sea comparable mes a mes

1. **Fecha de corte:** puntuar al cierre de cada mes completo. Una señal de
  `t` solo puede usar eventos con fecha igual o anterior a ese cierre. No
   utilizar saldos, deuda pendiente, estados o importes pendientes de la
   fotografía final para puntuar `t < septiembre de 2026`.
2. **Movimientos operativos:** comenzar con categorías de cobro y pago
  inequívocas, usando solo movimientos `booked`; tratar `transfer`,
   disposiciones de crédito, inversión y transacciones de productos de deuda
   por separado. Revisar muestras de `category = '-'` antes de asignarla. Una
   categoría desconocida reduce cobertura, no se convierte en ingreso cero.
3. **Moneda:** agregar importes únicamente en una misma moneda. Validar qué
  representa `exchange_rate` antes de convertir; mientras no esté claro,
   excluir importes de otras monedas de métricas monetarias agregadas y bajar
   la confianza.
4. **Facturas:** trabajar inicialmente con `document_type = invoice`, validar
  el signo como dirección cliente/proveedor y descartar fechas imposibles.
   El estado de extracción no sustituye a un historial mensual de estados.
5. **Empresa y grupo:** el score es por `company_id`. `group_id` sirve para
  controlar evaluaciones y detectar relaciones; sumar flujos de filiales
   sin eliminar operaciones internas duplicaría actividad.
6. **Explicación:** guardar en cada mes el valor bruto, la subnota, el peso,
  la confianza y la aportación final de cada indicador. La diferencia entre
   dos meses debe descomponerse exactamente en diferencias de esas
   aportaciones, incluida la variación de confianza.

Una caída por un único mes extraordinario debe motivar revisión; las alertas
de deterioro usarán además persistencia o coincidencia de varias señales.
Una recuperación se evaluará con la misma exigencia para que el sistema
reconozca mejoras y deterioros en ambas direcciones.

## 5. Capacidad adicional de deuda: resultado separado

La cifra más interpretable es la **cuota mensual adicional sostenible**.
Después puede convertirse a principal financiable según el tipo de producto,
interés y plazo que se propongan.

```text
caja_disponible_para_deuda ≈ cobros_operativos − pagos_operativos
cuota_adicional_máxima ≈ max(
  0,
  caja_disponible_para_deuda_estresada / cobertura_mínima
  − cuotas_actuales_observadas
)
```

**Hipótesis iniciales editables:** cobertura mínima de `1,3`, escenario
adverso de `−20 %` en cobros y `+10 %` en pagos operativos, y reserva líquida
equivalente a tres meses de gastos esenciales. Son supuestos de exploración,
no valores impuestos por la EBA ni calibrados con impagos del dataset.
Calcular escenarios base y adverso y mostrar un rango, no una precisión falsa.

El cálculo necesita comprobar, además, que la nueva cuota no consuma el
colchón de caja. Para la fecha final pueden emplearse saldos actuales de
`balances.csv` y financiación actual de `debt_products.csv` después de
normalizar signos y verificar cobertura. Para meses anteriores no existe una
serie de saldos/deuda pendiente suficiente para afirmar un límite histórico
exacto. Sin patrimonio, activos valorados y garantías, tampoco se puede
calcular una capacidad de préstamo respaldada por su venta.

La guía de la EBA propone analizar la capacidad futura bajo condiciones
adversas, incluidas perturbaciones relevantes para el negocio. Si más adelante
se aporta un sector verificable, podrá condicionar el escenario de estrés;
con estos archivos no corresponde premiar ni penalizar sectores imaginados.

## 6. Cómo validar y revisar el modelo

- **Comprobación de datos:** verificar signos de facturas y deuda, sentido de
`exchange_rate`, movimientos duplicados entre productos, fechas inválidas y
cobertura por empresa y por mes. Mantener ejemplos reales del dataset para
cada regla de clasificación.
- **Comprobación matemática:** los once pesos deben sumar 100; cada subnota y
score han de quedar en `[0, 100]`; cada aportación debe recomponer el total.
Si una señal no es observable, su confianza baja y su nota efectiva tiende
a 50.
- **Prueba temporal:** reconstruir varios meses sin mirar fotografías
posteriores y comprobar que añadir datos del futuro no altera una nota
histórica. No evaluar septiembre de 2026 como mes completo.
- **Generalización:** separar grupos empresariales completos entre ajuste y
validación. Evaluar empresas nunca vistas y ventanas posteriores a las
usadas para fijar escalas y pesos.
- **Trayectoria:** definir resultados futuros observables a 3 y 6 meses,
medir cuántos meses antes se detectan deterioros **y** recuperaciones, y
contar falsas alarmas por baches de un solo mes. Sin etiquetas de impago,
estos resultados son indicadores indirectos, no calibración de PD.
- **Revisión de pesos:** cambiar un indicador o su peso solo tras comprobar
qué aporta en empresas no vistas, si repite información de otro y si mejora
la explicación. Volver a dejar la suma en 100 y registrar la versión.



### Decisiones abiertas para editar antes de programar


| Decisión                                   | Propuesta actual                                                     | Cambio que se quiera probar |
| ------------------------------------------ | -------------------------------------------------------------------- | --------------------------- |
| Pesos de los once indicadores              | Tabla de la sección 3                                                |                             |
| Ventana base de caja y deuda               | 6 meses                                                              |                             |
| Comparación de trayectoria                 | Últimos 3 meses frente a los 3 anteriores; contraste anual si existe |                             |
| Tratamiento de transacciones sin categoría | Reducir cobertura hasta clasificarlas con evidencia                  |                             |
| Reconstrucción de facturas vencidas        | Aproximación con fechas; confianza cero si no supera validación      |                             |
| Moneda de referencia y conversión          | No convertir sin validar `exchange_rate`                             |                             |
| Cobertura mínima para capacidad de deuda   | 1,3 en la hipótesis inicial                                          |                             |
| Escenario adverso                          | Cobros −20 %, pagos +10 %                                            |                             |
| Colchón de liquidez                        | 3 meses de gastos esenciales                                         |                             |




## Fuentes

- [Diccionario del dataset](./dataset/data_dictionary.md) y los ocho CSV de
`dataset/`: disponibilidad y significado de columnas.
- [FICO: componentes de un score de crédito personal](https://www.myfico.com/credit-education/whats-in-your-credit-score): referencia conceptual; sus porcentajes no son pesos empresariales.
- [EBA: Guidelines on loan origination and monitoring](https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/credit-risk/guidelines-loan-origination-and-monitoring): evaluación y seguimiento del riesgo crediticio.
- [EBA: informe final y anexo de métricas empresariales](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2020/Guidelines%20on%20loan%20origination%20and%20monitoring/884283/EBA%20GL%202020%2006%20Final%20Report%20on%20GL%20on%20loan%20origination%20and%20monitoring.pdf): flujo de caja, servicio de deuda, activos y escenarios adversos.

