import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { decideLegacy } from "@/lib/features/decision/legacy";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function row(month: string, p: Partial<ScoreRow> = {}): ScoreRow {
  return scoreRowFixture({ month, ...p });
}

// Con la fila base: capacidad adversa = (0,8·100k − 1,1·60k)/1,3 − 5k = 5 769,23 €/mes.
const CAP_ADV = (0.8 * 100_000 - 1.1 * 60_000) / 1.3 - 5_000;
const LIMITE_CAP = CAP_ADV * 12;
const redondeado = (x: number) => Math.round(x / 1000) * 1000;

test("legacy decision reproduces band A limit and opens on first month", () => {
  const d = decideLegacy([row(CALENDAR[0]), row(CALENDAR[1])]);
  assert.equal(d.length, 2);
  for (const x of d) decisionRowSchema.parse(x);
  assert.equal(d[0].banda, "A");
  assert.equal(d[0].accion, "abrir");
  assert.equal(d[0].limiteRecomendado, redondeado(Math.min(LIMITE_CAP, 0.8 * 300_000)));
  assert.equal(d[0].limiteVigente, d[0].limiteRecomendado);
  assert.equal(d[1].accion, "mantener");
  assert.equal(d[0].precio, 0.05);
});

test("hard close on band D, three deficits or overdue > 40 %", () => {
  assert.equal(decideLegacy([row(CALENDAR[0], { score: 40 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { rachaDeficit: 3 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { C4: 0.5 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { confianza: 0.2 })])[0].accion, "mantener");
});

test("the operating limit binds when receipts are small", () => {
  const d = decideLegacy([row(CALENDAR[0], { cobrosOpMedia3m: 10_000 })])[0];
  assert.equal(d.limiteOp, 0.8 * 10_000 * 3);
  assert.ok(d.limiteOp < d.limiteCap);
  assert.equal(d.limiteRecomendado, 24_000);
});

test("bands B and C scale the limit and set their price", () => {
  const b = decideLegacy([row(CALENDAR[0], { score: 65 })])[0];
  assert.equal(b.banda, "B");
  assert.equal(b.precio, 0.07);
  assert.equal(b.limiteRecomendado, redondeado(LIMITE_CAP * 0.7));
  const c = decideLegacy([row(CALENDAR[0], { score: 50 })])[0];
  assert.equal(c.banda, "C");
  assert.equal(c.precio, 0.1);
  assert.equal(c.limiteRecomendado, redondeado(LIMITE_CAP * 0.4));
});

test("confidence below the target cuts the limit proportionally", () => {
  const d = decideLegacy([row(CALENDAR[0], { confianza: 0.3 })])[0];
  assert.equal(d.limiteRecomendado, redondeado(LIMITE_CAP * (0.3 / 0.6)));
  assert.equal(d.accion, "mantener"); // 0,3 < confianza de apertura
  assert.equal(d.limiteVigente, 0);
  const alta = decideLegacy([row(CALENDAR[0], { confianza: 0.95 })])[0];
  assert.equal(alta.limiteRecomendado, redondeado(LIMITE_CAP)); // el recorte se capa en 1
});

test("structural deterioration lowers the band before pricing", () => {
  const d = decideLegacy([
    row(CALENDAR[0], { direccion: "deterioro", naturaleza: "estructural" }),
  ])[0];
  assert.equal(d.banda, "B"); // A degradada
  assert.equal(d.precio, 0.07);
});

test("monthly moves are capped at +25 % and -25 %", () => {
  const ampliar = decideLegacy([
    row(CALENDAR[0], { cobrosOpMedia3m: 10_000 }),
    row(CALENDAR[1]),
  ]);
  assert.equal(ampliar[0].limiteVigente, 24_000);
  assert.equal(ampliar[1].accion, "ampliar");
  assert.equal(ampliar[1].limiteVigente, 24_000 * 1.25);

  const reducir = decideLegacy([
    row(CALENDAR[0]),
    row(CALENDAR[1], { direccion: "deterioro", naturaleza: "estructural" }),
  ]);
  const previo = reducir[0].limiteVigente;
  assert.equal(reducir[1].accion, "reducir");
  assert.equal(reducir[1].limiteVigente, previo * 0.75);
  assert.ok(reducir[1].limiteRecomendado < previo * 0.75); // el suelo del -25 % manda
});

test("motivo names the action and the two largest contribution moves", () => {
  const d = decideLegacy([
    row(CALENDAR[0], {
      deltaContrib: [
        { id: "A1", delta: -3.21 },
        { id: "grupo", delta: 1.54 },
        { id: "C5", delta: 0.1 },
      ],
    }),
  ])[0];
  assert.equal(d.motivo, "abrir: A1 -3.2, grupo +1.5");
});
