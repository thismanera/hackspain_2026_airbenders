# Generación de caja: nota inicial, seguimiento mensual y capacidad de deuda

> Documento de trabajo para revisar antes de programar. Los pesos y umbrales
> numéricos son hipótesis iniciales, no una probabilidad de impago ni criterios
> bancarios validados. Este archivo desarrolla **solo generación de caja** y su
> relación con la capacidad de asumir cuotas; la presión de deuda mantiene su
> apartado propio en el score general.

## 1. Cómo encaja en la primera nota

**Sí tiene sentido que caja y deuda expliquen buena parte de la primera
lectura**, porque son señales directas de capacidad de pago. Pero conviene
mantener los **mismos pesos del score global todos los meses**. Si al principio
solo conocemos caja y deuda, los demás apartados quedan neutrales y la
confianza es menor. Cambiar los pesos al aparecer facturas o más historial
haría que la nota se moviera aunque el negocio no hubiese cambiado.

La propuesta general reserva **30 puntos a generación de caja** y **20 a
presión de deuda**. El resto corresponde a circulante, trayectoria y
resistencia. Una empresa puede empezar con información de esas áreas si ya
existe; no hay que esperar artificialmente para incorporarla. La trayectoria
necesita al menos dos periodos comparables, por lo que suele tardar más en
estar disponible.

```text
score_global_t = 50 + Σ [peso_i × confianza_i,t × (subnota_i,t − 50) / 100]

si solo hay evidencia fiable de caja y deuda:
score_inicial = 50
              + 0,30 × (nota_caja − 50)
              + 0,20 × (nota_deuda − 50)
```

Ejemplo: caja `80`, deuda `60` y confianza plena en ambos dan una nota global
inicial de `61`. Las demás áreas aportan un valor neutral de 50 hasta poder
medirlas. Si únicamente se observa un mes de caja, la confianza de esa parte
será baja y el resultado quedará más cerca de 50. **Sin pagos de deuda
registrados no se supone que la empresa esté libre de deuda.**

La primera nota debe ir acompañada de:

- **Fecha de corte** y meses completos observados. `companies.created_at`
  indica alta en la plataforma, no edad real del negocio.
- **Confianza/cobertura:** cuentas conectadas, proporción de importes
  clasificados, monedas tratadas y meses con actividad observable.
- **Origen del resultado:** cobros, pagos, margen, déficits y componentes
  neutrales por falta de datos.
- **Contexto:** una entrada excepcional, una aportación de socios o una
  disposición de crédito no prueban que la actividad genere caja recurrente.

## 2. Cadencia: mes cerrado y actualización frecuente

El **score oficial se calcula al cierre de cada mes completo**. Usa solamente
movimientos confirmados (`status = booked`) cuya `date` cae hasta ese cierre.
Hay 24 meses completos de septiembre de 2024 a agosto de 2026; septiembre
de 2026 es parcial y no debe compararse como otro mes completo.

Entre cierres se puede actualizar una **vista provisional** al recibir
movimientos confirmados, por ejemplo a diario. Debe indicar `mes en curso` y
separarse del historial oficial: cobrar el día 2 no convierte por sí solo a
ese mes en mejor que el anterior. Para una comparación provisional se usaría
el mismo número de días transcurridos de meses anteriores o una previsión
explícita con baja confianza. Los movimientos `pending` no elevan la nota ni
la capacidad de deuda hasta que se confirmen. Si una operación ya contabilizada
se corrige, la actualización debe conservar la versión anterior para explicar
el cambio.

Todas las ventanas son **móviles de meses completos**:

| Ventana | Papel |
| --- | --- |
| Mes `t` | Explicar qué ha entrado y salido en el mes más reciente. Es una observación, no toda la nota. |
| Últimos 3 meses | Detectar aceleraciones y cambios que quizá requieran atención. |
| Últimos 6 meses | Base inicial de la nota de generación de caja. |
| Últimos 12 meses, si existen | Contrastar estacionalidad y estabilidad de la capacidad para asumir deuda. |

Con menos de seis meses, calcular la nota con lo ya observado, pero acercarla
a 50 mediante la confianza. No inventar meses anteriores ni confundir `0` con
`desconocido`.

## 3. Definir cobros y pagos operativos antes de puntuarlos

Campos de partida: `transactions.company_id`, `product_id`, `date`, `amount`,
`status`, `category`, `counterparty_id`, `exchange_rate`, enlazados con
`banking_products.type` y `currency`. Para cada mes cerrado `t`:

```text
R_t = cobros operativos netos confirmados del mes, expresados en positivo
P_t = pagos operativos confirmados del mes, expresados en positivo
N_t = R_t − P_t               (caja operativa antes del servicio de deuda)
M_t = N_t / R_t               (solo si R_t > 0)
```

`R_t` es **dinero cobrado**, no facturación o beneficio contable. `N_t` es una
aproximación de caja operativa: las categorías del banco no sustituyen una
contabilidad completa de inversión, impuestos y capital circulante. Tampoco
es el saldo disponible de la cuenta.

### 3.1. Clasificación inicial de transacciones

La categoría es un indicio; el signo, tipo de producto y ejemplo de
descripción deben corroborarlo antes de sumar importes.

| Tratamiento propuesto | Categorías y criterio |
| --- | --- |
| **Cobros operativos candidatos** | `collection`, `bulk_collection`, `pos_settlement` con importe positivo. Confirmar si el TPV y la cuenta corriente reflejan el mismo cobro para no duplicarlo. |
| **Reducción de cobros** | `collection_refund` con importe negativo, cuando sea devolución de una venta cobrada. |
| **Pagos operativos candidatos** | `payment`, `bulk_payment`, `salary`, `utility`, `social_security`, `tax` con importe negativo. Revisar si pagos extraordinarios se están mezclando con gasto normal. |
| **Reducción de pagos** | `payment_refund` con importe positivo solo cuando corresponda a un pago operativo previamente clasificado. |
| **Servicio financiero, fuera de `N_t`** | `debt_repayment` e `interest_charge`. Se usan en presión de deuda y capacidad disponible después de deuda. |
| **Movimientos normalmente excluidos** | `transfer`, `investment_deployment`, `investment_return`, `cash_withdrawal` y movimientos de productos de deuda; pueden mover caja entre cuentas sin representar ventas o costes operativos. |
| **Revisión manual o regla validada** | `-`, `cash_settlement`, `cash_settlements`, `pos_withdrawal`, `fee`, `tax_refund` y cualquier signo inesperado. Una liquidación de efectivo o TPV puede ser venta real o traspaso de fondos ya contados. |

Esta lista es **provisional**. En los CSV, la categoría `-` aparece en unas
635.000 operaciones, alrededor del 25 % del total; dejarla fuera sin medir su
importe puede sesgar mucho la nota. La prioridad es clasificar una muestra y
medir qué porcentaje del volumen monetario queda sin asignar, no adivinarlo
por el signo. Hay además movimientos sobre líneas de crédito que no deben
sumarse a las ventas de una cuenta corriente.

Si hay varias cuentas, primero identificar los flujos externos de la empresa
y eliminar transferencias entre sus productos. Una transacción de tarjeta,
TPV o cuenta de crédito puede tener contrapartida en la cuenta corriente. En
empresas del mismo grupo, tampoco deben interpretarse automáticamente como
ventas los traspasos entre filiales.

**Moneda:** la moneda se conoce mediante `product_id`. Agregar solo importes
en una moneda comparable y validar la dirección de `exchange_rate` antes de
convertirlos. Una conversión no verificada reduce cobertura; no convierte una
entrada en beneficio.

## 4. Puntuación de generación de caja: 30 puntos del score global

La versión inicial conserva las dos métricas ya planteadas: **18 puntos para
el margen operativo cobrado** y **12 para la frecuencia de déficit**. Dentro
del bloque equivalen a 60 % y 40 %. Sus componentes mensuales son visibles
por separado para poder perfeccionarlos sin rehacer toda la fórmula.

| Componente | Peso global | Pregunta | Ventana |
| --- | ---: | --- | --- |
| Margen operativo cobrado | 18 | ¿Qué parte del cobro queda tras pagar la operación? | 6 meses móviles |
| Frecuencia de déficit operativo | 12 | ¿En cuántos meses los pagos superan los cobros? | 6 meses móviles |
| **Bloque caja** | **30** | | |

```text
nota_caja_t = 0,60 × nota_margen_t + 0,40 × nota_deficit_t
aportación_global_caja_t = 0,30 × nota_caja_t
```

### 4.1. Margen operativo cobrado: 18 puntos globales

Usar importes agregados durante los seis meses, no la media simple de seis
porcentajes. Así un mes diminuto no pesa igual que uno normal:

```text
R_6 = Σ R_m de los últimos 6 meses observables
P_6 = Σ P_m de los mismos meses
margen_6 = (R_6 − P_6) / R_6, si R_6 > 0
```

**Escala ilustrativa y editable para la primera versión:** `−20 %` de margen
o menos → `0`; `0 %` → `50`; `+20 %` o más → `100`, con interpolación lineal y
tope en ambos extremos. Estos cortes no son estándares financieros: habrá
que comprobar su distribución en empresas no vistas y ajustar si saturan
demasiadas notas. El margen puede ser alto por un cobro extraordinario y bajo
por una compra puntual; por eso se acompaña de la frecuencia de déficit y
del detalle mensual.

**Datos insuficientes:** si no hay cobros operativos identificables, la
subnota queda neutral con confianza cero. Si hay uno a cinco meses, calcular
el margen de los meses disponibles y reducir la confianza por historial y
volumen no clasificado. Un mes sin registros bancarios fiables no equivale a
un margen de `0 %`.

**Qué revisar después:** estacionalidad, cobros anticipados no repetibles,
reembolsos, impuestos, pagos extraordinarios y dependencia de financiación
externa. Comparar el margen con el mismo periodo del año anterior cuando
exista, sin introducir esa comparación dos veces en el score global.

### 4.2. Frecuencia de déficit operativo: 12 puntos globales

Para cada mes observado calcular `N_m = R_m − P_m` y marcar déficit si
`N_m < 0`:

```text
k = número de meses con N_m < 0 en la ventana
n = número de meses completos con datos observables, como máximo 6
nota_deficit = 100 × (1 − k / n), si n > 0
```

Con seis meses válidos, cero déficits da `100`, uno `83`, tres `50` y seis
`0`. Es una escala transparente, no una tasa de impago. **La severidad** de
cada déficit se mostrará aparte: seis meses apenas negativos y seis meses
con déficits profundos no son el mismo caso. Si la validación demuestra que
esa diferencia importa, parte de los 12 puntos puede pasar a una métrica de
profundidad, conservando el total de 30 puntos del bloque.

**Datos insuficientes:** reducir la confianza con menos de seis meses o con
mucho volumen sin clasificar. No contar meses sin conexión fiable como meses
sin déficit. Un mes de déficit aislado no activa por sí solo una alarma de
deterioro estructural.

### 4.3. Confianza y aportación

Para cada componente, usar una confianza entre 0 y 1 que refleje al menos
los meses observables y la parte del volumen bancario clasificada con
seguridad. Una propuesta inicial es:

```text
confianza_i = min(1, meses_observables / 6)
              × fracción_de_volumen_relevante_clasificado
subnota_efectiva_i = 50 + confianza_i × (subnota_bruta_i − 50)
```

`fracción_de_volumen_relevante_clasificado` se mide **en importe**, no solo
en número de movimientos. Incluye en el denominador las operaciones
potencialmente operativas aún sin clasificar; no penaliza por traspasos que
ya se identificaron como ajenos a la actividad. Los dos componentes pueden
tener distinta confianza. El score global suma sus **subnotas efectivas**, y
la confianza del bloque se publica por separado.

## 5. Cobro nuevo, cliente perdido y capacidad de endeudarse

Un cobro confirmado puede mejorar `R_t`, `N_t`, el margen y, con el tiempo,
la capacidad estimada para soportar cuotas. **No debe aumentar el límite de
deuda euro por euro**: hay que pagar costes, impuestos, deuda existente y
mantener una reserva. Una factura emitida o un cobro `pending` aún no aportan
la misma evidencia que dinero recibido.

**Cliente nuevo.** Identificarlo solo cuando exista un `counterparty_id`
estable y un primer cobro externo confirmado, o una factura de cliente
vinculada a un cobro fiable. Su efecto inmediato entra por el importe neto
cobrado; una mayor previsión futura se justifica cuando haya repetición o
un contrato verificable. No añadir puntos independientes por `cliente nuevo`:
duplicaría la mejora de cobros y quizá la menor concentración, que pertenece
al bloque de resistencia.

**Cliente perdido.** No basta con que no aparezca en un mes. Considerarlo
señal cuando antes aportaba cobros recurrentes y faltan varios cobros
esperados, comprobando que la cuenta y la fuente de datos siguen activas.
Su efecto observable es menor caja y, quizá, mayor concentración; la causa
`cliente perdido` debe mostrarse solo si está respaldada por identidades y
periodicidad fiables.

En estas transacciones `counterparty_id` falta en gran parte de los cobros;
`invoices.csv` ofrece más identificadores, pero facturar no demuestra cobrar.
Por ello, altas y bajas de clientes son **diagnósticos condicionados a
evidencia**, no una regla universal ni un peso nuevo dentro de los 30 puntos.

### 5.1. Recalcular mensualmente capacidad de cuota

La capacidad de deuda es una **salida adicional**, no la nota de caja.
Necesita caja operativa antes de deuda y pagos de deuda existentes. Una
primera aproximación conservadora usaría medias mensuales de ventanas
completas:

```text
R_ref = menor(media de R de últimos 6 meses, media de últimos 12 si existe)
P_ref = mayor(media de P de últimos 6 meses, media de últimos 12 si existe)
caja_estresada = 0,80 × R_ref − 1,10 × P_ref
servicio_existente = cuota mensual observada de principal + intereses
cuota_adicional_orientativa = max(
  0, caja_estresada / 1,3 − servicio_existente
)
```

`−20 %` en cobros, `+10 %` en pagos y cobertura `1,3` son hipótesis
editables para un escenario adverso, no umbrales de la EBA. La cuota
adicional no equivale al principal de un préstamo: para traducirla a euros
financiables hay que fijar plazo, interés, amortización y producto. También
hay que comprobar que queda un colchón de liquidez; `balances.csv` solo
aporta una fotografía al final, de modo que esa restricción no se puede
verificar con precisión para cada mes pasado.

Con menos de seis meses completos, clasificación deficiente, servicio de
deuda incompleto o monedas no conciliadas, mostrar una **estimación
provisional de baja confianza** o dejarla sin cifra. Un primer cobro de un
cliente nuevo puede afectar a la alerta diaria, pero el límite oficial cambia
al cierre y queda moderado por ventanas de 6 y 12 meses y el escenario
adverso. La [EBA](https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/credit-risk/guidelines-loan-origination-and-monitoring)
sitúa el flujo de caja y la capacidad futura de pago, incluidos escenarios
adversos, en la evaluación crediticia; estas cifras concretas son nuestras
hipótesis de producto.

## 6. Qué comprobar antes de implementar esta parte

1. **Cobertura:** por empresa y mes, cuántas cuentas hay, qué porcentaje del
   importe está clasificado y cuánto pertenece a categorías `-` u otras
   ambiguas. No puntuar con falsa seguridad una empresa parcialmente
   conectada.
2. **Signos y duplicados:** verificar categorías con muestras, diferenciar
   ingresos de transferencias y disposiciones, y evitar contar un cobro TPV
   dos veces. Revisar pagos en tarjeta frente a su liquidación bancaria.
3. **Moneda y tiempo:** comparar meses completos y una moneda homogénea;
   excluir datos posteriores al cierre. No utilizar `balances.csv` ni
   `debt_products.outstanding` final para fabricar caja histórica.
4. **Estabilidad del score:** probar meses con un cobro excepcional, varios
   déficits pequeños, un déficit grande y meses estacionales. Explicar la
   variación mensual como cambio en margen, déficits o confianza.
5. **Capacidad de deuda:** demostrar que un cobro recurrente neto puede subir
   la cuota estimada, mientras un préstamo recibido, traspaso interno o
   factura todavía no cobrada no lo hace. Probar pérdida de cliente fiable y
   falta de identificación del cliente.

### Decisiones que puedes editar en este documento

| Tema | Hipótesis actual | Alternativa que quieras probar |
| --- | --- | --- |
| Peso de generación de caja en score global | 30/100 | |
| Peso margen / déficits dentro de caja | 18/12 | |
| Ventana base | 6 meses completos | |
| Escala de margen | −20 % → 0; 0 % → 50; +20 % → 100 | |
| Frecuencia de déficit | Proporción de meses negativos | |
| Cliente nuevo/perdido | Diagnóstico con cobro e identidad fiables; sin puntos extra | |
| Vista durante el mes | Provisional; score oficial al cierre | |
| Capacidad orientativa | Estrés 20 %/10 %, cobertura 1,3 | |

## Referencias

- [Diccionario del dataset](./dataset/data_dictionary.md): columnas,
  cobertura y significado de los productos y movimientos.
- [EBA, Guidelines on loan origination and monitoring](https://www.eba.europa.eu/activities/single-rulebook/regulatory-activities/credit-risk/guidelines-loan-origination-and-monitoring): contexto para evaluar capacidad de pago y vigilar crédito.
- [EBA, informe final y métricas de financiación empresarial](https://www.eba.europa.eu/sites/default/files/document_library/Publications/Guidelines/2020/Guidelines%20on%20loan%20origination%20and%20monitoring/884283/EBA%20GL%202020%2006%20Final%20Report%20on%20GL%20on%20loan%20origination%20and%20monitoring.pdf): flujo de caja, cobertura del servicio y escenarios adversos.
