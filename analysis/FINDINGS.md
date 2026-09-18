# Diagnóstico del dataset antes de entrenar

Lee esto antes de escribir una línea de modelo. Todo lo de aquí sale de
ejecutar `analysis/00_recon.py` … `analysis/03_trend.py` sobre `dataset/`; los
logs completos están en `analysis/out_*.txt` y las figuras en
`analysis/figures/`.

## 1. No hay trayectoria en los datos

Es el hallazgo que condiciona la estrategia. Para diez ratios mensuales medimos
si la pendiente de la primera mitad de la historia predice la de la segunda,
usando rangos cross-seccionales por trimestre (mata escala y outliers) y
comparando contra una nula por permutación del orden temporal dentro de cada
empresa.

| Señal | Persistencia de nivel | Persistencia de tendencia | Nula p95 |
| --- | --- | --- | --- |
| inflow | 0,855 | +0,035 | 0,088 |
| outflow | 0,854 | −0,012 | 0,108 |
| ar_hhi (concentración) | 0,754 | +0,061 | 0,097 |
| cash_days | 0,746 | −0,082 | 0,070 |
| fee_ratio | 0,738 | −0,008 | 0,088 |
| ar_dso | 0,693 | +0,126 | 0,156 |
| ap_days_late | 0,656 | −0,067 | 0,109 |
| unpaid_rate | 0,615 | −0,014 | 0,072 |

El nivel es muy persistente y por tanto aprendible. **La tendencia cae entera
dentro del ruido**: ninguna señal supera su propia nula. El índice compuesto lo
confirma con autocorrelación trimestral −0,03 al lag 1 y negativa en los lags 2
a 4 (−0,17 / −0,20 / −0,18), es decir reversión a la media, no regímenes.

Cada empresa oscila como ruido blanco alrededor de su propio nivel. Las
empresas del enunciado que van de 45 a 65 y de 82 a 68 son ilustrativas: esa
deriva no está en los agregados mensuales.

**Implicación.** Un modelo supervisado que intente aprender "quién se está
torciendo" ajusta ruido: métricas buenas con CV aleatorio y colapso en el test
oculto. La trayectoria no se aprende, se construye encima del score con un
filtro determinista (nivel + pendiente + shock tipo Holt), y la anticipación se
mide inyectando deterioros sintéticos controlados, no sobre estos datos.

## 2. El balanceo de clases no es el problema

Con etiqueta de estrés compuesta (≥2 señales simultáneas entre caja <10 días,
impagos/devoluciones en el extracto, >50% de facturas pagadas con más de 30
días de retraso, y comisiones+intereses >2% de la salida):

- 6,3% de empresa-mes en estrés; 33,8% de empresas lo tocan alguna vez
- etiqueta "estrés en los próximos 12 meses": **17,4% de positivos** sobre
  8.796 empresa-mes entrenables, un **1:5**

Eso se resuelve con pesos de clase y calibración. No hace falta SMOTE.

Ojo con el tamaño de muestra efectivo: no son 32.150 filas, son **1.286
empresas en 250 grupos**, y el **94,5% de las empresas comparte grupo** con
otra. Split aleatorio por empresa = fuga vía filiales del mismo holding.

## 3. Los desbalances que sí duelen

### Historia disponible

Mediana de 19 meses de 25, pero distribución bimodal: **415 empresas tienen
solo 7–12 meses** y un tercio no aparece hasta mediados de 2025. Toda feature
con ventana de 12 meses es nula para un tercio del dataset.

### Cobertura por bloque de información

| Bloque | Empresas | % |
| --- | --- | --- |
| Transacciones | 1.286 | 100% |
| Facturas (DSO/DPO) | 785 | 61% |
| Algún producto de deuda | 378 | 29,4% |
| Línea de crédito con `granted` | 206 | 16% |
| Cuadro de amortización | 40 | 3,1% |
| País informado | 230 | 17,9% |
| ERP informado | 745 | 57,9% |

El DSCR solo se puede calcular para el 29% de las empresas y con cuadro real
para 40. El motor de producto tiene que degradarse por niveles según lo que
exista, no imputar medianas y fingir que sabe.

### Escala y divisa (resuelto, con una salvedad)

El campo `exchange_rate` **no** convierte a EUR: convierte de `currency` a
`accounting_currency`, y para la mayoría de filas vale 1,0. Sin normalizar, los
importes de distintas divisas no son comparables: había facturas por 2,19·10¹¹
en COP que son unos 33 M EUR.

Hay 44 divisas en el dataset, pero el top 10 cubre el 98,5% de las facturas.
`analysis/fx.py` tiene la tabla (anclas de medio plazo, una por divisa, en
unidades por EUR) y convierte el 100% de las filas. Validación: tras convertir,
la mediana de factura de cada divisa cae en el mismo orden de magnitud que la
del euro (581 EUR). Las transacciones heredan la divisa de su cuenta bancaria,
porque `transactions.csv` no la trae.

Salvedad: incluso con todo en euros, el ratio p90/p10 del outflow mensual sigue
siendo de **582x**, y queda un puñado de empresas con outflow mediano de 2,9·10⁹
(COMP_1185 la peor), que son barridos de tesorería intragrupo y no operación.
Todo tiene que ser ratio o rango, nunca euros absolutos.

### Trampa de calendario

**El mes 2026-09 está truncado**: 11 transacciones por empresa frente a ~140 de
un mes normal. Cualquier feature de "último mes" o delta final ve un acantilado
falso en las 1.286 empresas. Hay que excluirlo o tratarlo como parcial.

## 4. Receta de entrenamiento

1. **Objetivo continuo**: fracción de meses en estrés en el horizonte, y
   entrenar un ranker. Cubre las dos direcciones con un solo modelo, porque la
   cola buena es el otro extremo del mismo número.
2. **Tres cortes de validación**: `GroupKFold` por `group_id` (obligatorio),
   holdout temporal (entrenar ≤2025-09), y **holdout de arranque en frío**
   truncando la historia de las empresas reservadas a 6/9/12 meses. El tercero
   es el que predice el resultado en el leaderboard.
3. **Features**: rango percentil por mes de calendario (se lleva el ramp de
   onboarding y la deriva global), winsorizado 1/99, `log1p` para escala,
   indicadores explícitos de disponibilidad en vez de imputación, booster con
   nulos nativos, y peso por empresa para que las de 25 meses no valgan tres
   veces más que las de 8.
4. **Control de artefactos**: "tener deuda" o "tener ERP" predice porque marca
   qué empresas están mejor conectadas a la plataforma, no riesgo. Entrenar con
   y sin esos indicadores y comparar; si la mejora viene de ahí, es humo.
5. **Calibración a un ancla externa**: el 17,4% de prevalencia es artefacto de
   nuestra definición de estrés, no la tasa real de impago. Nuestra etiqueta
   marca "mes con la caja justa y facturas pagadas tarde", que en pymes pasa
   mucho; que la empresa no devuelva el dinero pasa en el entorno del 2–4%
   anual. Si se mete el número sin corregir en el precio, una empresa media
   cotiza al 15% (usura) y la fórmula del límite le ofrece seis veces menos
   línea de la que le corresponde.

   Se corrige manteniendo el **orden** que da el modelo, que es lo único que
   mide el leaderboard, y desplazando el nivel con un offset en el logit:

   ```
   logit(PD_cal) = logit(PD_modelo) + ln[ (π_obj/(1-π_obj)) / (π_mod/(1-π_mod)) ]
   ```

   Con π_mod = 0,174 y π_obj = 0,03 el offset es **−1,92**. Efecto: 5% → 0,8%,
   40% → 8,9%, y la media cae al 3% por construcción. En banca esto es
   calibración a la tendencia central. **No toca el score ni el leaderboard**,
   solo la capa de producto. El número exacto no hace falta clavarlo; hay que
   citar la fuente (ratio de dudosos de crédito a empresas del Banco de España)
   y declararlo como hipótesis en el pitch.

## 5. Pendiente de cuadrar

`balances.csv` solo tiene foto a 2026-09-01, así que el saldo histórico se
reconstruye hacia atrás con `saldo_t = saldo_final − flujos posteriores`. Sale
un **8,2% de meses con caja negativa**, que puede ser descubierto real o error
de reconstrucción: `balances.csv` no cubre exactamente los mismos productos que
tienen movimientos. Hay que cuadrarlo antes de usar `cash_days` en producción.

## Cómo reproducirlo

```bash
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install pandas pyarrow matplotlib
.\.venv\Scripts\python.exe analysis\fx.py          # valida la tabla de divisas
.\.venv\Scripts\python.exe analysis\01_panel.py    # ~90 s, genera panel.parquet
.\.venv\Scripts\python.exe analysis\02_balance.py
.\.venv\Scripts\python.exe analysis\03_trend.py
```

`00_recon.py` (vocabularios de cada fichero) y `04_currencies.py` (inventario de
divisas) son independientes y se pueden lanzar en cualquier momento.

Los `.parquet` son datos derivados y están en `.gitignore`: se regeneran con
`01_panel.py`.
