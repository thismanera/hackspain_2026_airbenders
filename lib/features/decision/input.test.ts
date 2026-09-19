import assert from "node:assert/strict";
import test from "node:test";
import { proyectar } from "@/lib/features/decision/input";
import type { DecisionInput } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

/** Decisión 43: el contrato de entrada, escrito a mano. Si crece, se justifica aquí. */
const CAMPOS: (keyof DecisionInput)[] = [
  "company",
  "month",
  "groupId",
  "versionScoring",
  "score",
  "confianza",
  "subscores",
  "estado",
  "direccion",
  "naturaleza",
  "tendScore3m",
  "tend3m",
  "alertas",
  "D1",
  "D5",
  "avalGrupo",
  "tamano",
];

test("decisión 43: `proyectar` coge exactamente los campos del contrato, ni uno más", () => {
  const claves = Object.keys(proyectar(scoreRowFixture())).sort();
  assert.deepEqual(claves, [...CAMPOS].sort());
});

test("decisión 43: lo que sale del contrato no llega al motor por ninguna vía", () => {
  const fuera = [
    "cobrosOpMedia6m",
    "pagosOpMedia6m",
    "servicioDeudaMedia6m",
    "capacidadCuotaAdv",
    "rachaB2",
    "rachaDeficit",
    "C3dias",
    "C4",
    "cobrosOpGrupoMedia6m",
    "pagosOpGrupoMedia6m",
    "servicioDeudaGrupoMedia6m",
    "senales",
    "cobertura",
    "variables",
    "deltaContrib",
    "scoreSolo",
    "cobrosOpMedia3m",
  ];
  const claves = new Set(Object.keys(proyectar(scoreRowFixture())));
  for (const k of fuera) assert.ok(!claves.has(k), `${k} no debería estar en DecisionInput`);
});

test("decisión 43: el tamaño es `cobros_op_media3m` y las alertas son solo sus tipos", () => {
  const p = proyectar(
    scoreRowFixture({
      company: "COMP_1",
      groupId: "G1",
      versionParametros: "score-v",
      cobrosOpMedia3m: 123_456,
      alertas: [
        { tipo: "deficit_persistente", desdeMes: "2026-01" },
        { tipo: "vencido_alto", desdeMes: "2026-03" },
      ],
    }),
  );
  assert.equal(p.tamano, 123_456);
  assert.equal(p.versionScoring, "score-v");
  assert.deepEqual(p.alertas, ["deficit_persistente", "vencido_alto"]);
  assert.equal(p.company, "COMP_1");
  assert.equal(p.groupId, "G1");
});

test("decisión 43: pilares, tendencia y bloque de grupo viajan tal cual", () => {
  const p = proyectar(
    scoreRowFixture({
      score: 61.5,
      confianza: 0.55,
      subscores: { A: 44, B: 71, C: 52 },
      estado: "vigilar",
      direccion: "deterioro",
      naturaleza: "estructural",
      tendScore3m: -7.5,
      tend3m: { A: -9, B: 1, C: null },
      D1: 0.42,
      D5: 0.18,
      avalGrupo: 6.25,
    }),
  );
  assert.deepEqual(p.subscores, { A: 44, B: 71, C: 52 });
  assert.deepEqual(p.tend3m, { A: -9, B: 1, C: null });
  assert.equal(p.tendScore3m, -7.5);
  assert.equal(p.estado, "vigilar");
  assert.equal(p.direccion, "deterioro");
  assert.equal(p.naturaleza, "estructural");
  assert.equal(p.D1, 0.42);
  assert.equal(p.D5, 0.18);
  assert.equal(p.avalGrupo, 6.25);
});
