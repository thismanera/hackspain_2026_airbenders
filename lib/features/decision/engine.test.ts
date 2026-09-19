import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import {
  crossDefaultSiguiente,
  decideGroup,
  parametrosDecision,
} from "@/lib/features/decision/engine";
import { ESTADO_INICIAL, type EstadoDecision } from "@/lib/features/decision/types";
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

test("cross-default flag lifts the month the fallen company reopens", () => {
  const activo: EstadoDecision = {
    ...ESTADO_INICIAL,
    crossDefaultActivo: true,
    causaCrossDefault: "a",
  };
  const cerrada = new Map([["a", { ...ESTADO_INICIAL, LPrev: 0 }]]);
  const reabierta = new Map([["a", { ...ESTADO_INICIAL, LPrev: 50_000 }]]);

  // se enciende el mes de la caída
  assert.deepEqual(crossDefaultSiguiente(ESTADO_INICIAL, true, "a", cerrada), {
    crossDefaultActivo: true,
    causaCrossDefault: "a",
  });
  // sigue encendido mientras la causante siga cerrada
  assert.deepEqual(crossDefaultSiguiente(activo, false, null, cerrada), {
    crossDefaultActivo: true,
    causaCrossDefault: "a",
  });
  // se levanta cuando la causante reabre
  assert.deepEqual(crossDefaultSiguiente(activo, false, null, reabierta), {
    crossDefaultActivo: false,
    causaCrossDefault: null,
  });
  // sin bandera previa no se enciende solo
  assert.deepEqual(crossDefaultSiguiente(ESTADO_INICIAL, false, null, cerrada), {
    crossDefaultActivo: false,
    causaCrossDefault: null,
  });
});
