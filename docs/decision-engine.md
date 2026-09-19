# Motor de decisión — especificación para desarrollo v1.0

> Estado implementado: consume scoring `scoreSolo-holding-v7`. El apoyo positivo del holding
> puede abrir una ruta condicionada a aval cuando `scoreSolo < 45`, `scoreGrupo ≥ 45` y el
> `ajusteHolding` es positivo, aunque no alcance el umbral habitual de `requiereAvalMatriz`.

La entrada autónoma se llama `scoreSolo`; no existe un campo numérico `score`
en la fila TypeScript de scoring. `proyectar` mapea `scoreSolo` → `DecisionInput.score`,
`estadoSolo` → `estado` y `ajusteHolding`. `scoreGrupo` y
`estadoGrupo` describen el holding; la decisión conserva la peor banda actual
entre Solo y Grupo. El apoyo positivo de `scoreGrupo` solo entra por la ruta
condicionada a aval solidario.

La ruta de aval conserva las puertas duras: impagos, morosidad grave, déficit persistente,
cross-default y falta de evidencia no pueden ser superados por el holding. Cuando la ruta se
activa, la fila publica `condicionAvalMatriz` y añade `[Requiere Aval Solidario de Matriz]` al
motivo de acción.

Una `alertaPignoracionCaja` impide `ampliar`, limita el plazo a 90 días y añade
`[Alerta: Requiere Pignoración de Caja / Cortafuegos]`. La revisión EWI mantiene el tope de
60 días, por lo que ambos límites se combinan con el mínimo. Un forecast autónomo conectado que
cae 5 puntos o más también bloquea una ampliación aunque conserve la misma banda; un forecast en
sombra no modifica la decisión.

Si el techo consolidado prorratea una línea elegible hasta cero, el cierre es exclusivo del grupo
y no inicia la cuarentena de reapertura. Una puerta de elegibilidad propia sí conserva la
cuarentena configurada.

La postura de riesgo observada para el banco pertenece a un playbook separado. Puede usar el
historial de `DecisionRow` para describir la reacción de la empresa ante alertas, pero no es una
puerta adicional ni puede relajar una decisión de `elegibilidad`. La empresa recibe el playbook
operativo; el partner financiero recibe además la clasificación `prudente`, `equilibrada`,
`tolerante` o `no_evaluable`, siempre con su evidencia y confianza.

`revisionStage2Candidata` es una señal interna de revisión. Impide ampliar y limita a 60 días
el plazo tanto de líneas vivas como de nuevas aperturas; no se presenta como clasificación
regulatoria formal.

> Implementa §3 de [`SOURCE.md`](./SOURCE.md) (decisiones 11, 12, 17-23, 37 y
> el contrato mínimo 43-47, validadas 19-09-2026). Sustituye a §8 de
> `scoring-engine.md`. Si algo aquí contradice a `SOURCE.md`, manda `SOURCE.md`
> y se corrige esto. Determinista, sin LLM, sin estado oculto: misma entrada →
> misma salida.

## 0. Qué hace

Por cada empresa y cierre de mes, a partir de la fila del score, responde:

1. ¿Te puedo prestar? → `elegible` + `motivo`.
2. Cuánto → `L` (límite máximo, €).
3. Plazo → `T_max` (días).
4. Interés → `TAE` de cada combinación (cantidad, plazo).
5. Menú → lista de opciones `(plazo, cantidad_max, TAE, coste)`.
6. Acción frente al mes anterior → `abrir | ampliar | mantener | reducir | cerrar`.

Un solo límite `L` sirve para anticipar cobros o aplazar pagos; el uso solo
fija el plazo natural (§6).

**Por qué solo el score** (decisión 43). Scoring ya hizo el trabajo de
interpretar los datos: tres bloques, 14 variables, una confianza por variable,
dirección a 3 meses y alertas con su mes de inicio. Cuando el motor de decisión
volvía además a leer los flujos a 6 meses, `racha_B2`, `racha_deficit`, `C4`,
`C3_dias`, `capacidad_cuota_adv` y los flujos consolidados del grupo, estaba
decidiendo **dos veces sobre la misma evidencia**: con dos umbrales distintos,
con dos escenarios de estrés distintos (la decisión 40 nació solo para arbitrar
entre ellos) y sin forma de explicar en la ficha por qué el score decía una cosa
y el grifo otra. Este motor lee el score, sus pilares, la tendencia, las alertas,
el bloque de grupo y **una** variable en euros, `tamano`, porque un límite es un
importe y necesita una escala. La cadena de justificación queda en una línea:
dato → variable → pilar → score → decisión.

## 1. Entrada: `DecisionInput`

El motor **no** lee `ScoreRow`. Lee la proyección de la decisión 43, que
`proyectar` construye en `input.ts` y que es el único punto de contacto con el
contrato de scoring. `decideGroup` sigue aceptando filas de score y proyecta
dentro, así que el pipeline no cambia.

| Campo                          | Tipo                                     | De `ScoreRow`               | Para qué                                                         |
| ------------------------------ | ---------------------------------------- | --------------------------- | ---------------------------------------------------------------- |
| `company`, `month`, `group_id` | id, `YYYY-MM`, id                        | igual                       | clave y agrupación (§12)                                         |
| `version_scoring`              | texto                                    | `version_parametros`        | trazabilidad (§10)                                               |
| `score`                        | 0-100                                    | `scoreSolo`                 | banda (§4), puerta `estado` (§3), plazo (§5)                     |
| `confianza`                    | 0-1                                      | igual                       | puerta `historia` (§3), recorte de `L` (§4), prima (§6)          |
| `subscores {A,B,C}`            | 0-100                                    | igual                       | puertas de pilar (§3), `factor_A` (§4)                           |
| `estado`                       | `sana \| vigilar \| riesgo \| sin_datos` | `estadoSolo`                | ficha                                                            |
| `direccion`                    | `mejora \| estable \| deterioro`         | igual                       | banda efectiva (§4), plazo (§5), precio (§6)                     |
| `naturaleza`                   | `temporal \| estructural \| sin_cambio`  | igual                       | banda efectiva (§4), plazo (§5), acción (§8)                     |
| `tend_score_3m`                | número o null                            | igual                       | `motivo_accion` (§11)                                            |
| `tend_3m {A,B,C}`              | número o null                            | igual                       | `motivo_accion` (§11)                                            |
| `alertas`                      | `AlertTipo[]`                            | `alertas[].tipo`            | puertas de pilar (§3)                                            |
| `D1`, `D5`, `ajusteHolding`    | 0-1, 0-1, puntos                         | `D1`, `D5`, `ajusteHolding` | cross-default y ficha (§9)                                       |
| `tamano`                       | €                                        | `cobros_op_media3m`         | **única** variable en euros: escala de `L` (§4) y del techo (§9) |

Lo que **no** entra, y por qué: `cobros_op_media6m`, `pagos_op_media6m`,
`servicio_deuda_media6m` y `capacidad_cuota_adv` (los sustituye el pilar A, §4);
`racha_B2`, `racha_deficit` y `C4` (los sustituyen sus alertas, §3); `C3_dias`
(el plazo natural pasa a ser el parámetro, §6); los flujos consolidados del
grupo (el techo se mide sobre `Σ tamano`, §9); `senales`, `cobertura`,
`variables`, `delta_contrib` y `estadoGrupo` (el holding ya está en
`ajusteHolding`; `scoreGrupo` se usa para conservar una banda peor del holding
o en la ruta condicionada a aval). El acierto de banda del forecast puede empatar con el
baseline para conectar el objetivo, siempre que su MAE sea estrictamente menor.

De `company_month_forecast` (forecast-engine §8), mismo mes. El pipeline
calcula siempre la previsión, pero cada objetivo se conecta solo si su ajuste
fuera de muestra mejora estrictamente al baseline en MAE y alcanza al menos el mismo acierto de
banda.
Cuando llega con `metodo = "desconectado"`, queda en modo sombra: opera con
`banda_pred_3m = banda` y deja `banda_pred_3m_usada = null` en la salida.

| Campo                                                  | Uso                                                                 |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| `banda_pred_3m`                                        | plazo (§5), interés (§6), acción (§8)                               |
| `score_pred_3m`, `direccion_pred`, `prob_deterioro_6m` | solo `motivo` y ficha                                               |
| `metodo`                                               | si `desconectado`, se ignora la previsión (`banda_pred_3m = banda`) |

Y del propio motor, mes anterior (§8 estado): `L_prev`, `accion_prev`,
`meses_elegible_seguidos`, `meses_reduccion_seguidos`,
`meses_pred_peor_seguidos`, `cerrado_desde`, `meses_puerta_blanda_seguidos`.

## 2. Parámetros (versionados, un solo fichero)

Todos los números del algoritmo viven en una tabla de parámetros con
`version_parametros`. Ningún número suelto en código.

| Grupo        | Parámetro                                     | Valor                                           | Decisión |
| ------------ | --------------------------------------------- | ----------------------------------------------- | -------- |
| Elegibilidad | `conf_min`                                    | 0,4                                             | 18, 39   |
|              | `score_min`                                   | 45                                              | 5, 18    |
|              | `umbral_pilar`                                | A 50 · B 60 · C 50                              | 44       |
|              | `cierre_confirmado_meses`                     | 2                                               | 42       |
|              | `puertas_blandas`                             | `historia`, `caja` (solo el umbral del pilar A) | 42, 44   |
| Límite       | `anticipo_pct`                                | 0,80                                            | 11       |
|              | `anticipo_meses`                              | 3                                               | 11       |
|              | `conf_ref`                                    | 0,6                                             | 12       |
|              | `factor_A_ref`                                | 70                                              | 45       |
| Bandas       | `banda_A_min` / `banda_B_min` / `banda_C_min` | 75 / 60 / 45                                    | 12       |
|              | `factor_banda`                                | A 1,0 · B 0,7 · C 0,4 · D 0                     | 12       |
|              | `base_TAE`                                    | A 0,05 · B 0,07 · C 0,10                        | 12, 21   |
| Plazo        | `T_max` (d)                                   | ver §5                                          | 20       |
|              | `plazos_menu` (d)                             | 30, 60, 90, 120, 180                            | 19       |
|              | `rampa_dias`                                  | 180                                             | 46       |
|              | `plazo_natural_defecto` (d)                   | 60 (único, `C3_dias` sale del contrato)         | 22, 43   |
| Interés      | `prima_plazo_pp_30d`                          | 0,005                                           | 21       |
|              | `prima_confianza_pp`                          | 0,01 si `confianza < 0,7`                       | 21       |
|              | `ajuste_mejora_pp` / `ajuste_deterioro_pp`    | −0,005 / +0,01                                  | 21       |
|              | `base_dias`                                   | 360                                             | 21       |
| Revisión     | `ampliar_ratio` / `reducir_ratio`             | 1,15 / 0,85                                     | 12       |
|              | `reducir_meses`                               | 2                                               | 12       |
|              | `histeresis_pct`                              | 0,25                                            | 12       |
|              | `reapertura_meses`                            | 2                                               | 23       |
| Previsión    | `prima_prevision_pp`                          | 0,005 si `banda_pred_3m < banda`                | 37       |
|              | `reducir_prev_meses`                          | 2                                               | 37       |
|              | `redondeo_L`                                  | 1.000 €                                         | 12       |
| Grupo        | `D1_cross_default`                            | 0,30                                            | 17       |
| Métricas     | `uso_simulado`                                | 0,6 del `L_vigente`                             | §14      |

**Parámetros retirados** (decisiones 43-47): `estres_cobros`, `estres_pagos`,
`cobertura_min` y `meses_limite_cap` medían una capacidad de cuota en euros que
ya no se calcula (la sustituye `factor_A`, §4); `racha_B2_max`,
`racha_deficit_max` y `C4_max` ponían umbral a variables que salen del contrato
de entrada (las sustituyen las alertas, §3); `techo_cero_baja_banda` gobernaba
una regla que desaparece con su causa (§9). El estrés de scoring (−20 %/+10 %)
no se toca: sigue alimentando `D3` del aval de grupo, que es otra pregunta
—si el padre **puede avalar**— y vive en `scoring-engine.md`.

## 3. Paso 0 — Elegibilidad

Orden fijo. La primera puerta que falla es el `motivo`; se evalúan todas
igualmente para `puertas_fallidas[]` (la ficha las enseña todas).

```text
function elegibilidad(entrada, estado_prev, P):
    alerta = lambda t: t in entrada.alertas
    puertas = [
      ("historia",   entrada.confianza >= P.conf_min),
      ("estado",     entrada.score >= P.score_min),
      ("fiabilidad", not alerta("impago_obligaciones") and entrada.subscores.B >= P.umbral_pilar.B),
      ("caja",       not alerta("deficit_persistente") and entrada.subscores.A >= P.umbral_pilar.A),
      ("clientes",   not alerta("vencido_alto")        and entrada.subscores.C >= P.umbral_pilar.C),
      ("grupo",      not estado_prev.cross_default_activo),
    ]
    fallidas = [nombre for (nombre, ok) in puertas if not ok]
    return (len(fallidas) == 0, fallidas[0] if fallidas else null, fallidas)
```

**Decisión 44 — puertas por pilar y alerta.** Tres puertas se leen del pilar del
score y de su alerta, no de la variable cruda, que sale del contrato de entrada
con la decisión 43:

| Puerta     | Antes                                               | Ahora                                    | Evidencia (run 2026-08)                            |
| ---------- | --------------------------------------------------- | ---------------------------------------- | -------------------------------------------------- |
| fiabilidad | `racha_B2 ≤ 1`                                      | sin `impago_obligaciones` **y** `B ≥ 60` | la alerta coincide 56/56 con `racha_B2 ≥ 2`        |
| caja       | `racha_deficit ≤ 2` **y** `capacidad_cuota_adv > 0` | sin `deficit_persistente` **y** `A ≥ 50` | la alerta coincide 280/280 con `racha_deficit > 2` |
| clientes   | `C4 ≤ 0,40`                                         | sin `vencido_alto` **y** `C ≥ 50`        | la alerta coincide 242/242 con `C4 > 40 %`         |

- Las tres alertas reproducen **1:1** las puertas crudas que sustituyen, así que
  el cambio de fuente no pierde señal; el pilar añade el matiz continuo que el
  umbral binario no tenía (una empresa con `C4 = 39 %` y concentración alta ya
  no pasa de largo).
- La **puerta de capacidad en euros desaparece**: no mapeaba a ningún pilar —era
  otra medida de lo mismo, con otro estrés— y era la que cerraba a media
  cartera por falta de dato de cobros, no por riesgo.
- Umbrales 50 / 60 / 50 sobre la escala del score. 60 en fiabilidad porque no
  pagar lo que ya se debe es la peor de las tres señales; 50 en caja y clientes,
  que es el corte de "vigilar" del estado (§1.5 SOURCE).
- Efecto medido: pasan las cinco puertas propias en 2026-08, 153 → 297 empresas.
- `cross_default_activo` viene del estado de grupo del mes anterior (§9).
- **`conf_min = 0,4`** (decisión 39). La mediana de confianza de la cartera en
  2026-08 es 0,44: el tramo 0,4-0,5 son cinco meses de historia con cobertura
  buena, no "sin datos" (eso es 0,3). La confianza sigue descontando por encima
  de la puerta —límite `× min(1, conf/0,6)` y precio `+1 pp` por debajo de 0,7—,
  así que la puerta solo decide **si opinamos**, no cuánto.

**Puertas blandas y duras** (decisiones 42 y 44). `historia` y la mitad de `caja`
que mira el **umbral del pilar A** son **blandas**: no cierran el primer mes. Con línea viva (`L_prev > 0`),
un fallo blando exige `cierre_confirmado_meses` (2) meses **seguidos** antes de
cerrar:

```text
if not elegible:
    blando = todas las puertas fallidas estan en P.puertas_blandas
             and (caja no ha fallado or caja_solo_capacidad)
    if blando and estado_prev.L_prev > 0
       and estado_prev.meses_puerta_blanda_seguidos + 1 < P.cierre_confirmado_meses:
        return accion "mantener", L = 0, L_vigente = L_prev, cierre_pendiente = true
    return accion "cerrar", L = 0, L_vigente = 0
estado.meses_puerta_blanda_seguidos = blando ? prev + 1 : 0
```

- El mes de gracia **no** es elegible (`elegible = false`, `motivo` = el de la
  puerta) y no cuenta como mes elegible para la reapertura; `motivo_accion` sale
  como "Pendiente confirmar cierre: {motivo}" y el menú se calcula sobre
  `L_vigente` (vacío si la capacidad ya no da para ningún plazo).
- `estado`, `fiabilidad`, `clientes`, `grupo` y la alerta `deficit_persistente`
  cierran el mismo mes: son hechos, no umbrales que tiritan.
- `caja_solo_capacidad` distingue las dos mitades de la puerta: solo es blanda
  cuando **no** hay alerta `deficit_persistente` y lo único que falla es el
  umbral del pilar A. La alerta es un hecho y cierra el mismo mes.
- Sin línea viva (`L_prev = 0`) no hay nada que conservar: cierre inmediato.
- Coste: un mes más de exposición, acotado por el límite operativo. A cambio,
  334 de 1.098 empresa-mes que pasaban las puertas venían justo después de un mes
  cerrado (parpadeo en el umbral).

Motivos en texto (plantilla, sin LLM):

| Puerta     | Texto                                                                      |
| ---------- | -------------------------------------------------------------------------- |
| historia   | "Historial insuficiente: confianza {conf} < 0,4"                           |
| estado     | "Score {score} por debajo de 45"                                           |
| fiabilidad | "Impago de obligaciones (alerta)" / "Fiabilidad {B} por debajo de 60"      |
| caja       | "Déficit persistente (alerta)" / "Capacidad de deuda {A} por debajo de 50" |
| clientes   | "Vencido alto (alerta)" / "Clientes {C} por debajo de 50"                  |
| grupo      | "Cierre de {empresa} ({D1} % del grupo)"                                   |

Cada puerta de pilar tiene dos textos, uno por mitad: la ficha dice si ha
fallado la alerta (hecho) o el umbral (matiz), sin tener que enseñar una
variable cruda que el motor ya no lee.

## 4. Paso 1 — Cantidad: límite L

```text
function banda(score, P):
    if score >= P.banda_A_min: return "A"
    if score >= P.banda_B_min: return "B"
    if score >= P.banda_C_min: return "C"
    return "D"

function banda_efectiva(entrada, P):
    b = banda(entrada.score, P)
    if entrada.direccion == "deterioro" and entrada.naturaleza == "estructural":
        b = bajar_una(b)            # A→B, B→C, C→D, D→D
    return b

function factor_A(A, P):
    return min(1, max(0, A) / P.factor_A_ref)

function limite(entrada, P):
    lim_op   = P.anticipo_pct * entrada.tamano * P.anticipo_meses
    b        = banda_efectiva(entrada, P)
    factor_c = min(1, entrada.confianza / P.conf_ref)
    factor_a = factor_A(entrada.subscores.A, P)
    L_bruto  = lim_op * P.factor_banda[b] * factor_c * factor_a
    return redondear_abajo(L_bruto, P.redondeo_L), b, lim_op, factor_a
```

**Decisión 45 — sin capacidad de cuota.** El pilar A mide exactamente lo que
medía `capacidad_cuota_adv` —si la caja aguanta más cuota— sobre las mismas
variables, ya normalizado a 0-100 y con la confianza dentro. Mantener las dos
medidas era el problema que la decisión 40 intentó arbitrar eligiendo un segundo
escenario de estrés; quitar una lo cierra. Lo que se conserva de la decisión 11
es lo que de verdad ataba el límite a la realidad: el anticipo sobre el
circulante (`lim_op`, no se presta más de lo que la empresa cobra). El pilar A
entra como factor continuo **por encima** de su puerta (§3): A 35 parte el
límite por la mitad, A 56 lo deja en 0,8 y A ≥ 70 no recorta.

Nota de calibración: con la puerta de `caja` en `A ≥ 50` y `factor_A_ref = 70`,
`factor_A` solo puede valer entre 0,71 y 1 en una fila elegible. Es
deliberado: el recorte matiza, no sustituye a la puerta.

Si no elegible → `L = 0`, pero se calculan y guardan `lim_op` y `factor_A`
igualmente (la ficha enseña "si fueras elegible tendrías X").

**Techo de grupo** (§9) se aplica después, sobre el conjunto del grupo.

## 5. Paso 2 — Plazo: T_max

```text
T_MAX = {                       # días
  "A": {"base": 180, "temporal": 120, "estructural": 60},
  "B": {"base": 120, "temporal":  90, "estructural": 30},
  "C": {"base":  60, "temporal":  30, "estructural":  0},
  "D": {"base":   0, "temporal":   0, "estructural":  0},
}

function t_max(fila, prev, P):
    b = peor(banda(fila.score, P), prev.banda_pred_3m)   # decisión 37: la previsión solo acorta
    if fila.direccion != "deterioro": return T_MAX[b]["base"]
    if fila.naturaleza == "estructural": return T_MAX[b]["estructural"]
    return T_MAX[b]["temporal"]
```

`T_max = 0` → no presta aunque fuese elegible: `elegible = false`,
`motivo = "Deterioro estructural en banda C"`.

Nota: en §4 el deterioro estructural baja la banda (menos cantidad); aquí
además recorta el plazo. Son dos efectos deliberados de la misma señal.

## 6. Paso 3 — Interés

```text
function tae(fila, plazo_dias, P):
    b = banda_efectiva(fila, P)
    t = P.base_TAE[b]
    t += P.prima_plazo_pp_30d * max(0, ceil((plazo_dias - 30) / 30))
    if fila.confianza < 0.7: t += P.prima_confianza_pp
    if fila.direccion == "mejora":    t += P.ajuste_mejora_pp
    if fila.direccion == "deterioro": t += P.ajuste_deterioro_pp
    # decisión 37 / SOURCE §3.3: se compara con la banda ACTUAL, no con la efectiva
    if prev.banda_pred_3m < banda(fila.score): t += P.prima_prevision_pp
    return round(t, 4)

function coste(cantidad, tae, plazo_dias, P):
    return cantidad * tae * plazo_dias / P.base_dias
```

Descomposición guardada por opción: `{base, prima_plazo, prima_confianza,
ajuste_tendencia}`. La ficha la enseña tal cual.

El desglose guardado añade `prima_prevision`.

**Plazo natural por uso** (no cambia la fórmula, solo sugiere la fila del
menú a resaltar):

| Uso              | Plazo natural                           |
| ---------------- | --------------------------------------- |
| Anticipar cobros | `plazo_natural_defecto` = 60 d          |
| Aplazar pagos    | plazo elegido por la empresa, ≤ `T_max` |

Decisión 43: `C3_dias` sale del contrato de entrada, así que el plazo natural
del anticipo es el parámetro para todas las empresas. Era una sugerencia de qué
fila del menú resaltar, nunca una restricción: el menú entero sigue disponible.

## 7. Paso 4 — Región factible y menú

```text
function menu(entrada, L, T_max, P):
    opciones = []
    for plazo in P.plazos_menu:
        if plazo > T_max: break
        cantidad_max = redondear_abajo(L * min(1, plazo / P.rampa_dias), P.redondeo_L)
        if cantidad_max <= 0: continue
        t = tae(entrada, plazo, P)
        opciones.append({plazo, cantidad_max, tae: t, coste_max: coste(cantidad_max, t, plazo, P), desglose_tae})
    return opciones
```

**Decisión 46 — el menú es una rampa.** La región factible de la decisión 19
decía algo cierto —plazo corto, cantidad pequeña; plazo largo, cantidad cerca de
`L` y más cara— con una cuenta en euros (`capacidad × plazo_meses`) que ya no
existe. La rampa dice lo mismo con un solo número: lineal en el plazo y llega a
`L` exactamente en `rampa_dias` (180 d), que es `T_max` de banda A y el plazo
máximo del producto. Con `L = 240 000`: 30 d → 40 000, 60 d → 80 000, 90 d →
120 000, 120 d → 160 000, 180 d → 240 000.

Invariantes: `cantidad_max` no decrece con el plazo; `tae` no decrece con el
plazo; toda `cantidad_max ≤ L` y `cantidad_max ≤ L × plazo / rampa_dias`.
**Menú vacío ⇒ `elegible = false`**: sin opciones no hay grifo que abrir, así
que `elegible` exige las seis puertas, `T_max > 0` **y** `len(menu) > 0`. El
`motivo` dice por qué está vacío:

| Caso                                                                         | `motivo`                                                   |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `L_vigente > 0` pero la rampa no llega al escalón de 1.000 € en ningún plazo | "Límite por debajo del escalón mínimo en todos los plazos" |
| `L_vigente = 0` esperando reapertura (§8)                                    | "Reapertura en {n} meses"                                  |
| `L_vigente = 0` porque `L = 0` (banda D o tamaño nulo)                       | "Límite a cero"                                            |

Validación de una petición concreta `(cantidad, plazo)`:

```text
function valida(peticion, opciones):
    op = primera opción con op.plazo >= peticion.plazo
    return op existe and peticion.cantidad <= op.cantidad_max
```

## 8. Estado entre meses y acción

Estado por empresa (persistido, una fila por mes):

```text
L_prev, accion_prev, meses_elegible_seguidos, meses_reduccion_seguidos,
cerrado_desde (mes o null), cross_default_activo (bool)
```

```text
function accion(fila, elegible, L, estado_prev, P):
    Lp = estado_prev.L_prev  (0 si no hay mes anterior)

    if not elegible:
        return "cerrar", L=0            # aunque Lp fuese 0: la fila registra el motivo

    if Lp == 0:
        # reapertura: exige reapertura_meses seguidos elegible si venía de un cierre
        if estado_prev.cerrado_desde is not null and estado_prev.meses_elegible_seguidos + 1 < P.reapertura_meses:
            return "mantener", L=0
        return "abrir", L

    # histéresis: el límite vigente solo se mueve ±25 % al mes
    L_acotado = clip(L, Lp * (1 - P.histeresis_pct), Lp * (1 + P.histeresis_pct))

    if fila.direccion == "deterioro" and fila.naturaleza == "estructural" and L < Lp:
        return "reducir", L            # inmediato y sin histéresis: la señal manda

    # reducción preventiva (decisión 37): la banda prevista lleva dos meses por debajo de la actual
    if prev.banda_pred_3m < banda(fila.score) and estado_prev.meses_pred_peor_seguidos + 1 >= P.reducir_prev_meses:
        L_pred = limite con factor_banda[prev.banda_pred_3m]
        if L_pred < Lp: return "reducir", max(L_pred, Lp * (1 - P.histeresis_pct))

    if L > P.ampliar_ratio * Lp and fila.direccion != "deterioro" and prev.banda_pred_3m >= banda(fila.score):
        return "ampliar", L_acotado

    if L < P.reducir_ratio * Lp:
        if estado_prev.meses_reduccion_seguidos + 1 >= P.reducir_meses:
            return "reducir", L_acotado
        return "mantener", Lp          # primer mes por debajo: se espera confirmación

    return "mantener", Lp
```

Actualización del estado tras decidir:

```text
meses_elegible_seguidos  = elegible ? prev + 1 : 0
meses_reduccion_seguidos = (L < reducir_ratio * Lp) ? prev + 1 : 0
meses_pred_peor_seguidos = (banda_pred_3m < banda(fila.score)) ? prev + 1 : 0
cerrado_desde            = accion == "cerrar" ? mes : (accion == "abrir" ? null : prev)
L_prev                   = L_vigente (el devuelto por accion)
```

La previsión se compara **siempre con la banda actual** (`banda(fila.score)`),
nunca con la efectiva (SOURCE §3.6, decisión 37). Si se comparase con la
efectiva, un deterioro estructural o un escalón de cross-default que ya bajó la
banda taparía la señal de la previsión. Vale para el plazo (§5), el interés (§6)
y la acción.

Lo dispuesto no se toca al cerrar: el motor no gestiona disposiciones, solo
límites. "Cierre" = `L_vigente = 0` = sin nuevas disposiciones.

## 9. Grupo: techo y cross-default

Se ejecuta **después** de calcular todas las empresas del grupo en el mes.

```text
function limite_grupo(entradas_mes, P):                        # decisión 47
    tamano = Σ entradas_mes[i].tamano
    peso   = tamano > 0 ? (por tamaño) : (media simple)
    score  = media_ponderada(entradas_mes[i].score, peso)
    conf   = media_ponderada(entradas_mes[i].confianza, peso)
    A      = media_ponderada(entradas_mes[i].subscores.A, peso)
    lim_op = P.anticipo_pct * tamano * P.anticipo_meses
    return redondear_abajo(lim_op * P.factor_banda[banda(score, P)]
                           * min(1, conf / P.conf_ref) * factor_A(A, P), P.redondeo_L)

function grupo(entradas_mes, decisiones, P):
    # 1. techo: Σ L ≤ L_grupo
    L_grupo = limite_grupo(entradas_mes, P)
    suma = Σ decisiones[i].L_vigente
    if suma > L_grupo:
        for i: decisiones[i].L_vigente = redondear_abajo(decisiones[i].L_vigente * L_grupo / suma, P.redondeo_L)
        marcar motivo_grupo = "Techo de grupo: {L_grupo} €"

    # 2. cross-default
    caidas = [i for i in filas_grupo if decisiones[i].accion == "cerrar" and filas_grupo[i].D1 >= P.D1_cross_default]
    for i in filas_grupo si i no está en caidas:
        estado[i].cross_default_activo = len(caidas) > 0
        # efecto en el mes siguiente: puerta "grupo" falla → cerrar.
        # efecto en este mes: banda baja un escalón y se recalcula L (sin aval de la caída, que ya viene del score)
        if caidas: recalcular limite con banda_efectiva bajada una posición
```

- El aval en puntos ya lo quita el motor de score (recalcula `aval_grupo`
  sin la empresa caída). Aquí solo se aplica el escalón de banda y el techo.
- **Decisión 47 — el techo se mide sobre `Σ tamano`.** El grupo se trata como
  una sola empresa con la fórmula de §4: `lim_op` sobre la suma de tamaños de
  los miembros **presentes ese mes**, y score, confianza y pilar A ponderados
  por ese mismo tamaño (media simple si `Σ tamano = 0`). Quien mueve el dinero
  del grupo es quien manda en la banda y en los dos recortes. Desaparece la
  desviación que había que documentar antes (el `limite_op` del grupo usaba la
  media de 6 meses porque no existía una de 3 meses consolidada): ahora es
  exactamente la misma variable que en §4, sumada.
- Una **caída** es un cierre nuevo y propio: no cuentan los cierres cuya única
  puerta fallida es `grupo` (eso es el contagio que causó otra empresa) ni los de
  una empresa que ya llegaba cerrada al mes. Sin estas dos exclusiones A tumba a
  B, el cierre de B vuelve a marcar a A y ninguna de las dos reabre nunca.
- `cross_default_activo` se levanta con cualquiera de las dos reglas: cuando la
  empresa caída vuelve a `abrir` (`L_vigente > 0`) o cuando la afectada lleva
  `reapertura_meses` meses seguidos con la bandera encendida
  (`meses_con_cross_default`). Si la causante no tiene fila ese mes, la bandera
  se levanta (fail-open). Al levantarse, la empresa vuelve por el camino normal
  de reapertura.
- El techo y el límite individual se miden con la misma vara: la fórmula de §4,
  la misma variable de tamaño y los mismos factores.
- **El techo cero de la decisión 41 se retira** (decisión 47). Aquella regla
  —`L_grupo = 0` ⇒ los miembros vivos bajan una banda en vez de prorratear a
  cero— existía porque el techo se medía sobre la caja consolidada estresada, y
  las hermanas sin datos aportaban pagos clasificados y pocos cobros: la caja se
  iba a negativo **por falta de dato**, no por riesgo, y el prorrateo cerraba al
  único miembro solvente (34 de las 79 empresas que pasaban las puertas en
  2026-08; 637 de 1.098 empresa-mes). Sumando tamaños esa asimetría desaparece
  por la raíz: un tamaño desconocido suma 0, no resta. Con eso `L_grupo = 0`
  solo puede pasar si el grupo está en banda D o si `Σ tamano = 0`, y en los dos
  casos el límite individual de cada miembro ya es 0 por la misma razón: no hay
  nada que prorratear a cero ni banda que bajar. Se retiran `modo: "bajaBanda"`,
  `afectadas_techo`, `MOTIVO_TECHO_CERO` y `techo_cero_baja_banda`; el prorrateo
  vuelve a ser la única regla de techo y el escalón de banda, como mucho de una
  posición, es solo el del cross-default. Efecto medido: filas con `motivo_grupo`
  en 2026-08, 361 → 59.

## 10. Salida: contrato

Tabla `company_month_decision`, una fila por `company_id` × `mes`:

```text
company_id, mes, version_parametros
elegible              bool  (seis puertas + T_max > 0 + menú no vacío)
motivo                texto (null si y solo si elegible)
puertas_fallidas      [str]
cierre_pendiente      bool  (decisión 42: mes de gracia de una puerta blanda)
banda                 A|B|C|D            (sin recorte)
banda_efectiva        A|B|C|D            (con recorte estructural / cross-default)
tamano                €/mes  (media3m de cobros_op: la escala con la que se decidió)
factor_A              0-1    (min(1, A / 70), decisión 45)
limite_op             € (0,8 × tamano × 3, anticipo bruto)
L                     € (recomendado este mes, antes de histéresis y techo)
L_vigente             € (tras acción, histéresis y techo de grupo)
T_max                 días
menu                  [{plazo, cantidad_max, tae, coste_max, desglose_tae}]
plazo_natural_anticipo días
accion                abrir|ampliar|mantener|reducir|cerrar
motivo_accion         texto (plantilla)
motivo_grupo          texto o null
banda_pred_3m_usada   A|B|C|D (null si previsión desconectada)
estado                {L_prev, accion_prev, meses_elegible_seguidos, meses_reduccion_seguidos,
                       meses_pred_peor_seguidos, cerrado_desde, cross_default_activo,
                       causa_cross_default, meses_con_cross_default,
                       meses_puerta_blanda_seguidos}
```

`L` y `L_vigente` se guardan los dos: la ficha enseña "recomendado 120 k,
vigente 100 k (subida limitada al 25 %)".

Decisión 43: salen del contrato `capacidad_cuota_adv` y `limite_cap` (ya no se
calculan) y entran `tamano` y `factor_A`, que son los dos números con los que se
ha decidido el límite. Con `cierre_pendiente = true` la fila sale
`elegible = false` con el `motivo` de la puerta, `L = 0` y `L_vigente = L_prev`.

## 11. Plantillas de `motivo_accion`

| Acción   | Texto                                                                                                                                                                                                                                |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| abrir    | "Elegible: score {score} (banda {b}), límite {L} € hasta {T_max} d"                                                                                                                                                                  |
| ampliar  | "Límite sube de {Lp} a {L_vigente} €: {pilar con mayor \|tend_3m\|}"                                                                                                                                                                 |
| reducir  | "Límite baja de {Lp} a {L_vigente} €: {motivo = deterioro estructural \| 2 meses por debajo \| previsión: banda {banda_pred_3m} en 3 meses \| cross-default de {empresa causante} \| techo de grupo}, {pilar con mayor \|tend_3m\|}" |
| cerrar   | "{motivo de §3}"                                                                                                                                                                                                                     |
| mantener | "Sin cambios: score {score}, límite {Lp} €" / "Reapertura en {n} meses" / "Pendiente confirmar bajada" / "Pendiente confirmar cierre: {motivo de §3}" (decisión 42, manda sobre las otras)                                           |

Decisión 43: el sufijo sale de la **tendencia**, que sí está en el contrato de
entrada, y no de `delta_contrib`, que era la cascada entera de scoring. Se elige
el pilar con mayor `|tend_3m|` ("A -3,2"); si ningún pilar tiene tendencia, se
usa `tend_score_3m` ("score -2,5"); si tampoco, "sin cambios".

## 12. Orden de ejecución por mes

```text
for mes in meses:
    filas = score[mes]
    for empresa: elegible, L, T_max, menu, accion (con estado[mes-1])
    for grupo:   techo + cross-default (ajusta L_vigente, banda_efectiva, estado)
    persistir company_month_decision[mes] y estado[mes]
```

Mes 1 (`2024-09` o primer mes con score): `L_prev = 0`, sin cierre previo →
`abrir` directo si elegible.

## 13. Fixtures y tests

Fixtures escritas en los términos del contrato de la decisión 43 —score,
pilares, alertas, tendencia y tamaño— con `decisionInputFixture`. Resultado
esperado por mes escrito en el fixture, no calculado.

| Fixture                 | Perfil                                                    | Debe dar                                                                                                                                                                                                             |
| ----------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sana`                  | score 82, pilares 80, conf 0,9, estable, tamaño 100 k/mes | A · `limite_op` = 240 k, `factor_A` = 1 ⇒ L = 240 k · T_max 180 · menú 30 d → 40 k, 60 d → 80 k … 180 d → 240 k · TAE 5 % → 7,5 %                                                                                    |
| `mejora`                | tamaño 50 k → 100 k, dirección mejora                     | `ampliar` cuando L > 1,15·Lp, acotado a +25 % (120 k → 150 k)                                                                                                                                                        |
| `deterioro_estructural` | score 68, estructural desde el mes 2                      | banda C efectiva (B recortada un escalón), `reducir` inmediato a 96 k, T_max 30 · si sigue en C estructural → T_max 0 → cerrar                                                                                       |
| `bache_temporal`        | un mes con el tamaño a la mitad y vuelve                  | `mantener` (histéresis y 2 meses de confirmación), nunca `reducir`                                                                                                                                                   |
| `pilar_A_bajo`          | `A = 35` (recorte) y `A = 20` (puerta)                    | 35: L se parte por la mitad, sigue elegible · 20: falla `caja` por el umbral del pilar, puerta **blanda** → mes de gracia y cierre al segundo mes                                                                    |
| `alerta_dura`           | una sola alerta de puerta                                 | `impago_obligaciones`, `deficit_persistente` o `vencido_alto` cierran el mismo mes, con su texto; `deterioro` o `contagio_grupo` no cierran nada                                                                     |
| `historial_corto`       | conf 0,3                                                  | no elegible, motivo "historia", L = 0 pero `limite_op` y `factor_A` calculados                                                                                                                                       |
| `prevision_peor`        | score 82 (A), `banda_pred_3m = C` desde el mes 2          | mes 2: `mantener`, `meses_pred_peor_seguidos = 1`, T_max 60 (peor banda), TAE +0,5 pp · mes 3: `reducir` preventivo a L con factor 0,4 acotado por histéresis (180 k) · nunca `ampliar` mientras `banda_pred_3m < A` |
| `grupo_caida`           | 2 empresas, una con D1 0,5 cierra en el mes 4             | la hermana baja una banda (L 240 k → 168 k, `reducir`) · mes 5: puerta grupo falla → cerrar · la bandera se levanta y vuelve por la reapertura normal                                                                |
| `grupo_techo`           | "a" en banda D arrastra el score ponderado a 51 (banda C) | L_grupo = 0,8 × 200 k × 3 × 0,4 = 192 k frente a Σ L = 240 k ⇒ prorrateo y `motivo_grupo`                                                                                                                            |
| `grupo_sin_tamano`      | `Σ tamano = 0`                                            | L_grupo = 0 **y** L individual = 0: nada que prorratear, `motivo_grupo = null`, nadie cierra                                                                                                                         |

Tests de propiedades (sobre todas las filas del dataset):

1. `elegible = false ⇒ L_vigente = 0`, con dos excepciones: el mes de gracia
   de una puerta blanda (`cierre_pendiente`, decisión 42) y la fila que pasa las
   seis puertas pero se queda sin menú (`T_max = 0`, o una rampa que no llega al
   escalón de `redondeo_L` en ningún plazo, §7). En los dos casos lo que falta
   es grifo que abrir este mes, no solvencia, y la línea viva no se cierra.
   Forma comprobable: `no elegible ⇒ L_vigente = 0 ∨ cierre_pendiente ∨
puertas_fallidas = []`.
2. `cantidad_max` y `tae` no decrecen con el plazo dentro de un menú, y
   `cantidad_max ≤ L_vigente × plazo / rampa_dias` en toda opción (decisión 46).
3. `|L_vigente − L_prev| ≤ 25 % · L_prev` salvo `cerrar`, `reducir` por
   deterioro estructural o `reducir` por `grupo` (escalón de cross-default y
   prorrateo del techo consolidado: los dos se aplican el mismo mes, sin
   histéresis).
4. `Σ L_vigente del grupo ≤ L_grupo`.
5. Mismo input dos veces → misma salida (sin aleatoriedad, sin fecha del sistema).
6. Cambiar cualquier parámetro cambia `version_parametros`.
7. Con `banda_pred_3m == banda` en todas las filas, la salida es idéntica a la de un motor sin previsión.
8. `proyectar` coge exactamente los campos del contrato de la decisión 43, ni uno más: comprobado sobre las claves de `DecisionInput`.

## 14. Métricas para el jurado (backtest, sobre validación)

| Métrica             | Definición                                                                                                                                                                                                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exposición evitada  | Σ `max(0, L_vigente(t−3) − L_vigente(t))` de empresas que entran en `evento_deterioro` en `t`. En v1 el retroceso es **fijo a t−3**, no el `k` variable del plan; la comparación contra un motor sin anticipación (solo banda por score sin dirección) queda como follow-up. |
| Ingresos simulados  | Σ `coste` asumiendo uso del 60 % del `L_vigente` al plazo natural. Supuesto explícito.                                                                                                                                                                                       |
| Oscilación          | % de empresa-mes con un cambio de acción; un `cerrar` repetido no cuenta. Objetivo < 20 %.                                                                                                                                                                                   |
| Cierres falsos      | `cierres` y `cierres_falsos` se publican como **recuentos brutos** (solo el mes en que se cierra, no cada mes cerrado); el ratio es `cierres_falsos / cierres` = cierres sin `evento_deterioro` en los 6 meses siguientes.                                                   |
| Lead time de cierre | mediana de meses entre primer `reducir` y `evento_deterioro`, **con y sin previsión** (decisión 38).                                                                                                                                                                         |

## 15. Fuera de alcance v1

Gestión de disposiciones y amortizaciones · pricing por riesgo del partner ·
garantías o avales formales · sector · optimización de pesos.
