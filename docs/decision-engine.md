# Motor de decisión — especificación para desarrollo v1.0

> Implementa §3 de [`SOURCE.md`](./SOURCE.md) (decisiones 11, 12, 17-23 y
> 37, validadas 19-09-2026). Sustituye a §8 de `scoring-engine.md`. Si algo
> aquí contradice a `SOURCE.md`, manda `SOURCE.md` y se corrige esto.
> Determinista, sin LLM, sin estado oculto: misma entrada → misma salida.

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

## 1. Entrada: fila del score

Del contrato de `company_month_score` (scoring-engine §1). Campos que usa el
motor de decisión, nada más:

| Campo | Tipo | Origen |
| --- | --- | --- |
| `company_id`, `mes` | id, `YYYY-MM` | clave |
| `group_id` | id | `companies.csv` |
| `score` | 0-100 | con `aval_grupo` incluido |
| `confianza` | 0-1 | |
| `direccion` | `mejora \| estable \| deterioro` | §1.6 SOURCE |
| `naturaleza` | `temporal \| estructural \| sin_cambio` | §1.6 SOURCE |
| `racha_B2` | entero ≥ 0 | meses seguidos sin pagar obligación esperada |
| `racha_deficit` | entero ≥ 0 | meses seguidos con `caja_op < 0` |
| `C4` | 0-1 | vencido sin cobrar / vencido en 6 m |
| `C3_dias` | entero o null | mediana días hasta cobro de clientes |
| `cobros_op_media3m`, `cobros_op_media6m`, `pagos_op_media6m` | € | flujos §1.1 |
| `servicio_deuda_media6m` | € | `debt_repayment + interest_charge` |
| `D1` | 0-1 | peso de la empresa en el grupo |
| `cobros_op_grupo_media6m`, `pagos_op_grupo_media6m`, `servicio_deuda_grupo_media6m` | € | flujos consolidados del grupo, sin traspasos intragrupo |

De `company_month_forecast` (forecast-engine §8), mismo mes. La previsión es
**opcional**: el motor acepta la entrada y, si no la recibe (o llega con
`metodo = "desconectado"`), opera con `banda_pred_3m = banda` y deja
`banda_pred_3m_usada = null` en la salida. Hoy el pipeline no la conecta.

| Campo | Uso |
| --- | --- |
| `banda_pred_3m` | plazo (§5), interés (§6), acción (§8) |
| `score_pred_3m`, `direccion_pred`, `prob_deterioro_6m` | solo `motivo` y ficha |
| `metodo` | si `desconectado`, se ignora la previsión (`banda_pred_3m = banda`) |

Y del propio motor, mes anterior (§8 estado): `L_prev`, `accion_prev`,
`meses_elegible_seguidos`, `meses_reduccion_seguidos`,
`meses_pred_peor_seguidos`, `cerrado_desde`, `meses_puerta_blanda_seguidos`.

La `capacidad_cuota_adv` **no** se lee de la fila del score: la calcula este
motor a partir de los flujos de arriba con su propio estrés (§4, decisión 40).

## 2. Parámetros (versionados, un solo fichero)

Todos los números del algoritmo viven en una tabla de parámetros con
`version_parametros`. Ningún número suelto en código.

| Grupo | Parámetro | Valor | Decisión |
| --- | --- | --- | --- |
| Elegibilidad | `conf_min` | 0,4 | 18, 39 |
| | `score_min` | 45 | 5, 18 |
| | `racha_B2_max` | 1 | 7, 18 |
| | `racha_deficit_max` | 2 | 12, 18 |
| | `C4_max` | 0,40 | 12, 18 |
| | `cierre_confirmado_meses` | 2 | 42 |
| | `puertas_blandas` | `historia`, `caja` (solo capacidad) | 42 |
| Capacidad | `estres_cobros` | 0,90 | 11, 40 |
| | `estres_pagos` | 1,05 | 11, 40 |
| | `cobertura_min` | 1,3 | 11, 40 |
| | `meses_limite_cap` | 12 | 11 |
| | `anticipo_pct` | 0,80 | 11 |
| | `anticipo_meses` | 3 | 11 |
| | `conf_ref` | 0,6 | 12 |
| Bandas | `banda_A_min` / `banda_B_min` / `banda_C_min` | 75 / 60 / 45 | 12 |
| | `factor_banda` | A 1,0 · B 0,7 · C 0,4 · D 0 | 12 |
| | `base_TAE` | A 0,05 · B 0,07 · C 0,10 | 12, 21 |
| Plazo | `T_max` (d) | ver §5 | 20 |
| | `plazos_menu` (d) | 30, 60, 90, 120, 180 | 19 |
| | `plazo_natural_defecto` (d) | 60 (sin `C3_dias`) | 22 |
| Interés | `prima_plazo_pp_30d` | 0,005 | 21 |
| | `prima_confianza_pp` | 0,01 si `confianza < 0,7` | 21 |
| | `ajuste_mejora_pp` / `ajuste_deterioro_pp` | −0,005 / +0,01 | 21 |
| | `base_dias` | 360 | 21 |
| Revisión | `ampliar_ratio` / `reducir_ratio` | 1,15 / 0,85 | 12 |
| | `reducir_meses` | 2 | 12 |
| | `histeresis_pct` | 0,25 | 12 |
| | `reapertura_meses` | 2 | 23 |
| Previsión | `prima_prevision_pp` | 0,005 si `banda_pred_3m < banda` | 37 |
| | `reducir_prev_meses` | 2 | 37 |
| | `redondeo_L` | 1.000 € | 12 |
| Grupo | `D1_cross_default` | 0,30 | 17 |
| | `techo_cero_baja_banda` | sí | 41 |
| Métricas | `uso_simulado` | 0,6 del `L_vigente` | §14 |

**El estrés de capacidad es propio del motor de decisión** (decisión 40). Scoring
mantiene el suyo (−20 %/+10 %) para `D3` del aval de grupo: mide si el padre
**puede avalar**. El de aquí (−10 %/+5 %) mide **cuánto se puede prestar** sobre
cobros que ya vienen infravalorados. Los dos conviven a propósito y no deben
confundirse: `ScoreRow.capacidad_cuota_adv` no entra en ninguna cuenta de este
documento.

## 3. Paso 0 — Elegibilidad

Orden fijo. La primera puerta que falla es el `motivo`; se evalúan todas
igualmente para `puertas_fallidas[]` (la ficha las enseña todas).

```text
function elegibilidad(fila, estado_prev, P):
    puertas = [
      ("historia",   fila.confianza >= P.conf_min),
      ("estado",     fila.score >= P.score_min),
      ("fiabilidad", fila.racha_B2 <= P.racha_B2_max),
      ("caja",       fila.racha_deficit <= P.racha_deficit_max and capacidad_cuota_adv(fila, P) > 0),
      ("clientes",   fila.C4 is null or fila.C4 <= P.C4_max),
      ("grupo",      not estado_prev.cross_default_activo),
    ]
    fallidas = [nombre for (nombre, ok) in puertas if not ok]
    return (len(fallidas) == 0, fallidas[0] if fallidas else null, fallidas)
```

- `C4 is null` (empresa sin facturas) no bloquea: la puerta solo actúa
  cuando hay dato. La falta de dato ya está en `confianza`.
- `cross_default_activo` viene del estado de grupo del mes anterior (§7).
- `capacidad_cuota_adv` es la de §4, calculada **aquí** con el estrés del motor
  de decisión (decisión 40), no la que trae `ScoreRow`.
- **`conf_min = 0,4`** (decisión 39). La mediana de confianza de la cartera en
  2026-08 es 0,44: el tramo 0,4-0,5 son cinco meses de historia con cobertura
  buena, no "sin datos" (eso es 0,3). La confianza sigue descontando por encima
  de la puerta —límite `× min(1, conf/0,6)` y precio `+1 pp` por debajo de 0,7—,
  así que la puerta solo decide **si opinamos**, no cuánto.

**Puertas blandas y duras** (decisión 42). `historia` y la mitad de capacidad de
`caja` son **blandas**: no cierran el primer mes. Con línea viva (`L_prev > 0`),
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
- `estado`, `fiabilidad`, `clientes`, `grupo` y `racha_deficit > 2` cierran el
  mismo mes: son hechos, no umbrales que tiritan.
- `caja_solo_capacidad` distingue las dos mitades de la puerta: solo es blanda
  cuando `racha_deficit ≤ racha_deficit_max` y lo único que falla es la
  capacidad.
- Sin línea viva (`L_prev = 0`) no hay nada que conservar: cierre inmediato.
- Coste: un mes más de exposición, acotado por el límite operativo. A cambio,
  334 de 1.098 empresa-mes que pasaban las puertas venían justo después de un mes
  cerrado (parpadeo en el umbral).

Motivos en texto (plantilla, sin LLM):

| Puerta | Texto |
| --- | --- |
| historia | "Historial insuficiente: confianza {conf} < 0,4" |
| estado | "Score {score} por debajo de 45" |
| fiabilidad | "{racha} meses seguidos sin pagar obligaciones" |
| caja | "Caja estresada no cubre cuotas actuales" / "{racha} meses seguidos en déficit" |
| clientes | "{C4} % de facturas vencidas sin cobrar" |
| grupo | "Cierre de {empresa} ({D1} % del grupo)" |

## 4. Paso 1 — Cantidad: límite L

```text
function capacidad_cuota_adv(fila, P):
    caja_adv = P.estres_cobros * fila.cobros_op_media6m - P.estres_pagos * fila.pagos_op_media6m
    return max(0, caja_adv / P.cobertura_min - fila.servicio_deuda_media6m)

function banda(score, P):
    if score >= P.banda_A_min: return "A"
    if score >= P.banda_B_min: return "B"
    if score >= P.banda_C_min: return "C"
    return "D"

function banda_efectiva(fila, P):
    b = banda(fila.score, P)
    if fila.direccion == "deterioro" and fila.naturaleza == "estructural":
        b = bajar_una(b)            # A→B, B→C, C→D, D→D
    return b

function limite(fila, P):
    cap      = capacidad_cuota_adv(fila, P)
    lim_cap  = cap * P.meses_limite_cap
    lim_op   = P.anticipo_pct * fila.cobros_op_media3m * P.anticipo_meses
    b        = banda_efectiva(fila, P)
    factor_c = min(1, fila.confianza / P.conf_ref)
    L_bruto  = min(lim_cap, lim_op) * P.factor_banda[b] * factor_c
    return redondear_abajo(L_bruto, P.redondeo_L), b, cap, lim_cap, lim_op
```

**Decisión 40 — el estrés es de este motor.** `estres_cobros = 0,90` y
`estres_pagos = 1,05`: un escenario adverso moderado **sobre datos que ya son
conservadores**. Los cobros están infravalorados de partida (el 25 % de los
movimientos no se clasifica), así que el −20 % de scoring penalizaba dos veces
lo mismo. La cobertura se queda intacta en 1,3 (DSCR estándar): el escenario se
suaviza en los flujos, no en el colchón de servicio de deuda. `capacidad_cuota_adv`
se calcula aquí y es la que usan el límite (§4), la puerta `caja` (§3), la región
factible del menú (§7), el techo consolidado (§9) y la columna del contrato (§10);
la de `ScoreRow` se queda para `D3` del aval de grupo y **no** se usa en este
documento.

Si no elegible → `L = 0`, pero se calculan y guardan `cap`, `lim_cap`,
`lim_op` igualmente (la ficha enseña "si fueras elegible tendrías X").

**Techo de grupo** (§7) se aplica después, sobre el conjunto del grupo.

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

| Uso | Plazo natural |
| --- | --- |
| Anticipar cobros | `C3_dias` (mediana días hasta cobro) redondeado arriba al plazo del menú; sin dato → 60 d |
| Aplazar pagos | plazo elegido por la empresa, ≤ `T_max` |

## 7. Paso 4 — Región factible y menú

```text
function menu(fila, L, T_max, cap, P):
    opciones = []
    for plazo in P.plazos_menu:
        if plazo > T_max: break
        meses        = plazo / 30
        cantidad_max = min(L, cap * meses)
        cantidad_max = redondear_abajo(cantidad_max, P.redondeo_L)
        if cantidad_max <= 0: continue
        t = tae(fila, plazo, P)
        opciones.append({plazo, cantidad_max, tae: t, coste_max: coste(cantidad_max, t, plazo, P), desglose_tae})
    return opciones
```

Invariantes: `cantidad_max` no decrece con el plazo; `tae` no decrece con
el plazo; toda `cantidad_max ≤ L`. **Menú vacío ⇒ `elegible = false`**: sin
opciones no hay grifo que abrir, así que `elegible` exige las seis puertas,
`T_max > 0` **y** `len(menu) > 0`. El `motivo` dice por qué está vacío:

| Caso | `motivo` |
| --- | --- |
| `L_vigente > 0` pero ningún plazo cabe en la capacidad | "Capacidad de cuota insuficiente para cualquier plazo" |
| `L_vigente = 0` esperando reapertura (§8) | "Reapertura en {n} meses" |
| `L_vigente = 0` porque `L = 0` (banda D o capacidad nula) | "Límite a cero" |

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
function grupo(filas_grupo, decisiones, P):
    # 1. techo: Σ L ≤ L consolidado
    fila_g = flujos consolidados del grupo (cobros/pagos/servicio_deuda _grupo_media6m, score = media ponderada por cobros)
    L_grupo = limite(fila_g, P).L
    suma = Σ decisiones[i].L_vigente
    if L_grupo == 0 and algun miembro tiene L_vigente > 0:      # decisión 41
        # sin prorrateo: los miembros vivos bajan una banda y se recalcula
        afectadas_techo = [i for i in decisiones si accion != "cerrar"]
        motivo_grupo = "Grupo sin capacidad consolidada: banda −1"
    elif suma > L_grupo:
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
- **Desviación documentada de §4**: el `limite_op` del grupo es
  `cobros_op_grupo_media6m × anticipo_pct × anticipo_meses`. No existe una media
  de 3 meses consolidada en `ScoreRow`, así que se usa la de 6 meses (más
  estable y algo más conservadora en un grupo que crece).
- La banda del grupo sale de la media de `score` **ponderada por
  `cobros_op_media6m`** de cada empresa, y el recorte por confianza usa la media
  de `confianza` con ese mismo peso (`min(1, conf_grupo / conf_ref)`): quien
  mueve el dinero del grupo es quien manda en la banda y en el recorte. Si nadie
  tiene cobros, se cae a la media simple.
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
- El techo consolidado usa el mismo estrés que §4 (decisión 40: 0,90 / 1,05 /
  1,3). El techo y el límite individual tienen que medirse con la misma vara.
- **Techo con capacidad consolidada 0** (decisión 41). Si `L_grupo = 0` y algún
  miembro tiene línea, **no se prorratea**: el prorrateo a cero cerraría al único
  miembro solvente del grupo. En su lugar todos los miembros no cerrados bajan
  **una banda** (`escalones_extra += 1`, acumulables con el de cross-default hasta
  2) y la ficha dice `motivo_grupo = "Grupo sin capacidad consolidada: banda −1"`.
  El techo cero **no** deriva ningún `cerrar`.

  Por qué: las hermanas sin datos aportan pagos clasificados y pocos cobros
  clasificados, así que la caja consolidada estresada se va a negativo por falta
  de dato, no por riesgo. En el run de 2026-09-19 el techo cerraba a 34 de las 79
  empresas que pasaban las puertas en 2026-08 (637 de 1.098 empresa-mes sobre 24
  meses). El grupo sigue penalizado —una banda son −30 % de límite y +2 pp— y se
  dice en la ficha. Es la única opción coherente con el aval: una filial puede
  recibir +10 puntos de aval del padre y no puede a la vez quedar cerrada por el
  techo de ese mismo padre. El prorrateo se mantiene íntegro siempre que
  `L_grupo > 0`.

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
capacidad_cuota_adv   €/mes
limite_cap, limite_op €
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

`capacidad_cuota_adv` es la del motor de decisión (§4, decisión 40), no la de
`ScoreRow`. Con `cierre_pendiente = true` la fila sale `elegible = false` con el
`motivo` de la puerta, `L = 0` y `L_vigente = L_prev`.

## 11. Plantillas de `motivo_accion`

| Acción | Texto |
| --- | --- |
| abrir | "Elegible: score {score} (banda {b}), límite {L} € hasta {T_max} d" |
| ampliar | "Límite sube de {Lp} a {L_vigente} €: {top1 delta_contrib}" |
| reducir | "Límite baja de {Lp} a {L_vigente} €: {motivo = deterioro estructural \| 2 meses por debajo \| previsión: banda {banda_pred_3m} en 3 meses \| cross-default de {empresa causante} \| techo de grupo}, {top1 delta_contrib o driver_1}" |
| cerrar | "{motivo de §3}" |
| mantener | "Sin cambios: score {score}, límite {Lp} €" / "Reapertura en {n} meses" / "Pendiente confirmar bajada" / "Pendiente confirmar cierre: {motivo de §3}" (decisión 42, manda sobre las otras) |

`top1 delta_contrib` viene de la fila del score (variable con mayor
`|delta_aportacion|`).

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

Siete empresas sintéticas con filas de score a mano, 6 meses cada una.
Resultado esperado por mes escrito en el fixture, no calculado.

| Fixture | Perfil | Debe dar |
| --- | --- | --- |
| `sana` | score 82, conf 0,9, estable, cap 10 k/mes, cobros 100 k/mes | A · L = min(120 k, 240 k) = 120 k · T_max 180 · menú 30 d → 10 k, 60 d → 20 k … 180 d → 60 k · TAE 5 % → 7,5 % |
| `mejora` | score 62→74 en 3 m, dirección mejora | B · `ampliar` cuando L > 1,15·Lp · TAE con −0,5 pp |
| `deterioro_estructural` | score 70→68, estructural desde mes 4 | mes 4: banda C efectiva (B recortada un escalón), `reducir` inmediato, T_max 30 · mes 5: si sigue, C estructural → T_max 0 → cerrar. Con 58 la banda sería D y el recorte dejaría L = 0, que no es lo que el fixture ilustra |
| `bache_temporal` | un mes con score −8 y vuelve | `mantener` (histéresis y 2 meses de confirmación), nunca `reducir` |
| `historial_corto` | conf 0,3 | no elegible, motivo "historia", L = 0 pero `limite_cap` calculado |
| `prevision_peor` | score 72 estable (A), `banda_pred_3m = C` desde mes 2 | mes 2: `mantener`, `meses_pred_peor_seguidos = 1`, T_max 60 (peor banda), TAE +0,5 pp · mes 3: `reducir` preventivo a L con factor 0,4 acotado por histéresis · nunca `ampliar` mientras `banda_pred_3m < A` |
| `grupo_caida` | 3 empresas, una con D1 0,5 cierra en mes 3 | mes 3: hermanas bajan una banda · mes 4: puerta grupo falla → cerrar · techo aplicado si Σ L > L_grupo |

Tests de propiedades (sobre todas las filas del dataset):

1. `elegible = false ⇒ L_vigente = 0`, con dos excepciones: el mes de gracia
   de una puerta blanda (`cierre_pendiente`, decisión 42) y la fila que pasa las
   seis puertas pero se queda sin menú (`T_max = 0`, o capacidad por debajo del
   escalón de `redondeo_L` en todos los plazos, §7). En los dos casos lo que
   falta es grifo que abrir este mes, no solvencia, y la línea viva no se cierra.
   Forma comprobable: `no elegible ⇒ L_vigente = 0 ∨ cierre_pendiente ∨
   puertas_fallidas = []`.
2. `cantidad_max` y `tae` no decrecen con el plazo dentro de un menú.
3. `|L_vigente − L_prev| ≤ 25 % · L_prev` salvo `cerrar`, `reducir` por
   deterioro estructural o `reducir` por `grupo` (escalón de cross-default y
   prorrateo del techo consolidado: los dos se aplican el mismo mes, sin
   histéresis).
4. `Σ L_vigente del grupo ≤ L_grupo`.
5. Mismo input dos veces → misma salida (sin aleatoriedad, sin fecha del sistema).
6. Cambiar cualquier parámetro cambia `version_parametros`.
7. Con `banda_pred_3m == banda` en todas las filas, la salida es idéntica a la de un motor sin previsión.

## 14. Métricas para el jurado (backtest, sobre validación)

| Métrica | Definición |
| --- | --- |
| Exposición evitada | Σ `max(0, L_vigente(t−3) − L_vigente(t))` de empresas que entran en `evento_deterioro` en `t`. En v1 el retroceso es **fijo a t−3**, no el `k` variable del plan; la comparación contra un motor sin anticipación (solo banda por score sin dirección) queda como follow-up. |
| Ingresos simulados | Σ `coste` asumiendo uso del 60 % del `L_vigente` al plazo natural. Supuesto explícito. |
| Oscilación | % de empresa-mes con un cambio de acción; un `cerrar` repetido no cuenta. Objetivo < 20 %. |
| Cierres falsos | `cierres` y `cierres_falsos` se publican como **recuentos brutos** (solo el mes en que se cierra, no cada mes cerrado); el ratio es `cierres_falsos / cierres` = cierres sin `evento_deterioro` en los 6 meses siguientes. |
| Lead time de cierre | mediana de meses entre primer `reducir` y `evento_deterioro`, **con y sin previsión** (decisión 38). |

## 15. Fuera de alcance v1

Gestión de disposiciones y amortizaciones · pricing por riesgo del partner ·
garantías o avales formales · sector · optimización de pesos.
