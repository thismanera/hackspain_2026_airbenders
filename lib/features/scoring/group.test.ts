import assert from "node:assert/strict";
import test from "node:test";
import { avalGrupo, groupVariables, type GroupMember } from "@/lib/features/scoring/group";

function member(p: Partial<GroupMember>): GroupMember {
  return {
    company: "x", scoreSolo: 50, confianza: 1, cobrosOp12m: 0, pagosOp12m: 0, capacidadCuotaAdv: 0,
    obligacionesMedia6m: 1, intragrupoIn12m: 0, intragrupoOut12m: 0, ...p,
  };
}

test("grupo_aval: rich sibling lifts a weak subsidiary, capped by w", () => {
  const filial = member({ company: "f", scoreSolo: 35, cobrosOp12m: 240_000, pagosOp12m: 252_000, obligacionesMedia6m: 1_000, intragrupoIn12m: 60_000 });
  const hermana = member({ company: "h", scoreSolo: 80, cobrosOp12m: 6_000_000, pagosOp12m: 4_200_000, capacidadCuotaAdv: 50_000, intragrupoOut12m: 60_000 });
  const d = groupVariables(filial, [hermana]);
  assert.ok(Math.abs(d.D1 - 240_000 / 6_240_000) < 1e-9);
  assert.equal(d.D2, 80);
  assert.equal(d.D3, 50);
  assert.ok(Math.abs(d.D4! - 0.25) < 1e-9);
  assert.ok(Math.abs(d.D5 - 60_000 / 492_000) < 1e-9);
  const aval = avalGrupo(35, d.D2, d.D3, d.D5);
  const w = 0.4 * Math.min(1, d.D5 / 0.2);
  assert.ok(Math.abs(aval - w * 45) < 1e-9);
  assert.ok(aval > 0 && aval <= 20);
});

test("grupo_contagio: weak sibling drags a healthy one without capacity filter", () => {
  const filial = member({ company: "f", scoreSolo: 78, cobrosOp12m: 1_200_000, pagosOp12m: 1_020_000, intragrupoOut12m: 180_000 });
  const hermana = member({ company: "h", scoreSolo: 30, cobrosOp12m: 600_000, pagosOp12m: 700_000, capacidadCuotaAdv: 0, intragrupoIn12m: 180_000 });
  const d = groupVariables(filial, [hermana]);
  assert.equal(d.D3, 0);
  const aval = avalGrupo(78, d.D2, d.D3, d.D5);
  const w = 0.4 * Math.min(1, d.D5 / 0.2);
  assert.ok(Math.abs(aval - w * (30 - 78)) < 1e-9);
  assert.ok(aval < 0);
});

test("single company: no group effect; cap at ±20", () => {
  const d = groupVariables(member({ cobrosOp12m: 100 }), []);
  assert.equal(d.D1, 1);
  assert.equal(d.D2, null);
  assert.equal(avalGrupo(50, d.D2, d.D3, d.D5), 0);
  assert.equal(avalGrupo(10, 100, 10, 1), 20);
});
