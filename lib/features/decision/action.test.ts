import assert from "node:assert/strict";
import test from "node:test";
import { decidirAccion, siguienteEstado } from "@/lib/features/decision/action";
import { ESTADO_INICIAL, type EstadoDecision } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const sana = (i: number, p: Partial<ScoreRow> = {}) =>
  scoreRowFixture({
    month: CALENDAR[i],
    score: 82,
    capacidadCuotaAdv: 10_000,
    cobrosOpMedia3m: 100_000,
    confianza: 0.9,
    ...p,
  });

function run(rows: ScoreRow[], bandaPred: (r: ScoreRow) => "A" | "B" | "C" | "D" = () => "A") {
  let estado: EstadoDecision = ESTADO_INICIAL;
  return rows.map((r) => {
    const d = decidirAccion(
      r,
      {
        elegible: r.score >= 45 && r.confianza >= 0.5 && r.rachaDeficit < 3,
        motivo: null,
        puertasFallidas: [],
      },
      bandaPred(r),
      estado,
    );
    estado = siguienteEstado(estado, d, r, bandaPred(r));
    return { ...d, estado };
  });
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
    sana(0, { capacidadCuotaAdv: 5_000 }),
    sana(1, { capacidadCuotaAdv: 10_000, direccion: "mejora" }),
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
  const out = run([sana(0), sana(1, { capacidadCuotaAdv: 5_000 }), sana(2)]);
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[1].LVigente, 120_000);
  assert.equal(out[1].estado.mesesReduccionSeguidos, 1);
  assert.equal(out[2].estado.mesesReduccionSeguidos, 0);
});

test("two months below 85 % → reducir with the −25 % cap", () => {
  const out = run([
    sana(0),
    sana(1, { capacidadCuotaAdv: 5_000 }),
    sana(2, { capacidadCuotaAdv: 5_000 }),
  ]);
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
  const out = run([sana(0), sana(1), sana(2), sana(3, { capacidadCuotaAdv: 20_000 })], (r) =>
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
