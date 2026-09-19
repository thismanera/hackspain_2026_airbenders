import assert from "node:assert/strict";
import test from "node:test";
import { metricasDecision } from "@/lib/features/decision/metrics";
import type { DecisionRow } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { CALENDAR } from "@/lib/features/scoring/windows";

function dec(month: string, accion: DecisionRow["accion"], LVigente: number): DecisionRow {
  return {
    company: "c",
    month,
    accion,
    LVigente,
    menu: [
      {
        plazo: 60,
        cantidadMax: LVigente,
        tae: 0.06,
        costeMax: 0,
        desglose: {
          base: 0.06,
          primaPlazo: 0,
          primaConfianza: 0,
          ajusteTendencia: 0,
          primaPrevision: 0,
        },
      },
    ],
    plazoNaturalAnticipo: 60,
  } as unknown as DecisionRow;
}

test("exposición evitada, ingresos simulados, oscilación, cierres falsos y lead time de reducción", () => {
  const deficit = [
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    false,
    false,
    false,
    false,
    false,
    false,
    false,
  ];
  const scores = deficit.map((d, i) => scoreRowFixture({ month: CALENDAR[i], deficitMes: d }));
  const decisions = deficit.map((_, i) =>
    dec(
      CALENDAR[i],
      i === 5 ? "reducir" : i === 7 ? "cerrar" : "mantener",
      i < 5 ? 100_000 : i < 7 ? 50_000 : 0,
    ),
  );
  const m = metricasDecision(scores, decisions);
  assert.equal(m.eventos, 1);
  assert.equal(m.leadTimeCierreMediano, 3); // reducir en índice 5, evento en 8
  assert.equal(m.exposicionEvitada, 50_000); // L en t−3 = índice 5 (50 k) − L en el evento (0)
  assert.ok(m.ingresosSimulados > 0);
  assert.ok(Math.abs(m.oscilacion - 2 / 18) < 1e-9);
  assert.equal(m.cierresFalsos, 0);
});

test("la oscilación cuenta transiciones: seguir cerrada no es un cambio", () => {
  const meses = CALENDAR.slice(0, 6);
  const scores = meses.map((month) => scoreRowFixture({ month }));
  const decisions = meses.map((month) => dec(month, "cerrar", 0));
  const m = metricasDecision(scores, decisions);
  assert.equal(m.cierres, 1);
  assert.ok(Math.abs(m.oscilacion - 1 / 6) < 1e-9); // un cambio en 6 empresa-mes, no seis
});
