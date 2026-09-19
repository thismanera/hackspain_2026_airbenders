import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import {
  crossDefaultSiguiente,
  decideGroup,
  parametrosDecision,
} from "@/lib/features/decision/engine";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import {
  ESTADO_INICIAL,
  type DecisionRow,
  type EstadoDecision,
  type PrevisionInput,
} from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { AlertTipo, ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params = parametrosDecision("score-v");

const alertas = (...tipos: AlertTipo[]) => tipos.map((tipo) => ({ tipo, desdeMes: CALENDAR[0] }));

/**
 * Techo del grupo del fixture (`limiteGrupo`, §9, decisión 47): dos empresas de 100 000 €/mes de
 * tamaño, score 82 (banda A), confianza 0,9 y pilar A 80.
 *   Σ tamaño = 200 000 ⇒ limite_op = 0,8 × 200 000 × 3 = 480 000
 *   score ponderado = 82 → banda A (factor 1) · conf 0,9 → min(1; 0,9/0,6) = 1 · factor_A = 1
 *   L_grupo = 480 000, exactamente Σ de los dos límites individuales (240 000 cada uno).
 */
const L_GRUPO = 480_000;

function serie(company: string, patch: (i: number) => Partial<ScoreRow>): ScoreRow[] {
  return CALENDAR.map((month, i) =>
    scoreRowFixture({
      company,
      month,
      groupId: "g",
      scoreSolo: 82,
      cobrosOpMedia3m: 100_000,
      confianza: 0.9,
      D1: 0.5,
      ...patch(i),
    }),
  );
}

test("rows respect the contract; sana opens and holds; state carries", () => {
  const rows = decideGroup(
    serie("a", () => ({})),
    params,
  );
  assert.equal(rows.length, CALENDAR.length);
  for (const r of rows) decisionRowSchema.parse(r);
  assert.equal(rows[0].accion, "abrir");
  assert.equal(rows[0].LVigente, 240_000);
  assert.equal(rows[0].tamano, 100_000);
  assert.equal(rows[0].factorA, 1);
  assert.equal(rows[0].limiteOp, 240_000);
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[5].menu.length, 5);
  assert.equal(rows[0].bandaPred3mUsada, null); // sin previsión
  assert.equal(rows[0].motor, "v1");
  assert.equal(rows[0].versionParametros, params.version);
  assert.equal(rows[1].estado.LPrev, 240_000);
});

test("decisión 46: el menú de la fila sana es la rampa hasta L en 180 d", () => {
  const rows = decideGroup(
    serie("a", () => ({})),
    params,
  );
  assert.deepEqual(
    rows[0].menu.map((o) => [o.plazo, o.cantidadMax]),
    [
      [30, 40_000],
      [60, 80_000],
      [90, 120_000],
      [120, 160_000],
      [180, 240_000],
    ],
  );
  assert.equal(rows[0].plazoNaturalAnticipo, P.plazoNaturalDefecto);
});

test("no eligible ⇒ cerrar with reason and L_vigente 0", () => {
  const rows = decideGroup(
    serie("a", (i) => (i === 2 ? { scoreSolo: 40 } : {})),
    params,
  );
  assert.equal(rows[2].accion, "cerrar");
  assert.equal(rows[2].elegible, false);
  assert.match(rows[2].motivo!, /Score 40/);
  assert.equal(rows[2].LVigente, 0);
  assert.equal(rows[3].accion, "mantener");
  assert.equal(rows[4].accion, "abrir");
});

test("decisión 44: una alerta sola cierra el grifo, sin mirar ninguna variable cruda", () => {
  const casos: [AlertTipo, RegExp][] = [
    ["impago_obligaciones", /^Impago de obligaciones \(alerta\)$/],
    ["deficit_persistente", /^Déficit persistente \(alerta\)$/],
    ["vencido_alto", /^Vencido alto \(alerta\)$/],
  ];
  for (const [tipo, motivo] of casos) {
    const rows = decideGroup(
      serie("a", (i) => (i === 2 ? { alertas: alertas(tipo) } : {})),
      params,
    );
    assert.equal(rows[2].elegible, false, tipo);
    assert.match(rows[2].motivo!, motivo);
  }
  // una alerta que no es de puerta no cierra nada
  const deterioro = decideGroup(
    serie("a", (i) => (i === 2 ? { alertas: alertas("deterioro") } : {})),
    params,
  );
  assert.equal(deterioro[2].elegible, true);
});

test("decisión 45: el pilar A escala el límite de la fila real", () => {
  // Por encima de la puerta (A ≥ 50) el pilar sigue recortando hasta `factorARef`: A 56 ⇒ 0,8.
  const rows = decideGroup(
    serie("a", (i) => (i === 2 ? { subscores: { A: 56, B: 80, C: 80 } } : {})),
    params,
  );
  assert.equal(rows[0].factorA, 1);
  assert.equal(rows[0].L, 240_000);
  assert.equal(rows[2].factorA, 0.8);
  assert.equal(rows[2].L, 192_000);
  assert.equal(rows[2].elegible, true);
});

test("group: a big sibling closing lowers the others one band and closes them next month", () => {
  const a = serie("a", (i) => (i >= 3 ? { scoreSolo: 40 } : {}));
  const b = serie("b", () => ({ D1: 0.5 }));
  const rows = decideGroup([...a, ...b], params);
  const bRows = rows.filter((r) => r.company === "b");
  assert.equal(bRows[3].bandaEfectiva, "B"); // escalón por cross-default en el mes de la caída
  assert.equal(bRows[3].L, 168_000); // 240 000 × factor banda B (0,7)
  assert.ok(bRows[3].LVigente < bRows[2].LVigente);
  assert.equal(bRows[3].accion, "reducir"); // sin histéresis: la caída de la hermana es señal dura
  assert.equal(bRows[4].accion, "cerrar"); // puerta grupo
  assert.match(bRows[4].motivo!, /Cierre de a/);
  assert.equal(bRows[3].estado.crossDefaultActivo, true);
  assert.equal(bRows[3].estado.causaCrossDefault, "a");
});

test("Σ L_vigente ≤ L_grupo and determinism", () => {
  const rows = decideGroup([...serie("a", () => ({})), ...serie("b", () => ({}))], params);
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.LVigente);
  for (const suma of byMonth.values()) assert.ok(suma <= L_GRUPO + 1e-6); // techo del fixture
  assert.deepEqual(
    rows,
    decideGroup([...serie("a", () => ({})), ...serie("b", () => ({}))], params),
  );
});

test("cross-default flag lifts when the cause reopens or after reaperturaMeses", () => {
  const activo: EstadoDecision = {
    ...ESTADO_INICIAL,
    crossDefaultActivo: true,
    causaCrossDefault: "a",
    mesesConCrossDefault: 1,
  };
  const apagado = {
    crossDefaultActivo: false,
    causaCrossDefault: null,
    mesesConCrossDefault: 0,
  };
  const cerrada = new Map([["a", { ...ESTADO_INICIAL, LPrev: 0 }]]);
  const reabierta = new Map([["a", { ...ESTADO_INICIAL, LPrev: 50_000 }]]);

  // se enciende el mes de la caída
  assert.deepEqual(crossDefaultSiguiente(ESTADO_INICIAL, true, "a", cerrada), {
    crossDefaultActivo: true,
    causaCrossDefault: "a",
    mesesConCrossDefault: 1,
  });
  // sigue encendido mientras la causante siga cerrada, sumando meses
  assert.deepEqual(crossDefaultSiguiente(activo, false, null, cerrada), {
    crossDefaultActivo: true,
    causaCrossDefault: "a",
    mesesConCrossDefault: 2,
  });
  // la misma causa que vuelve a caer no reinicia el contador (si no, el tope nunca llegaría)
  assert.equal(crossDefaultSiguiente(activo, true, "a", cerrada).mesesConCrossDefault, 2);
  // se levanta cuando la causante reabre
  assert.deepEqual(crossDefaultSiguiente(activo, false, null, reabierta), apagado);
  // se levanta al llegar al tope aunque la causante siga cerrada
  assert.deepEqual(
    crossDefaultSiguiente(
      { ...activo, mesesConCrossDefault: P.reaperturaMeses },
      false,
      null,
      cerrada,
    ),
    apagado,
  );
  // fail-open: sin fila de la causante este mes la bandera se levanta
  assert.deepEqual(crossDefaultSiguiente(activo, false, null, new Map()), apagado);
  // sin bandera previa no se enciende solo
  assert.deepEqual(crossDefaultSiguiente(ESTADO_INICIAL, false, null, cerrada), apagado);
  // una causa distinta rearma el contador
  assert.deepEqual(crossDefaultSiguiente(activo, true, "z", cerrada), {
    crossDefaultActivo: true,
    causaCrossDefault: "z",
    mesesConCrossDefault: 1,
  });
});

test("a one-month sibling fall does not deadlock the group", () => {
  const a = serie("a", (i) => (i === 3 ? { scoreSolo: 40 } : {}));
  const b = serie("b", () => ({}));
  const rows = decideGroup([...a, ...b], params);
  const aRows = rows.filter((r) => r.company === "a");
  const bRows = rows.filter((r) => r.company === "b");

  assert.equal(aRows[3].accion, "cerrar");
  assert.equal(bRows[3].accion, "reducir"); // escalón por cross-default
  assert.equal(bRows[3].estado.crossDefaultActivo, true);
  assert.equal(bRows[4].accion, "cerrar"); // puerta grupo
  // la causante reabre y la bandera se levanta; "b" vuelve por la reapertura normal
  assert.ok(aRows.slice(5).every((r) => r.LVigente > 0));
  assert.ok(
    bRows.some((r, i) => i > 4 && r.accion === "abrir"),
    "b debe reabrir",
  );
  // y a partir de ahí ninguna de las dos se queda cerrada el resto del calendario
  for (const r of [...aRows.slice(9), ...bRows.slice(9)]) {
    assert.notEqual(r.accion, "cerrar", `${r.company} ${r.month}`);
    assert.ok(r.LVigente > 0, `${r.company} ${r.month}`);
  }
});

test("a cause that never reopens still lets the sibling back after reaperturaMeses", () => {
  const a = serie("a", (i) => (i >= 3 ? { scoreSolo: 40 } : {}));
  const b = serie("b", () => ({}));
  const rows = decideGroup([...a, ...b], params);
  const aRows = rows.filter((r) => r.company === "a");
  const bRows = rows.filter((r) => r.company === "b");

  assert.ok(aRows.slice(3).every((r) => r.accion === "cerrar")); // la causante no vuelve
  assert.equal(bRows[3].accion, "reducir");
  // la bandera aguanta `reaperturaMeses` meses y se levanta sola
  assert.equal(bRows[3].estado.mesesConCrossDefault, 1);
  assert.equal(bRows[4].estado.mesesConCrossDefault, P.reaperturaMeses);
  assert.equal(bRows[5].estado.crossDefaultActivo, false);
  const reapertura = bRows.findIndex((r, i) => i > 4 && r.accion === "abrir");
  assert.ok(reapertura > 4, "b debe reabrir");
  for (const r of bRows.slice(reapertura)) assert.ok(r.LVigente > 0, `${r.month}`);
});

/**
 * Grupo con techo mordiente (decisión 47). El techo solo puede morder cuando la banda del grupo
 * es peor que la de quien tiene el límite: "a" con score 20 (banda D, L = 0) arrastra el score
 * ponderado a 51 (banda C), así que
 *   L_grupo = 0,8 × 200 000 × 3 × 0,4 = 192 000  frente a  Σ L = 240 000.
 */
function serieTecho(company: string, score: number): ScoreRow[] {
  return CALENDAR.map((month) =>
    scoreRowFixture({
      company,
      month,
      groupId: "g",
      scoreSolo: score,
      cobrosOpMedia3m: 100_000,
      confianza: 0.9,
      D1: 0.1,
    }),
  );
}

test("the group ceiling binds: it prorates, is flagged and the action follows the capped limit", () => {
  const rows = decideGroup([...serieTecho("a", 20), ...serieTecho("b", 82)], params);
  const LGrupo = 192_000;
  const porMes = new Map<string, number>();
  for (const r of rows) {
    assert.ok(r.motivoGrupo !== null, `${r.company} ${r.month}: el techo debería estar marcado`);
    assert.match(r.motivoGrupo!, /Techo de grupo: 192\.000 €/);
    porMes.set(r.month, (porMes.get(r.month) ?? 0) + r.LVigente);
  }
  for (const [month, suma] of porMes) assert.ok(suma <= LGrupo, `${month}: ${suma}`);
  const a = rows.filter((r) => r.company === "a");
  const b = rows.filter((r) => r.company === "b");
  assert.ok(a.every((r) => r.accion === "cerrar" && r.LVigente === 0));
  assert.equal(b[0].accion, "abrir");
  assert.equal(b[0].L, 240_000); // el límite propio, antes del techo
  assert.equal(b[0].LVigente, 192_000);
  // mes 2: el reparto se come la subida entera, así que la fila dice "mantener", no "ampliar"
  assert.equal(b[1].accion, "mantener");
  assert.ok(b.every((r) => r.LVigente === 192_000));
});

test("two companies over a shrinking ceiling both come out as reducir with the group reason", () => {
  // Una tercera empresa grande y en banda D entra en el mes 2 y hunde el score ponderado del
  // grupo: L_grupo pasa de 480 000 a 0,8 × 400 000 × 3 × 0,4 = 384 000 con Σ L = 480 000.
  const sanas = ["a", "b"].flatMap((company) =>
    CALENDAR.map((month) =>
      scoreRowFixture({
        company,
        month,
        groupId: "g",
        scoreSolo: 82,
        cobrosOpMedia3m: 100_000,
        confianza: 0.9,
        D1: 0.1,
      }),
    ),
  );
  const lastre = CALENDAR.slice(1).map((month) =>
    scoreRowFixture({
      company: "c",
      month,
      groupId: "g",
      scoreSolo: 20,
      cobrosOpMedia3m: 200_000,
      confianza: 0.9,
      D1: 0.1,
    }),
  );
  const rows = decideGroup([...sanas, ...lastre], params);
  const mes1 = rows.filter((r) => r.month === CALENDAR[0]);
  assert.equal(mes1.length, 2);
  for (const r of mes1) assert.equal(r.LVigente, 240_000); // sin lastre el techo no muerde
  const mes2 = rows.filter((r) => r.month === CALENDAR[1] && r.company !== "c");
  assert.equal(mes2.length, 2);
  for (const r of mes2) {
    assert.equal(r.accion, "reducir", r.company);
    assert.equal(r.LVigente, 192_000);
    assert.match(r.motivoGrupo!, /Techo de grupo: 384\.000 €/);
    assert.match(r.motivoAccion, /techo de grupo/);
  }
  assert.equal(mes2[0].LVigente + mes2[1].LVigente, 384_000);
});

/** Grupo sin tamaño: Σ tamaño = 0 (decisión 47). */
function serieSinTamano(company: string): ScoreRow[] {
  return CALENDAR.map((month) =>
    scoreRowFixture({
      company,
      month,
      groupId: "g",
      scoreSolo: 82,
      cobrosOpMedia3m: 0,
      confianza: 0.9,
      D1: 0.1,
    }),
  );
}

test("decisión 47: con Σ tamaño = 0 el techo es 0, pero no cierra a nadie: no había línea", () => {
  const rows = decideGroup([...serieSinTamano("a"), ...serieSinTamano("b")], params);
  for (const r of rows) {
    assert.equal(r.L, 0, `${r.company} ${r.month}`);
    assert.equal(r.LVigente, 0);
    // El techo cero de la decisión 41 se queda sin objeto: no hay nada que prorratear ni banda
    // que bajar, porque el límite individual de cada miembro ya es 0 por la misma razón.
    assert.equal(r.motivoGrupo, null, `${r.company} ${r.month}`);
    assert.notEqual(r.accion, "cerrar");
    assert.equal(r.banda, "A"); // el score sigue siendo el de una empresa sana
    assert.equal(r.bandaEfectiva, "A");
    assert.equal(r.motivo, "Límite a cero");
  }
});

test("decisión 42: una puerta blanda mantiene la línea un mes y cierra al siguiente", () => {
  const rows = decideGroup(
    serie("a", (i) => (i >= 2 ? { confianza: 0.3 } : {})),
    params,
  );
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[1].cierrePendiente, false);
  // mes 3: falla `historia`, pero el cierre espera confirmación
  assert.equal(rows[2].accion, "mantener");
  assert.equal(rows[2].cierrePendiente, true);
  assert.equal(rows[2].elegible, false);
  assert.equal(rows[2].LVigente, 240_000);
  assert.equal(rows[2].L, 0);
  assert.match(rows[2].motivo!, /Historial insuficiente/);
  assert.match(rows[2].motivoAccion, /^Pendiente confirmar cierre: Historial insuficiente/);
  assert.equal(rows[2].estado.mesesPuertaBlandaSeguidos, 1);
  // mes 4: segundo mes seguido → cierre confirmado
  assert.equal(rows[3].accion, "cerrar");
  assert.equal(rows[3].cierrePendiente, false);
  assert.equal(rows[3].LVigente, 0);
  assert.equal(rows[3].estado.mesesPuertaBlandaSeguidos, 2);
});

test("decisión 42 + 44: el umbral del pilar A es blando y la alerta de déficit es dura", () => {
  const pilar = decideGroup(
    serie("a", (i) => (i >= 2 ? { subscores: { A: 40, B: 80, C: 80 } } : {})),
    params,
  );
  assert.equal(pilar[2].accion, "mantener");
  assert.equal(pilar[2].cierrePendiente, true);
  assert.match(pilar[2].motivo!, /Estado de caja 40,0 por debajo de 50/);
  assert.equal(pilar[3].accion, "cerrar");

  const alerta = decideGroup(
    serie("a", (i) => (i === 2 ? { alertas: alertas("deficit_persistente") } : {})),
    params,
  );
  assert.equal(alerta[2].accion, "cerrar");
  assert.equal(alerta[2].cierrePendiente, false);
  assert.equal(alerta[2].LVigente, 0);
  assert.equal(alerta[2].estado.mesesPuertaBlandaSeguidos, 0);
});

/** §13, propiedades 1, 2 y 3 sobre todas las filas de un dataset (+ menú y motivo, §7 y §10). */
function compruebaPropiedades(nombre: string, rows: DecisionRow[]): void {
  const porEmpresa = new Map<string, DecisionRow[]>();
  for (const r of rows) {
    decisionRowSchema.parse(r);
    // §13 propiedad 1 con sus dos excepciones: el mes de gracia de una puerta blanda (decisión 42)
    // y la fila que pasa las seis puertas pero se queda sin menú (§7: `T_max = 0` o un límite por
    // debajo del escalón de `redondeo_L` en todos los plazos de la rampa). En los dos casos la
    // línea viva no se cierra: lo que falta es grifo que abrir este mes, no solvencia.
    assert.ok(
      r.elegible || r.LVigente === 0 || r.cierrePendiente || r.puertasFallidas.length === 0,
      `${nombre} ${r.company} ${r.month}: P1`,
    );
    // §13 propiedad 2 + decisión 46: el menú no decrece y respeta la rampa.
    for (let i = 0; i < r.menu.length; i++) {
      const o = r.menu[i];
      assert.ok(o.cantidadMax <= r.LVigente, `${nombre} ${r.company} ${r.month}: menú > L`);
      assert.ok(
        o.cantidadMax <= (r.LVigente * o.plazo) / P.rampaDias + 1e-6,
        `${nombre} ${r.company} ${r.month}: rampa @ ${o.plazo}`,
      );
      assert.equal(o.cantidadMax % P.redondeoL, 0);
      if (i === 0) continue;
      assert.ok(o.cantidadMax >= r.menu[i - 1].cantidadMax, `${nombre}: P2 cantidad`);
      assert.ok(o.tae >= r.menu[i - 1].tae, `${nombre}: P2 tae`);
    }
    // §7: sin menú no hay grifo que abrir, así que la fila no puede salir elegible.
    assert.ok(
      r.menu.length > 0 || !r.elegible,
      `${nombre} ${r.company} ${r.month}: menú vacío con elegible = true`,
    );
    // §10: `motivo` es la razón por la que NO hay grifo; una fila elegible no lleva ninguna.
    assert.ok(
      !r.elegible || r.motivo === null,
      `${nombre} ${r.company} ${r.month}: elegible con motivo "${r.motivo}"`,
    );
    const lista = porEmpresa.get(r.company) ?? [];
    lista.push(r);
    porEmpresa.set(r.company, lista);
  }
  for (const lista of porEmpresa.values()) {
    lista.sort((a, b) => (a.month < b.month ? -1 : 1));
    for (let i = 1; i < lista.length; i++) {
      const r = lista[i];
      const LPrev = lista[i - 1].LVigente;
      const exento =
        LPrev === 0 ||
        r.accion === "cerrar" ||
        r.motivoGrupo !== null ||
        (r.accion === "reducir" &&
          /deterioro estructural|cross-default|techo de grupo/.test(r.motivoAccion));
      if (exento) continue;
      assert.ok(
        Math.abs(r.LVigente - LPrev) <= P.histeresisPct * LPrev + 1e-6,
        `${nombre} ${r.company} ${r.month}: P3 (${LPrev} → ${r.LVigente})`,
      );
    }
  }
}

test("§13 properties 1, 2 and 3 hold on every fixture", () => {
  compruebaPropiedades(
    "sana",
    decideGroup(
      serie("a", () => ({})),
      params,
    ),
  );
  compruebaPropiedades(
    "caida",
    decideGroup(
      [...serie("a", (i) => (i >= 3 ? { scoreSolo: 40 } : {})), ...serie("b", () => ({}))],
      params,
    ),
  );
  compruebaPropiedades(
    "techo",
    decideGroup([...serieTecho("a", 20), ...serieTecho("b", 82)], params),
  );
  compruebaPropiedades(
    "sin_tamano",
    decideGroup([...serieSinTamano("a"), ...serieSinTamano("b")], params),
  );
  compruebaPropiedades(
    "puerta_blanda",
    decideGroup(
      serie("a", (i) => (i >= 2 && i <= 5 ? { confianza: 0.3 } : {})),
      params,
    ),
  );
  compruebaPropiedades(
    "pilar_a",
    decideGroup(
      serie("a", (i) => (i >= 2 ? { subscores: { A: 20, B: 80, C: 80 } } : {})),
      params,
    ),
  );
  compruebaPropiedades(
    "estructural",
    decideGroup(
      serie("a", (i) =>
        i >= 2 ? { scoreSolo: 68, direccion: "deterioro", naturaleza: "estructural" } : {},
      ),
      params,
    ),
  );
});

test("§13 property 7: a forecast equal to the current band changes nothing but the column", () => {
  const scores = [...serie("a", () => ({})), ...serie("b", () => ({}))];
  const previsiones = new Map<string, PrevisionInput>(
    scores.map((r) => [
      `${r.company}|${r.month}`,
      {
        bandaPred3m:
          r.scoreSolo >= 75 ? "A" : r.scoreSolo >= 60 ? "B" : r.scoreSolo >= 45 ? "C" : "D",
        scorePred3m: r.scoreSolo,
        direccionPred: "estable",
        probDeterioro6m: 0,
        metodo: "v1_proyeccion",
      } satisfies PrevisionInput,
    ]),
  );
  const sin = decideGroup(scores, params);
  const con = decideGroup(scores, params, previsiones);
  assert.deepEqual(
    con.map(
      ({
        bandaPred3mUsada: _bandaPred,
        bandaPredGrupo3mUsada: _grupoPred,
        scorePredSolo3m: _soloPred,
        scorePredGrupo3m: _grupoScore,
        ...r
      }) => r,
    ),
    sin.map(
      ({
        bandaPred3mUsada: _bandaPred,
        bandaPredGrupo3mUsada: _grupoPred,
        scorePredSolo3m: _soloPred,
        scorePredGrupo3m: _grupoScore,
        ...r
      }) => r,
    ),
  );
  assert.ok(con.every((r) => r.bandaPred3mUsada !== null));
});

test("a forecast in shadow mode cannot alter the decision", () => {
  const scores = serie("a", () => ({}));
  const shadow = new Map<string, PrevisionInput>(
    scores.map((row) => [
      `${row.company}|${row.month}`,
      {
        bandaPred3m: "D",
        scorePred3m: 10,
        direccionPred: "deterioro",
        probDeterioro6m: 1,
        metodo: "desconectado",
      },
    ]),
  );
  const baseline = decideGroup(scores, params);
  const withShadow = decideGroup(scores, params, shadow);
  assert.deepEqual(withShadow, baseline);
});

test("pignoración bloquea ampliaciones, limita el plazo y publica el cortafuegos", () => {
  const rows = decideGroup(
    serie("a", (i) =>
      i === 0
        ? { cobrosOpMedia3m: 50_000 }
        : { cobrosOpMedia3m: 100_000, alertaPignoracionCaja: true },
    ),
    params,
  );
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[1].TMax, P.alertaPignoracionPlazoMaxDias);
  assert.match(rows[1].motivoAccion, /Requiere Pignoración de Caja \/ Cortafuegos/);

  const ewiRows = decideGroup(
    serie("a", (i) =>
      i === 0
        ? { cobrosOpMedia3m: 50_000 }
        : {
            cobrosOpMedia3m: 100_000,
            alertaPignoracionCaja: true,
            evaluacionEwi: {
              ...scoreRowFixture().evaluacionEwi,
              revisionStage2Candidata: true,
            },
          },
    ),
    params,
  );
  assert.equal(ewiRows[1].TMax, P.revisionStage2PlazoDias);
});

test("una caída prevista de cinco puntos bloquea una ampliación dentro de la misma banda", () => {
  const scores = serie("a", (i) =>
    i === 0 ? { cobrosOpMedia3m: 50_000 } : { cobrosOpMedia3m: 100_000 },
  );
  const forecast = new Map<string, PrevisionInput>([
    [
      `a|${CALENDAR[1]}`,
      {
        bandaPred3m: "A",
        scorePred3m: 77,
        direccionPred: "estable",
        probDeterioro6m: 0,
        metodo: "v1_proyeccion",
      },
    ],
  ]);
  const rows = decideGroup(scores, params, forecast);
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[1].scorePredSolo3m, 77);
});

test("un cierre exclusivo por techo de grupo no impone cuarentena de reapertura", () => {
  const healthy = serie("a", (i) => (i === 1 ? { cobrosOpMedia3m: 100_000 } : {}));
  const largeD = [
    scoreRowFixture({
      company: "d",
      month: CALENDAR[1],
      groupId: "g",
      scoreSolo: 20,
      cobrosOpMedia3m: 900_000,
      confianza: 0.9,
      D1: 0.1,
    }),
  ];
  const rows = decideGroup([...healthy, ...largeD], params);
  const month2 = rows.find((row) => row.company === "a" && row.month === CALENDAR[1])!;
  const month3 = rows.find((row) => row.company === "a" && row.month === CALENDAR[2])!;
  assert.equal(month2.accion, "cerrar");
  assert.match(month2.motivoAccion, /Techo de grupo/);
  assert.equal(month3.accion, "abrir");
});

test("an aval cannot override a persistent deficit door", () => {
  const rows = decideGroup(
    serie("a", (i) =>
      i === 2
        ? {
            scoreSolo: 40,
            scoreGrupo: 80,
            requiereAvalMatriz: true,
            alertas: alertas("deficit_persistente"),
          }
        : {},
    ),
    params,
  );
  assert.equal(rows[2].condicionAvalMatriz, false);
  assert.equal(rows[2].accion, "cerrar");
  assert.equal(rows[2].LVigente, 0);
  assert.ok(rows[2].puertasFallidas.includes("caja"));
});

test("a weak holding keeps the worse current band without improving autonomous eligibility", () => {
  const rows = decideGroup(
    serie("a", () => ({ scoreGrupo: 40 })),
    params,
  );
  assert.equal(rows[0].banda, "D");
  assert.equal(rows[0].bandaEfectiva, "D");
  assert.equal(rows[0].L, 0);
  assert.equal(rows[0].elegible, false);
});

test("a strong holding can support a weak autonomous score only with the matrix guarantee", () => {
  const rows = decideGroup(
    serie("a", (i) =>
      i === 2
        ? {
            scoreSolo: 40,
            scoreGrupo: 60,
            ajusteHolding: 20,
            requiereAvalMatriz: true,
            estadoSolo: "riesgo",
            estadoGrupo: "vigilar",
            perfilGrupo: "filial_subvencionada",
          }
        : {},
    ),
    params,
  );
  assert.equal(rows[2].condicionAvalMatriz, true);
  assert.equal(rows[2].elegible, true);
  assert.equal(rows[2].banda, "B");
  assert.match(rows[2].motivoAccion, /Requiere Aval Solidario de Matriz/);
});

test("positive holding support can use the guarantee below the usual +15 threshold", () => {
  const rows = decideGroup(
    serie("a", (i) =>
      i === 2
        ? {
            scoreSolo: 42,
            scoreGrupo: 52,
            ajusteHolding: 10,
            requiereAvalMatriz: false,
            estadoSolo: "riesgo",
            estadoGrupo: "vigilar",
          }
        : {},
    ),
    params,
  );
  assert.equal(rows[2].condicionAvalMatriz, true);
  assert.equal(rows[2].elegible, true);
  assert.match(rows[2].motivoAccion, /Requiere Aval Solidario de Matriz/);
});

test("Stage 2 review limits a new opening to 60 days", () => {
  const rows = decideGroup(
    serie("a", (i) =>
      i === 0
        ? { evaluacionEwi: { ...scoreRowFixture().evaluacionEwi, revisionStage2Candidata: true } }
        : {},
    ),
    params,
  );
  assert.equal(rows[0].accion, "abrir");
  assert.ok(rows[0].TMax <= 60);
});

test("decideGroup refuses rows from another group or outside the calendar", () => {
  const rows = serie("a", () => ({}));
  assert.throws(
    () => decideGroup([...rows, scoreRowFixture({ company: "z", groupId: "otro" })], params),
    /fila de otro grupo/,
  );
  assert.throws(
    () => decideGroup([scoreRowFixture({ company: "a", month: "1999-01" })], params),
    /mes fuera del calendario/,
  );
});
