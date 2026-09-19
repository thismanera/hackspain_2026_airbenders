import assert from "node:assert/strict";
import test from "node:test";
import {
  ajusteHolding,
  groupVariables,
  holdingTotals,
  type GroupMember,
} from "@/lib/features/scoring/group";

function member(p: Partial<GroupMember>): GroupMember {
  return {
    company: "x",
    scoreSolo: 50,
    confianza: 1,
    cobrosOp12m: 100,
    pagosOp12m: 80,
    capacidadCuotaAdv: 0,
    obligacionesMedia6m: 1,
    capacidadNeta6m: 20,
    intragrupoIn12m: 0,
    intragrupoOut12m: 0,
    ...p,
  };
}

test("holding adjustment rewards a receiver and penalizes a donor with bounded formulas", () => {
  const receiver = member({ company: "r", scoreSolo: 40, capacidadNeta6m: -100 });
  const donor = member({ company: "d", scoreSolo: 90, capacidadNeta6m: 200 });
  const d = groupVariables(receiver, [donor]);
  assert.equal(d.D2, 90);
  assert.equal(ajusteHolding(receiver, [donor], d.D2, 0.15), 20);
  const donorD = groupVariables(donor, [receiver]);
  assert.equal(ajusteHolding(donor, [receiver], donorD.D2, 0.15), -20);
});

test("capacity, D5 zero, and one-person groups produce no adjustment", () => {
  const me = member({ capacidadNeta6m: -100 });
  assert.equal(ajusteHolding(me, [], null, 0.15), 0);
  assert.equal(ajusteHolding(me, [member({ capacidadNeta6m: 200 })], 50, 0), 0);
  assert.deepEqual(
    holdingTotals([member({ capacidadNeta6m: 10 }), member({ capacidadNeta6m: -4 })]),
    {
      excedente: 10,
      deficit: 4,
    },
  );
});

test("group variables preserve weighted sibling diagnostics", () => {
  const d = groupVariables(member({ cobrosOp12m: 100 }), [
    member({ company: "h", scoreSolo: 80, cobrosOp12m: 300 }),
  ]);
  assert.equal(d.D2, 80);
  assert.equal(d.confD, 1);
  assert.equal(d.D1, 0.25);
  assert.equal(d.D5, 0);
});
