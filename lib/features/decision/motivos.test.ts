import assert from "node:assert/strict";
import test from "node:test";
import type { CausaReduccion } from "@/lib/features/decision/action";
import { dec, eur, motivoAccion, motivoPuerta, pct } from "@/lib/features/decision/motivos";
import type { Accion, Banda } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

const r = scoreRowFixture({
  score: 72,
  deltaContrib: [
    { id: "A1", delta: -3.21 },
    { id: "C5", delta: 0.4 },
  ],
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
    ["ampliar", {}, /^Límite sube de 100\.000 € a 120\.000 €: A1 -3,2$/],
    [
      "reducir",
      { LVigente: 75_000, causaReduccion: "estructural" },
      /^Límite baja de 100\.000 € a 75\.000 €: deterioro estructural, A1 -3,2$/,
    ],
    ["mantener", { LVigente: 100_000 }, /^Sin cambios: score 72, límite 100\.000 €$/],
    ["cerrar", { motivoCierre: "Score 40 por debajo de 45" }, /^Score 40 por debajo de 45$/],
  ];
  for (const [accion, patch, esperado] of casos)
    assert.match(motivoAccion(accion, r, ctx(patch)), esperado, accion);
  // `cerrar` sin motivo de puerta cae en el texto por defecto
  assert.equal(motivoAccion("cerrar", r, ctx()), "No elegible");
});

test("the three mantener variants", () => {
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
});

test("the four causaReduccion variants", () => {
  const causa = (c: CausaReduccion, p: Partial<Ctx> = {}) =>
    motivoAccion("reducir", r, ctx({ LVigente: 75_000, causaReduccion: c, ...p }));
  assert.match(causa("estructural"), /deterioro estructural, A1 -3,2$/);
  assert.match(causa("confirmada"), /2 meses por debajo, A1 -3,2$/);
  assert.match(causa("prevision", { bandaPred: "C" }), /previsión: banda C en 3 meses, A1 -3,2$/);
  assert.match(
    causa("grupo", { causaCrossDefault: "COMP_X" }),
    /cross-default de COMP_X, A1 -3,2$/,
  );
  // "grupo" sin empresa causante es el prorrateo del techo, no un cross-default
  assert.match(causa("grupo"), /techo de grupo, A1 -3,2$/);
  assert.match(causa(null), /2 meses por debajo, A1 -3,2$/);
});

test("motivoPuerta interpolates the parameters and reads C4 when the gate fails", () => {
  assert.equal(
    motivoPuerta("historia", scoreRowFixture({ confianza: 0.4 }), null),
    "Historial insuficiente: confianza 0,40 < 0,5",
  );
  assert.equal(
    motivoPuerta("estado", scoreRowFixture({ score: 40 }), null),
    "Score 40 por debajo de 45",
  );
  assert.equal(
    motivoPuerta("fiabilidad", scoreRowFixture({ rachaB2: 2 }), null),
    "2 meses seguidos sin pagar obligaciones",
  );
  assert.equal(
    motivoPuerta("caja", scoreRowFixture({ rachaDeficit: 3 }), null),
    "3 meses seguidos en déficit",
  );
  assert.equal(
    motivoPuerta("caja", scoreRowFixture({ capacidadCuotaAdv: 0 }), null),
    "Caja estresada no cubre cuotas actuales",
  );
  assert.equal(
    motivoPuerta("clientes", scoreRowFixture({ C4: 0.55 }), null),
    "55 % de facturas vencidas sin cobrar",
  );
  assert.equal(
    motivoPuerta("grupo", scoreRowFixture({ D1: 0.5 }), "COMP_X"),
    "Cierre de COMP_X (50 % del grupo)",
  );
  assert.match(motivoPuerta("grupo", scoreRowFixture({ D1: 0.5 }), null), /una empresa del grupo/);
});

test("topDelta falls back when there are no contributions", () => {
  assert.match(
    motivoAccion("ampliar", scoreRowFixture({ deltaContrib: [] }), ctx()),
    /: sin cambios$/,
  );
});
