import assert from "node:assert/strict";
import test from "node:test";
import { decisionInputFixture } from "@/lib/features/decision/__fixtures__/decision-input";
import type { CausaReduccion } from "@/lib/features/decision/action";
import { dec, eur, motivoAccion, motivoPuerta, pct } from "@/lib/features/decision/motivos";
import type { Accion, Banda } from "@/lib/features/decision/types";

const r = decisionInputFixture({
  score: 72,
  tend3m: { A: -3.21, B: 0.4, C: null },
});

type Ctx = Parameters<typeof motivoAccion>[2];
const ctx = (p: Partial<Ctx> = {}): Ctx => ({
  banda: "A" as Banda,
  L: 120_000,
  LPrev: 100_000,
  LVigente: 120_000,
  TMax: 180,
  motivoCierre: null,
  causaReduccion: null,
  causaCrossDefault: null,
  bandaPred: null,
  mesesParaReapertura: null,
  ...p,
});

test("formatters use Spanish separators", () => {
  assert.equal(pct(0.405), "41 %");
  assert.equal(dec(0.5, 1), "0,5");
  assert.equal(eur(120_000), "120.000 €");
});

test("the five motivoAccion branches", () => {
  const casos: [Accion, Partial<Ctx>, RegExp][] = [
    ["abrir", {}, /^Elegible: score 72 \(banda A\), límite 120\.000 € hasta 180 d$/],
    ["ampliar", {}, /^Límite sube de 100\.000 € a 120\.000 €: A -3,2$/],
    [
      "reducir",
      { LVigente: 75_000, causaReduccion: "estructural" },
      /^Límite baja de 100\.000 € a 75\.000 €: deterioro estructural, A -3,2$/,
    ],
    ["mantener", { LVigente: 100_000 }, /^Sin cambios: score 72, límite 100\.000 €$/],
    ["cerrar", { motivoCierre: "Score 40 por debajo de 45" }, /^Score 40 por debajo de 45$/],
  ];
  for (const [accion, patch, esperado] of casos)
    assert.match(motivoAccion(accion, r, ctx(patch)), esperado, accion);
  // `cerrar` sin motivo de puerta cae en el texto por defecto
  assert.equal(motivoAccion("cerrar", r, ctx()), "No elegible");
});

test("the four mantener variants", () => {
  assert.equal(
    motivoAccion("mantener", r, ctx({ mesesParaReapertura: 2 })),
    "Reapertura en 2 meses",
  );
  assert.equal(
    motivoAccion("mantener", r, ctx({ causaReduccion: "confirmada" })),
    "Pendiente confirmar bajada",
  );
  assert.match(motivoAccion("mantener", r, ctx()), /^Sin cambios: score 72/);
  // la reapertura manda sobre la bajada pendiente
  assert.equal(
    motivoAccion("mantener", r, ctx({ mesesParaReapertura: 1, causaReduccion: "confirmada" })),
    "Reapertura en 1 meses",
  );
  // decisión 42: el mes de gracia de una puerta blanda manda sobre todas las demás
  assert.equal(
    motivoAccion(
      "mantener",
      r,
      ctx({
        cierrePendiente: true,
        motivoCierre: "Historial insuficiente: confianza 0,30 < 0,4",
        mesesParaReapertura: 1,
      }),
    ),
    "Pendiente confirmar cierre: Historial insuficiente: confianza 0,30 < 0,4",
  );
});

test("the four causaReduccion variants", () => {
  const causa = (c: CausaReduccion, p: Partial<Ctx> = {}) =>
    motivoAccion("reducir", r, ctx({ LVigente: 75_000, causaReduccion: c, ...p }));
  assert.match(causa("estructural"), /deterioro estructural, A -3,2$/);
  assert.match(causa("confirmada"), /2 meses por debajo, A -3,2$/);
  assert.match(causa("prevision", { bandaPred: "C" }), /previsión: banda C en 3 meses, A -3,2$/);
  assert.match(causa("grupo", { causaCrossDefault: "COMP_X" }), /cross-default de COMP_X, A -3,2$/);
  // "grupo" sin empresa causante es el prorrateo del techo, no un cross-default
  assert.match(causa("grupo"), /techo de grupo, A -3,2$/);
  assert.match(causa(null), /2 meses por debajo, A -3,2$/);
});

test("decisión 43: el sufijo sale de la tendencia, no de la cascada de scoring", () => {
  // el pilar que más se mueve manda, con su signo
  assert.match(
    motivoAccion("ampliar", decisionInputFixture({ tend3m: { A: 1.2, B: -4.5, C: 0.1 } }), ctx()),
    /: B -4,5$/,
  );
  assert.match(
    motivoAccion("ampliar", decisionInputFixture({ tend3m: { A: null, B: null, C: 6 } }), ctx()),
    /: C \+6,0$/,
  );
  // sin tendencia por pilar se cae al movimiento del score
  assert.match(
    motivoAccion("ampliar", decisionInputFixture({ tendScore3m: -2.5 }), ctx()),
    /: score -2,5$/,
  );
  // y sin ninguna tendencia, el texto lo dice
  assert.match(motivoAccion("ampliar", decisionInputFixture(), ctx()), /: sin cambios$/);
});

test("decisión 44: cada puerta tiene el texto de su alerta y el de su umbral de pilar", () => {
  assert.equal(
    motivoPuerta("historia", decisionInputFixture({ confianza: 0.3 }), null),
    "Historial insuficiente: confianza 0,30 < 0,4",
  );
  assert.equal(
    motivoPuerta("estado", decisionInputFixture({ score: 40 }), null),
    "Score 40 por debajo de 45",
  );
  assert.equal(
    motivoPuerta("fiabilidad", decisionInputFixture({ alertas: ["impago_obligaciones"] }), null),
    "Impago de obligaciones (alerta)",
  );
  assert.equal(
    motivoPuerta("fiabilidad", decisionInputFixture({ subscores: { A: 80, B: 42, C: 80 } }), null),
    "Pago de obligaciones 42,0 por debajo de 60",
  );
  assert.equal(
    motivoPuerta("caja", decisionInputFixture({ alertas: ["deficit_persistente"] }), null),
    "Déficit persistente (alerta)",
  );
  assert.equal(
    motivoPuerta("caja", decisionInputFixture({ subscores: { A: 31.5, B: 80, C: 80 } }), null),
    "Estado de caja 31,5 por debajo de 50",
  );
  assert.equal(
    motivoPuerta("clientes", decisionInputFixture({ alertas: ["vencido_alto"] }), null),
    "Vencido alto (alerta)",
  );
  assert.equal(
    motivoPuerta("clientes", decisionInputFixture({ subscores: { A: 80, B: 80, C: 12 } }), null),
    "Clientes 12,0 por debajo de 50",
  );
  assert.equal(
    motivoPuerta("grupo", decisionInputFixture({ D1: 0.5 }), "COMP_X"),
    "Cierre de COMP_X (50 % del grupo)",
  );
  assert.match(
    motivoPuerta("grupo", decisionInputFixture({ D1: 0.5 }), null),
    /una empresa del grupo/,
  );
});
