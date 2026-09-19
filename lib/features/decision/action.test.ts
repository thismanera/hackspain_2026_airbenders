import assert from "node:assert/strict";
import test from "node:test";
import { decidirAccion, siguienteEstado } from "@/lib/features/decision/action";
import { flujosCapacidad } from "@/lib/features/decision/__fixtures__/flujos";
import type { Elegibilidad } from "@/lib/features/decision/eligibility";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import { ESTADO_INICIAL, type EstadoDecision, type Puerta } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

/** La capacidad ya no viaja en la fila de score: se fija con los flujos (decisión 40). */
const sana = (i: number, p: Partial<ScoreRow> = {}) =>
  scoreRowFixture({
    month: CALENDAR[i],
    score: 82,
    ...flujosCapacidad(10_000),
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
    ...p,
  });

const ELEGIBLE: Elegibilidad = {
  elegible: true,
  motivo: null,
  puertasFallidas: [],
  cajaSoloCapacidad: false,
};

const noElegible = (puertasFallidas: Puerta[], cajaSoloCapacidad = false): Elegibilidad => ({
  elegible: false,
  motivo: `falla ${puertasFallidas[0]}`,
  puertasFallidas,
  cajaSoloCapacidad,
});

/** Elegibilidad de juguete: solo las puertas que estos fixtures mueven, con su lista de fallos. */
function puertas(r: ScoreRow): Elegibilidad {
  const fallidas: Puerta[] = [];
  if (r.confianza < P.confMin) fallidas.push("historia");
  if (r.score < P.scoreMin) fallidas.push("estado");
  if (r.rachaDeficit > P.rachaDeficitMax) fallidas.push("caja");
  return fallidas.length ? noElegible(fallidas) : ELEGIBLE;
}

function run(rows: ScoreRow[], bandaPred: (r: ScoreRow) => "A" | "B" | "C" | "D" = () => "A") {
  let estado: EstadoDecision = ESTADO_INICIAL;
  const out = rows.map((r) => {
    const e = puertas(r);
    const d = decidirAccion(r, e, bandaPred(r), estado);
    estado = siguienteEstado(estado, d, r, bandaPred(r), e);
    return { ...d, estado };
  });
  // Propiedad transversal: la histéresis nunca saca a `L_vigente` del grid de `redondeo_L`.
  for (const d of out)
    assert.equal(d.LVigente % P.redondeoL, 0, `L_vigente fuera del grid: ${d.LVigente}`);
  return out;
}

test("sana: abrir at month 1, mantener afterwards", () => {
  const out = run([sana(0), sana(1), sana(2)]);
  assert.equal(out[0].accion, "abrir");
  assert.equal(out[0].LVigente, 120_000);
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[2].estado.LPrev, 120_000);
});

test("mejora: ampliar capped at +25 % per month, only if L > 1.15 × L_prev", () => {
  const out = run([
    sana(0, flujosCapacidad(5_000)),
    sana(1, { ...flujosCapacidad(10_000), direccion: "mejora" }),
  ]);
  assert.equal(out[0].LVigente, 60_000);
  assert.equal(out[1].accion, "ampliar");
  assert.equal(out[1].LVigente, 75_000);
});

test("deterioro estructural: reducir immediately without hysteresis", () => {
  // Corrección sobre el fixture del plan: con `score: 58` la banda es C y el recorte
  // estructural de `bandaEfectiva` la baja a D (factor 0 → L = 0), no a C con 48 000.
  // Con `score: 68` (banda B) el recorte da C: L = 120 000 × 0,4 = 48 000, que es el
  // número que el fixture §13 quiere ilustrar.
  const out = run([
    sana(0),
    sana(1, { score: 68, direccion: "deterioro", naturaleza: "estructural" }),
  ]);
  assert.equal(out[1].accion, "reducir");
  assert.equal(out[1].bandaEfectiva, "C");
  assert.equal(out[1].LVigente, 48_000); // sin histéresis: la señal manda
});

test("bache temporal: a one-off drop is not confirmed, limit held", () => {
  const out = run([sana(0), sana(1, flujosCapacidad(5_000)), sana(2)]);
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[1].LVigente, 120_000);
  assert.equal(out[1].estado.mesesReduccionSeguidos, 1);
  assert.equal(out[2].estado.mesesReduccionSeguidos, 0);
});

test("two months below 85 % → reducir with the −25 % cap", () => {
  const out = run([sana(0), sana(1, flujosCapacidad(5_000)), sana(2, flujosCapacidad(5_000))]);
  assert.equal(out[2].accion, "reducir");
  assert.equal(out[2].LVigente, 90_000);
});

test("cerrar and reapertura after 2 consecutive eligible months", () => {
  const out = run([sana(0), sana(1, { score: 40 }), sana(2), sana(3)]);
  assert.equal(out[1].accion, "cerrar");
  assert.equal(out[1].LVigente, 0);
  assert.equal(out[2].accion, "mantener");
  assert.equal(out[2].LVigente, 0);
  assert.equal(out[3].accion, "abrir");
});

test("previsión peor: hold, then preventive reducir after 2 months; never ampliar", () => {
  const out = run([sana(0), sana(1), sana(2), sana(3, flujosCapacidad(20_000))], (r) =>
    r.month === CALENDAR[0] ? "A" : "C",
  );
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[1].estado.mesesPredPeorSeguidos, 1);
  assert.equal(out[2].accion, "reducir");
  assert.equal(out[2].LVigente, 90_000); // L con factor 0,4 = 48 k, acotado por histéresis a 120 k × 0,75
  // Corrección sobre el fixture del plan: el mes 4 sale "mantener", no "reducir".
  // Lp = 90 000; con capacidad 20 k, L = 240 000 y L_pred (factor 0,4) = 96 000 ≥ Lp,
  // así que la reducción preventiva no dispara; ampliar está vetado por la banda
  // prevista peor (C < A) y L no cae por debajo de 0,85 × Lp → mantener con Lp.
  assert.equal(out[3].accion, "mantener");
  assert.equal(out[3].LVigente, 90_000);
  assert.notEqual(out[3].accion, "ampliar");
});

test("not eligible ⇒ L and L_vigente are 0, but limite_cap/limite_op stay on the row", () => {
  const r = sana(0);
  const d = decidirAccion(r, noElegible(["historia"]), "A", ESTADO_INICIAL);
  assert.equal(d.accion, "cerrar");
  assert.equal(d.L, 0);
  assert.equal(d.LVigente, 0);
  assert.equal(d.limite.limiteCap, 120_000);
  assert.equal(d.limite.limiteOp, 240_000);
});

test("nothing to open: L = 0 comes out as mantener, not abrir", () => {
  // banda D (score 40) pero elegible por la puerta falsa del helper: factor 0 → L = 0.
  const out = run([sana(0, { score: 46, ...flujosCapacidad(0) })]);
  assert.equal(out[0].L, 0);
  assert.equal(out[0].accion, "mantener");
  assert.equal(out[0].LVigente, 0);
});

test("a confirmed reducir resets the counter and a later recovery can ampliar again", () => {
  const out = run([
    sana(0),
    sana(1, flujosCapacidad(5_000)),
    sana(2, flujosCapacidad(5_000)),
    sana(3, { ...flujosCapacidad(10_000), direccion: "mejora" }),
  ]);
  assert.equal(out[2].accion, "reducir");
  assert.equal(out[2].LVigente, 90_000);
  assert.equal(out[2].estado.mesesReduccionSeguidos, 2);
  // mes 4: L vuelve a 120 k > 1,15 × 90 k → ampliar y el contador de bajadas se reinicia.
  // Techo del grid: 90 000 × 1,25 = 112 500 → 112 000.
  assert.equal(out[3].accion, "ampliar");
  assert.equal(out[3].LVigente, 112_000);
  assert.equal(out[3].estado.mesesReduccionSeguidos, 0);
});

test("the hysteresis band lands on the redondeo_L grid on both sides", () => {
  // Lp = 67 000: techo 83 750 → 83 000 (abajo) · suelo 50 250 → 51 000 (arriba)
  const prev: EstadoDecision = { ...ESTADO_INICIAL, LPrev: 67_000, accionPrev: "abrir" };
  const e = ELEGIBLE;
  const arriba = decidirAccion(sana(1, flujosCapacidad(30_000)), e, "A", prev);
  assert.equal(arriba.accion, "ampliar");
  assert.equal(arriba.LVigente, 83_000);
  const abajo = decidirAccion(sana(1, flujosCapacidad(1_000)), e, "A", {
    ...prev,
    mesesReduccionSeguidos: 1,
  });
  assert.equal(abajo.accion, "reducir");
  assert.equal(abajo.LVigente, 51_000);
});

/** Decisión 42: cierre confirmado para las puertas blandas. */
const conLinea: EstadoDecision = { ...ESTADO_INICIAL, LPrev: 120_000, accionPrev: "abrir" };

test("42: un fallo blando mantiene la línea el primer mes y cierra al segundo", () => {
  const blanda = noElegible(["historia"]);
  const mes1 = decidirAccion(sana(1), blanda, "A", conLinea);
  assert.equal(mes1.accion, "mantener");
  assert.equal(mes1.cierrePendiente, true);
  assert.equal(mes1.LVigente, 120_000); // la línea sigue viva un mes más
  assert.equal(mes1.L, 0); // pero el motor ya no recomienda nada
  const estado = siguienteEstado(conLinea, mes1, sana(1), "A", blanda);
  assert.equal(estado.mesesPuertaBlandaSeguidos, 1);
  assert.equal(estado.mesesElegibleSeguidos, 0); // un mes de gracia no es un mes elegible
  const mes2 = decidirAccion(sana(2), blanda, "A", estado);
  assert.equal(mes2.accion, "cerrar");
  assert.equal(mes2.cierrePendiente, false);
  assert.equal(mes2.LVigente, 0);
});

test("42: `caja` es blanda solo cuando falla por capacidad, no por racha de déficit", () => {
  const capacidad = decidirAccion(
    sana(1, flujosCapacidad(0)),
    noElegible(["caja"], true),
    "A",
    conLinea,
  );
  assert.equal(capacidad.accion, "mantener");
  assert.equal(capacidad.cierrePendiente, true);
  const racha = decidirAccion(
    sana(1, { rachaDeficit: 3 }),
    noElegible(["caja"], false),
    "A",
    conLinea,
  );
  assert.equal(racha.accion, "cerrar");
  assert.equal(racha.LVigente, 0);
});

test("42: las puertas duras cierran el mismo mes, solas o mezcladas con una blanda", () => {
  const casos: Puerta[][] = [
    ["estado"],
    ["fiabilidad"],
    ["clientes"],
    ["grupo"],
    ["historia", "estado"],
  ];
  for (const fallidas of casos) {
    const d = decidirAccion(sana(1, { rachaB2: 2 }), noElegible(fallidas), "A", conLinea);
    assert.equal(d.accion, "cerrar", fallidas.join("+"));
    assert.equal(d.cierrePendiente, false, fallidas.join("+"));
  }
});

test("42: sin línea viva no hay nada que conservar y el cierre es inmediato", () => {
  const d = decidirAccion(sana(1), noElegible(["historia"]), "A", ESTADO_INICIAL);
  assert.equal(d.accion, "cerrar");
  assert.equal(d.cierrePendiente, false);
});

test("42: un mes bueno entre dos malos reinicia el contador", () => {
  const blanda = noElegible(["historia"]);
  const uno = decidirAccion(sana(1), blanda, "A", conLinea);
  const tras1 = siguienteEstado(conLinea, uno, sana(1), "A", blanda);
  const bueno = decidirAccion(sana(2), ELEGIBLE, "A", tras1);
  const tras2 = siguienteEstado(tras1, bueno, sana(2), "A", ELEGIBLE);
  assert.equal(tras2.mesesPuertaBlandaSeguidos, 0);
  // y el siguiente fallo blando vuelve a tener su mes de gracia
  assert.equal(decidirAccion(sana(3), blanda, "A", tras2).cierrePendiente, true);
});
