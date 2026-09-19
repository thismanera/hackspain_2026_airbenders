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
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params = parametrosDecision("score-v");
const grupo = {
  cobrosOpGrupoMedia6m: 1_000_000,
  pagosOpGrupoMedia6m: 600_000,
  servicioDeudaGrupoMedia6m: 20_000,
};

/**
 * Techo del grupo del fixture (`limiteGrupo`, §9), derivado a mano:
 *   capacidad  = (0,8 × 1 000 000 − 1,1 × 600 000)/1,3 − 20 000 = 140 000/1,3 − 20 000 = 87 692,31
 *   limite_cap = 87 692,31 × 12 = 1 052 307,69   ·   limite_op = 0,8 × 1 000 000 × 3 = 2 400 000
 *   score ponderado por cobros = 82 → banda A (factor 1); conf 0,9 → min(1; 0,9/0,6) = 1
 *   L_grupo = redondear_abajo(min(1 052 307,69; 2 400 000), 1000) = 1 052 000
 * (el plan traía 400 000 como marcador de posición; no sale de estos flujos).
 */
const L_GRUPO = 1_052_000;

function serie(company: string, patch: (i: number) => Partial<ScoreRow>): ScoreRow[] {
  return CALENDAR.map((month, i) =>
    scoreRowFixture({
      company,
      month,
      groupId: "g",
      score: 82,
      capacidadCuotaAdv: 10_000,
      cobrosOpMedia3m: 100_000,
      cobrosOpMedia6m: 100_000,
      confianza: 0.9,
      D1: 0.5,
      ...grupo,
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
  assert.equal(rows[0].LVigente, 120_000);
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[5].menu.length, 5);
  assert.equal(rows[0].bandaPred3mUsada, null); // sin previsión
  assert.equal(rows[0].motor, "v1");
  assert.equal(rows[0].versionParametros, params.version);
  assert.equal(rows[1].estado.LPrev, 120_000);
});

test("no eligible ⇒ cerrar with reason and L_vigente 0", () => {
  const rows = decideGroup(
    serie("a", (i) => (i === 2 ? { score: 40 } : {})),
    params,
  );
  assert.equal(rows[2].accion, "cerrar");
  assert.equal(rows[2].elegible, false);
  assert.match(rows[2].motivo!, /Score 40/);
  assert.equal(rows[2].LVigente, 0);
  assert.equal(rows[3].accion, "mantener");
  assert.equal(rows[4].accion, "abrir");
});

test("group: ceiling prorates and a big sibling closing lowers the others one band and closes them next month", () => {
  const a = serie("a", (i) => (i >= 3 ? { score: 40 } : {}));
  const b = serie("b", () => ({ D1: 0.5 }));
  const rows = decideGroup([...a, ...b], params);
  const bRows = rows.filter((r) => r.company === "b");
  assert.equal(bRows[3].bandaEfectiva, "B"); // escalón por cross-default en el mes de la caída
  assert.equal(bRows[3].L, 84_000); // 120 000 × factor banda B (0,7)
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
  for (const suma of byMonth.values()) assert.ok(suma <= L_GRUPO + 1e-6); // techo del fixture: ver limiteGrupo
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
  const a = serie("a", (i) => (i === 3 ? { score: 40 } : {}));
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
  for (const r of [...aRows.slice(8), ...bRows.slice(8)]) {
    assert.notEqual(r.accion, "cerrar", `${r.company} ${r.month}`);
    assert.ok(r.LVigente > 0, `${r.company} ${r.month}`);
  }
});

test("a cause that never reopens still lets the sibling back after reaperturaMeses", () => {
  const a = serie("a", (i) => (i >= 3 ? { score: 40 } : {}));
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

const techo = {
  cobrosOpGrupoMedia6m: 300_000,
  pagosOpGrupoMedia6m: 100_000,
  servicioDeudaGrupoMedia6m: 0,
};

/** Grupo con techo mordiente: L_grupo = 720 000 frente a Σ L = 1 200 000. */
function serieTecho(company: string): ScoreRow[] {
  return CALENDAR.map((month) =>
    scoreRowFixture({
      company,
      month,
      groupId: "g",
      score: 82,
      capacidadCuotaAdv: 50_000,
      cobrosOpMedia3m: 1_000_000,
      cobrosOpMedia6m: 100_000,
      confianza: 0.9,
      D1: 0.1,
      ...techo,
    }),
  );
}

test("the group ceiling binds: it prorates, is flagged and the action follows the capped limit", () => {
  const rows = decideGroup([...serieTecho("a"), ...serieTecho("b")], params);
  // capacidad_g = (0,8×300 000 − 1,1×100 000)/1,3 = 100 000 → limite_cap 1 200 000
  // limite_op = 0,8 × 300 000 × 3 = 720 000 (manda) · banda A, conf 0,9 → sin recorte
  const LGrupo = 720_000;
  const porMes = new Map<string, number>();
  for (const r of rows) {
    assert.equal(r.L, 600_000); // min(50 000 × 12; 0,8 × 1 000 000 × 3)
    assert.ok(r.motivoGrupo !== null, `${r.month}: el techo debería estar marcado`);
    porMes.set(r.month, (porMes.get(r.month) ?? 0) + r.LVigente);
  }
  for (const [month, suma] of porMes) assert.ok(suma <= LGrupo, `${month}: ${suma}`);
  const a = rows.filter((r) => r.company === "a");
  assert.equal(a[0].accion, "abrir");
  assert.equal(a[0].LVigente, 360_000);
  // mes 2: el reparto se come la subida entera, así que la fila dice "mantener", no "ampliar"
  assert.equal(a[1].accion, "mantener");
  assert.equal(a[1].LVigente, 360_000);
  assert.ok(a.every((r) => r.LVigente === 360_000));
});

test("two companies over a small ceiling both come out as reducir with the group reason", () => {
  // el grupo encoge en el mes 2: L_grupo pasa de 480 000 a 120 000 con Σ L = 240 000
  const grande = { cobrosOpGrupoMedia6m: 200_000, pagosOpGrupoMedia6m: 0 };
  const pequeno = { cobrosOpGrupoMedia6m: 50_000, pagosOpGrupoMedia6m: 0 };
  const serieT = (company: string) =>
    CALENDAR.map((month, i) =>
      scoreRowFixture({
        company,
        month,
        groupId: "g",
        score: 82,
        capacidadCuotaAdv: 10_000,
        cobrosOpMedia3m: 100_000,
        cobrosOpMedia6m: 100_000,
        confianza: 0.9,
        D1: 0.1,
        servicioDeudaGrupoMedia6m: 0,
        ...(i === 0 ? grande : pequeno),
      }),
    );
  const rows = decideGroup([...serieT("a"), ...serieT("b")], params);
  const mes2 = rows.filter((r) => r.month === CALENDAR[1]);
  assert.equal(mes2.length, 2);
  for (const r of mes2) {
    assert.equal(r.accion, "reducir", r.company);
    assert.equal(r.LVigente, 60_000);
    assert.match(r.motivoGrupo!, /Techo de grupo: 120\.000 €/);
    assert.match(r.motivoAccion, /techo de grupo/);
  }
  assert.equal(mes2[0].LVigente + mes2[1].LVigente, 120_000);
});

/** §13, propiedades 1 y 3 sobre todas las filas de un dataset (+ menú y motivo, §7 y §10). */
function compruebaPropiedades(nombre: string, rows: DecisionRow[]): void {
  const porEmpresa = new Map<string, DecisionRow[]>();
  for (const r of rows) {
    decisionRowSchema.parse(r);
    assert.ok(!r.elegible ? r.LVigente === 0 : true, `${nombre} ${r.company} ${r.month}: P1`);
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

test("§13 properties 1 and 3 hold on every fixture", () => {
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
      [...serie("a", (i) => (i >= 3 ? { score: 40 } : {})), ...serie("b", () => ({}))],
      params,
    ),
  );
  compruebaPropiedades("techo", decideGroup([...serieTecho("a"), ...serieTecho("b")], params));
  compruebaPropiedades(
    "estructural",
    decideGroup(
      serie("a", (i) =>
        i >= 2 ? { score: 68, direccion: "deterioro", naturaleza: "estructural" } : {},
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
        bandaPred3m: r.score >= 75 ? "A" : r.score >= 60 ? "B" : r.score >= 45 ? "C" : "D",
        scorePred3m: r.score,
        direccionPred: "estable",
        probDeterioro6m: 0,
        metodo: "v1_proyeccion",
      } satisfies PrevisionInput,
    ]),
  );
  const sin = decideGroup(scores, params);
  const con = decideGroup(scores, params, previsiones);
  assert.deepEqual(
    con.map((r) => ({ ...r, bandaPred3mUsada: null })),
    sin,
  );
  assert.ok(con.every((r) => r.bandaPred3mUsada !== null));
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
