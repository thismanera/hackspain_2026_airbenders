# Diagnóstico del dataset antes de entrenar

Lee esto antes de escribir una línea de modelo. Recoge lo que hemos medido
sobre `dataset/`, las trampas que tiene y qué implican para el diseño del
score.

Las cifras de este documento **se generan**, no se copian a mano: salen de
`analysis/metrics.json`, que escriben los scripts al ejecutarse, y se inyectan
con `python analysis/06_report.py`. Si editas un número dentro de un bloque
`AUTO`, la siguiente ejecución te lo pisa. Es a propósito: un documento cuyos
números no cuadran con el pipeline no lo cree nadie, y con razón.

<!-- AUTO:meta -->
Cifras generadas el 2026-09-18T20:51:45+00:00 desde el commit `dadc245`.
<!-- /AUTO -->

## Cifras clave

<!-- AUTO:clave -->
| Cifra | Valor |
| --- | --- |
| Empresas / grupos | 1.286 en 250 |
| Empresas que comparten grupo | 94,5% |
| Meses de historia (mediana) | 19 de 25 |
| Empresas con 7–12 meses | 415 |
| Etiqueta estrés a 12m (positivos) | 17,6% sobre 8.796 filas |
| Dispersión de tamaño (p90/p10) | 582x |
| Meses con caja reconstruida negativa | 8,2% |
| Persistencia de nivel del índice | 0,645 |
| Persistencia de tendencia del índice | 0,079 |
| ACF trimestral del índice (lags 1–4) | -0,06, -0,17, -0,19, -0,16 |
| Veredicto de tendencia | 9 de 10 señales dentro de la nula; roza el límite: `net_margin` |
<!-- /AUTO -->

## 1. No hay trayectoria en los datos

Es el hallazgo que condiciona la estrategia. Para diez señales mensuales
medimos si la pendiente de la primera mitad de la historia predice la de la
segunda, con rangos cross-seccionales por trimestre (mata escala y outliers) y
contra una nula por permutación del orden temporal dentro de cada empresa.

<!-- AUTO:trayectoria -->
| Señal | Persistencia de nivel | Persistencia de tendencia | Nula p95 |
| --- | ---: | ---: | ---: |
| `inflow` | 0,853 | 0,050 | 0,098 |
| `outflow` | 0,851 | -0,020 | 0,090 |
| `ar_hhi` | 0,772 | 0,078 | 0,125 |
| `cash_days` | 0,748 | -0,080 | 0,107 |
| `fee_ratio` | 0,738 | -0,015 | 0,078 |
| `ar_dso` | 0,720 | -0,095 | 0,250 |
| `ar_days_late` | 0,640 | -0,020 | 0,202 |
| `ap_days_late` | 0,635 | -0,004 | 0,174 |
| `unpaid_rate` | 0,615 | -0,014 | 0,072 |
| `net_margin` | 0,211 | 0,082 | 0,078 |
<!-- /AUTO -->

El nivel es muy persistente y por tanto aprendible. La tendencia cae dentro del
ruido: ninguna señal supera su propia nula de forma apreciable. El índice
compuesto lo confirma por la vía dura, con autocorrelación trimestral negativa
en los lags 2 a 4, es decir reversión a la media y no regímenes.

Cada empresa oscila como ruido blanco alrededor de su propio nivel. Las
empresas del enunciado que van de 45 a 65 y de 82 a 68 son ilustrativas; esa
deriva no está en los agregados mensuales, y tampoco en la versión lenta del
contraste (12 meses contra 12, agregando por trimestres).

### Qué implica para el diseño del score

La conclusión no es "ignorad la trayectoria", que además es requisito
obligatorio del reto. Es que **la trayectoria no debe ser un sumando con peso
dentro del número**, por tres razones independientes:

1. **Doble conteo.** Si el score se calcula sobre una ventana móvil de seis
   meses, `score_t − score_{t−3}` ya es la comparación de tres meses contra
   los tres anteriores. Un indicador de tendencia con puntos propios cuenta dos
   veces la misma información.
2. **Amplificación de ruido.** Una diferencia tiene varianza
   `2σ²(1−ρ)`. Con `ρ ≈ 0` eso es el doble de ruido y cero información nueva;
   con la autocorrelación negativa que medimos, más del doble.
3. **Cobertura.** Un tercio de las empresas tiene entre 7 y 12 meses. Un
   indicador de tendencia necesita dos periodos comparables, así que para ese
   tercio no existe. Con un mecanismo de confianza que lleva lo no medible a
   50 neutro, esos puntos se evaporan justo donde más falta hace decidir.

La alternativa que sí funciona: el score es un **nivel sobre ventana móvil**, y
por serlo ya se mueve cuando la empresa se mueve. La trayectoria se publica
**al lado**, como la derivada de ese mismo score (nivel, pendiente y shock con
un filtro tipo Holt), exigiendo persistencia de dos meses antes de llamarla
tendencia. Y la tendencia manda sobre las **decisiones** (límite de crédito,
precio, alertas), que es donde se traduce en euros y donde el jurado la quiere
ver.

La anticipación se mide **inyectando deterioros sintéticos controlados** en
empresas sanas y contando en qué mes levanta la mano el monitor. Medirla sobre
estos datos tal cual es medir azar.

Esto cambiaría si la organización confirma que el generador tiene un parámetro
de deriva. Es la pregunta que hay que hacerle al especialista de datos de
Embat.

## 2. El balanceo de clases no es el problema

Etiqueta de estrés compuesta: dos o más señales simultáneas entre caja por
debajo de 10 días, impagos o devoluciones en el extracto, más de la mitad de
las facturas pagadas con más de 30 días de retraso, y comisiones más intereses
por encima del 2% de la salida.

<!-- AUTO:senales -->
| Señal | % empresa-mes | % empresas alguna vez |
| --- | ---: | ---: |
| caja < 10 dias | 39,30% | 72,9% |
| caja < 0 | 7,55% | 21,5% |
| flujo neto negativo | 52,46% | 99,6% |
| pagamos >30d tarde (>50% fras) | 3,23% | 20,8% |
| nos pagan >30d tarde (>50%) | 2,70% | 19,1% |
| algun impago/devolucion | 6,39% | 28,1% |
| comisiones+intereses >2% salida | 7,33% | 34,4% |
<!-- /AUTO -->

Proyectado a "estrés en los próximos 12 meses" queda en torno a 1:5, que se
resuelve con pesos de clase y calibración. No hace falta SMOTE.

Ojo con el tamaño de muestra efectivo: no son 32.150 filas, son 1.286 empresas
en 250 grupos, y casi todas comparten grupo con otra. Split aleatorio por
empresa = fuga vía filiales del mismo holding. Y si el modelo va a ganar
variables, el límite no es cuántas features tienes sino esos 250 grupos: el
riesgo real es sobreajustar, no quedarse corto.

## 3. Los desbalances que sí duelen

### Historia disponible

La mediana son 19 meses de 25, pero la distribución es bimodal y hay un bloque
grande de empresas con 7 a 12 meses. Cualquier feature con ventana de 12 meses
es nula para un tercio del dataset.

### Cobertura por bloque de información

<!-- AUTO:cobertura -->
| Bloque | Empresas | % |
| --- | ---: | ---: |
| Transacciones | 1.286 | 100,0% |
| Facturas (DSO/DPO) | 784 | 61,0% |
| Algún producto de deuda | 378 | 29,4% |
| Línea de crédito con `granted` | 206 | 16,0% |
| Cuadro de amortización | 40 | 3,1% |
| País informado | 230 | 17,9% |
| ERP informado | 745 | 57,9% |
<!-- /AUTO -->

El DSCR solo se puede calcular para menos de un tercio de las empresas, y con
cuadro de amortización real para 40. Cualquier motor que se apoye en deuda
tiene que degradarse por niveles según lo que exista, no imputar medianas y
fingir que sabe.

### Escala y divisa (resuelto, con una salvedad)

El campo `exchange_rate` **no** convierte a EUR: convierte de `currency` a
`accounting_currency`, y para la mayoría de filas vale 1,0. Sin normalizar, los
importes de distintas divisas no son comparables: había facturas por 2,19·10¹¹
en pesos colombianos que son unos 33 M EUR.

Hay 44 divisas en el dataset, pero el top 10 cubre el 98,5% de las facturas.
`analysis/fx.py` tiene la tabla (anclas de medio plazo, en unidades por EUR) y
convierte el 100% de las filas; la validación comprueba que, tras convertir, la
mediana de factura de cada divisa cae en el mismo orden de magnitud que la del
euro. **Las transacciones heredan la divisa de su cuenta bancaria**, porque
`transactions.csv` no la trae: hay que cruzar por `product_id`. Quien normalice
sin darse cuenta de eso se queda con todo en la divisa equivocada y sin ningún
error visible.

Salvedad: incluso en euros, la dispersión de tamaño sigue siendo enorme y queda
un puñado de empresas con outflow mediano de miles de millones, que son barridos
de tesorería intragrupo y no operación. Todo tiene que ser ratio o rango, nunca
euros absolutos.

### Trampa de calendario

El mes **2026-09 está truncado**: unas 11 transacciones por empresa frente a las
~110 de un mes normal. Cualquier feature de "último mes" o delta final ve un
acantilado falso en las 1.286 empresas. Los 24 meses completos van de 2024-09 a
2026-08.

## 4. Trampas verificadas del dataset

<!-- AUTO:validaciones -->
| Comprobación | Resultado |
| --- | --- |
| Importe negativo = proveedor | 94.7% de 12.505 pares |
| Importe positivo = cliente | 89.5% de 7.431 pares |
| Facturas con `payment_date` == `due_date` | 62,0% |
| Idem dentro de las `overdue` | 96,2% (y son el 22,0% del fichero) |
| Facturas con fecha de pago útil | 38.0% (294.264) |
| Retraso mediano en las útiles | 6 días (p95: 123) |
| Empresas con ≥20 facturas útiles | 561 de 784 |
| Cartera viva (`pending_amount` > 0) | 25,7% de las facturas, en 739 empresas |
<!-- /AUTO -->

**Dirección de la factura: confirmada.** El signo sí identifica la dirección.
Lo comprobamos cruzando por `counterparty_id` el signo de la factura con el
signo del dinero en el banco para esa misma contraparte, que es un contraste
directo. El contraste ingenuo (correlacionar importes facturados con cobros y
pagos del mes) **no vale**: sale simétrico porque lo domina el tamaño de la
empresa.

**`payment_date` es mayormente fecha rellenada, no pago observado.** Coincide
con `due_date` en la mayoría de las facturas, y casi siempre en las `overdue`.
Promediar esas filas aplasta cualquier métrica de retraso contra cero: antes de
filtrar, el retraso mediano salía 0 días; después, 5 y 6 días según el lado, y
el ICC de esas señales subió de 0,27 a 0,42. El panel ya calcula el
comportamiento de pago solo sobre las facturas con fecha informativa y guarda
el recuento (`ar_util_n`, `ap_util_n`) para poder ponderar confianza.

**El CSV no está aleatorizado.** Leer con `nrows` da un retrato falso: en las
primeras 400.000 filas de `invoices.csv` las facturas vencidas eran el 0,05%,
cuando en el fichero completo son el 22%. No perfilar por muestreo de cabecera.

**`status` y `pending_amount` son foto de extracción, no historia.** Usarlos
como feature de un mes anterior es fuga de futuro: una factura emitida en
2025-03 no estaba vencida entonces. Lo mismo con `balances.csv` y
`debt_products.outstanding`.

**Hay cartera viva de verdad.** Una cuarta parte de las facturas tiene
`pending_amount > 0`, repartida en 739 empresas. Es la base elegible que
necesita cualquier producto de circulante.

## 5. Trasvases de caja: casi la mitad de los euros no son actividad

Hay movimiento de tesorería en dos formas, y las dos son enormes en volumen:
entre cuentas de la misma empresa, y entre empresas del mismo grupo.

<!-- AUTO:intragrupo -->
| Medida | Valor |
| --- | --- |
| Espejos entre cuentas de la misma empresa | 33.601 pares, 32.532 M€, 25,9% de la salida |
| Espejos entre empresas del mismo grupo | 54.943 pares, 25.004 M€, 19,9% de la salida |
| Grupos multiempresa que trasvasan | 158 de 179 |
| Espejos etiquetados como `transfer` | 36,3% |
| Espejos colados como `payment` o `collection` | 39,5% |
| Espejos en la empresa mediana | 7,9% |
| Empresas con >50% de su salida en espejos | 137 |
| Empresas con entrada neta del grupo | 476 |
| …que dependen del grupo en >25% / >50% / >90% de su entrada | 153 / 90 / 11 |
<!-- /AUTO -->

Las dos cifras se calculan por separado y pueden solaparse en algún movimiento,
así que el conjunto es "hasta un 46% de los euros que salen", no la suma
exacta. Y el reparto importa: ese porcentaje está dominado por unas pocas
empresas que son tuberías de cash pooling, mientras que para la empresa mediana
los espejos rondan el 8% de su salida.

**No se pueden filtrar por categoría.** Solo un tercio de los movimientos
espejo intragrupo está etiquetado como `transfer`. El resto va como `payment`,
como `collection` o sin categoría. Una lista de exclusión por categoría deja
pasar dos tercios del trasvase, y encima colado dentro de `collection`, que es
justo lo que alimenta el margen operativo. Hay que detectarlos por
emparejamiento espejo: mismo importe al céntimo, signo opuesto, misma fecha,
emparejados uno a uno.

**Resuelve el misterio de los outliers de tamaño.** Las empresas con salidas de
miles de millones no son empresas grandes, son vehículos: varias tienen entre
el 96% y el 100% de su salida en espejos.

**Y genera una señal de riesgo de primer orden: la dependencia intragrupo.**
Hay empresas cuya entrada procede casi íntegramente de sus hermanas; el caso
extremo ingresa 455.000 € en veinticuatro meses y son todos del grupo. Esas
empresas no generan caja, y un score de generación de caja les pone una nota
que no significa nada. Para el producto es peor: darles una línea de circulante
contra ese flujo es prestar contra el dinero de la matriz. Conviene tratarlo
como feature explícita, no solo como limpieza — poder decirle a un banco qué
parte de la caja de una filial se la pone su matriz es justo lo que no se ve en
unas cuentas anuales.

Esto refuerza además el `GroupKFold`: las filiales no solo comparten generador,
comparten literalmente los mismos euros.

Fiabilidad del método: restringiendo a importes de 1.000 € o más el volumen
detectado no se mueve, lo que indica que está dominado por importes grandes,
donde la coincidencia casual es muy improbable. Se escapan los trasvases con
fecha valor distinta o con comisión de por medio, así que estas cifras son un
suelo.

## 6. Receta de entrenamiento

1. **Objetivo continuo**: fracción de meses en estrés en el horizonte, y
   entrenar un ranker. Cubre las dos direcciones con un solo modelo, porque la
   cola buena es el otro extremo del mismo número.
2. **Tres cortes de validación**: `GroupKFold` por `group_id` (obligatorio),
   holdout temporal (entrenar hasta 2025-09), y **holdout de arranque en frío**
   truncando la historia de las empresas reservadas a 6, 9 y 12 meses. El
   tercero es el que predice el resultado en el leaderboard.
3. **Features**: rango percentil por mes de calendario (se lleva el ramp de
   onboarding y la deriva global), winsorizado 1/99, `log1p` para escala,
   indicadores explícitos de disponibilidad en vez de imputación, booster con
   nulos nativos, y peso por empresa para que las de 25 meses no valgan tres
   veces más que las de 8.
4. **Control de artefactos**: "tener deuda" o "tener ERP" predice porque marca
   qué empresas están mejor conectadas a la plataforma, no riesgo. Entrenar con
   y sin esos indicadores y comparar; si la mejora viene de ahí, es humo.
5. **Calibración a un ancla externa**: la prevalencia de nuestra etiqueta no es
   la tasa real de impago. Nuestra etiqueta marca "mes con la caja justa y
   facturas pagadas tarde", que en pymes pasa mucho; que la empresa no devuelva
   el dinero pasa en el entorno del 2–4% anual. Sin corregir, una empresa media
   cotizaría al 15% y la fórmula del límite le ofrecería seis veces menos línea
   de la que le corresponde.

   Se corrige manteniendo el **orden** que da el modelo, que es lo único que
   mide el leaderboard, y desplazando el nivel con un offset en el logit:

   ```text
   logit(PD_cal) = logit(PD_modelo) + ln[ (π_obj/(1-π_obj)) / (π_mod/(1-π_mod)) ]
   ```

   Con π_mod ≈ 0,18 y π_obj = 0,03 el offset ronda −1,9: 5% pasa a 0,8%, 40% a
   8,9%, y la media cae al 3% por construcción. En banca es calibración a la
   tendencia central. **No toca el score ni el leaderboard**, solo la capa de
   producto. Hay que citar la fuente del ancla y declararla como hipótesis.

## 7. Pendiente de cuadrar

`balances.csv` solo tiene foto a 2026-09-01, así que el saldo histórico se
reconstruye hacia atrás con `saldo_t = saldo_final − flujos posteriores`. Queda
un porcentaje de meses con caja negativa que puede ser descubierto real o error
de reconstrucción, porque `balances.csv` no cubre exactamente los mismos
productos que tienen movimientos. Hay que cuadrarlo antes de usar `cash_days`
en producción.

## Cómo reproducirlo

```bash
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r analysis\requirements.txt
.\.venv\Scripts\python.exe analysis\fx.py          # valida la tabla de divisas
.\.venv\Scripts\python.exe analysis\01_panel.py    # ~90 s, genera panel.parquet
.\.venv\Scripts\python.exe analysis\02_balance.py
.\.venv\Scripts\python.exe analysis\03_trend.py
.\.venv\Scripts\python.exe analysis\05_validate.py
.\.venv\Scripts\python.exe analysis\07_intragroup.py
.\.venv\Scripts\python.exe analysis\06_report.py   # reescribe las cifras de este doc
```

`00_recon.py` (vocabularios de cada fichero) y `04_currencies.py` (inventario de
divisas) son independientes. Los `.parquet` y `metrics.json` son artefactos
derivados; los primeros están en `.gitignore` y se regeneran con `01_panel.py`.

Para comprobar en una revisión que el documento no se ha quedado atrás:

```bash
.\.venv\Scripts\python.exe analysis\06_report.py --check
```
