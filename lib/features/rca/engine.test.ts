import assert from "node:assert/strict";
import test from "node:test";

import {
  analisisPostInflexionSchema,
  decisionPostInflexionSchema,
} from "@/lib/features/rca/contracts";
import { analizarReaccionPostInflexion } from "@/lib/features/rca/engine";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { VariableId } from "@/lib/features/scoring/params";
import type { Contribution, ScoreRow } from "@/lib/features/scoring/types";

type VariableChange = Pick<Contribution, "aportacion"> &
  Partial<Pick<Contribution, "raw" | "subnota" | "aplicable" | "pesoEfectivo">>;

function row(
  month: string,
  variables: Partial<Record<VariableId, VariableChange>> = {},
  partial: Partial<ScoreRow> = {},
): ScoreRow {
  const base = scoreRowFixture({ month, ...partial });
  return {
    ...base,
    variables: base.variables.map((variable) => {
      const change = variables[variable.id];
      return change
        ? {
            ...variable,
            raw: 1,
            subnota: 70,
            aplicable: true,
            ...change,
          }
        : variable;
    }),
  };
}

function inflexion(
  type: "pico_bajista" | "suelo_alcista",
  month = "2025-01",
): ScoreRow["inflexion"] {
  return {
    hayInflexion: true,
    tipo: type,
    mesInflexion: month,
    antelacionMeses: 99,
    scoreInflexion: 1,
    canalDesencadenante: "operativo",
    variableDetonante: "A1",
    explicacion: "El cambio observado comenzó en A1.",
  };
}

test("detecta una mejora A1 en el umbral exacto y usa evidencia, no causalidad", () => {
  const rows = [
    row(
      "2025-03",
      { A1: { aportacion: 3.5 } },
      { scoreSolo: 72, inflexion: inflexion("pico_bajista") },
    ),
    row("2025-01", { A1: { aportacion: 2 } }, { scoreSolo: 68 }),
    row("2025-02", { A1: { aportacion: 3 } }, { scoreSolo: 70 }),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.equal(result.aciertos.length, 1);
  assert.equal(result.aciertos[0].variable, "A1");
  assert.equal(result.aciertos[0].deltaPuntos, 1.5);
  assert.match(result.aciertos[0].descripcion, /observada/i);
  assert.equal(result.diagnosticoRespuesta, "reaccion_resiliente");
  assert.equal(
    result.mesesTranscurridos,
    2,
    "the elapsed time comes from months, not the stored hint",
  );
  assert.equal(result.scoreEnInflexion, 68, "the origin score is the observed scoreSolo");
  assert.equal(result.aciertos[0].canal, "operativo");
  assert.equal(result.aciertos[0].productoSugerido, "ninguno");
  assert.equal(result.scoreRecuperableEstimado, 72);
  assert.equal(result.scoreRecuperableGrupoEstimado, 72);
  analisisPostInflexionSchema.parse(result);
});

test("detecta el deterioro B3 y propone acordar el aplazamiento", () => {
  const rows = [
    row("2025-01", { B3: { aportacion: 4 } }, { scoreSolo: 70 }),
    row("2025-02", { B3: { aportacion: 3 } }, { scoreSolo: 68 }),
    row(
      "2025-03",
      { B3: { aportacion: 2.5 } },
      { scoreSolo: 66, inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.equal(result.errores[0].variable, "B3");
  assert.equal(result.errores[0].deltaPuntos, -1.5);
  assert.ok(
    result.playbook.accionesInmediatas.some((action) =>
      action.startsWith("Utilizar confirming o acuerdos de aplazamiento"),
    ),
  );
  assert.equal(result.errores[0].productoSugerido, "embat_confirming");
  assert.equal(result.diagnosticoRespuesta, "reaccion_destructiva");
});

test("C1 y C2 usan materialidad relativa y C5 puede entrar por subnota", () => {
  const rows = [
    row("2025-01", {
      C1: { aportacion: 1 },
      C2: { aportacion: 2 },
      C5: { aportacion: 1, subnota: 60 },
    }),
    row("2025-02", {
      C1: { aportacion: 1.3 },
      C2: { aportacion: 1.7 },
      C5: { aportacion: 1.1, subnota: 85 },
    }),
    row(
      "2025-03",
      {
        C1: { aportacion: 1.3 },
        C2: { aportacion: 1.7 },
        C5: { aportacion: 1.1, subnota: 85 },
      },
      { inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;
  assert.deepEqual(
    result.aciertos.map((item) => item.variable),
    ["C1", "C5"],
  );
  assert.deepEqual(
    result.errores.map((item) => item.variable),
    ["C2"],
  );
  assert.equal(result.aciertos.find((item) => item.variable === "C5")?.productoSugerido, "ninguno");
});

test("conserva el signo de un impacto pequeño pero material por subnota", () => {
  const rows = [
    row("2025-01", { C2: { aportacion: 1, subnota: 50 } }),
    row("2025-02", { C2: { aportacion: 1.01, subnota: 75 } }),
    row(
      "2025-03",
      { C2: { aportacion: 1.01, subnota: 75 } },
      { inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;
  assert.ok((result.aciertos.find((item) => item.variable === "C2")?.deltaPuntos ?? 0) > 0);
});

test("el drenaje del holding solo aumenta el escenario recuperable de grupo", () => {
  const rows = [
    row("2025-01", { A1: { aportacion: 2 } }, { scoreSolo: 70, aportacionGrupo: 0 }),
    row("2025-02", { A1: { aportacion: 1 } }, { scoreSolo: 68, aportacionGrupo: -3 }),
    row(
      "2025-03",
      { A1: { aportacion: 0.5 } },
      { scoreSolo: 66, aportacionGrupo: -3, inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;
  assert.equal(result.scoreRecuperableEstimado, 67.5);
  assert.equal(result.scoreRecuperableGrupoEstimado, 70.5);
  assert.equal(result.diagnosticoRespuesta, "reaccion_destructiva");

  const capped = analizarReaccionPostInflexion([
    row("2025-01", { A1: { aportacion: 1 } }, { scoreSolo: 99, aportacionGrupo: 0 }),
    row("2025-02", { A1: { aportacion: 1 } }, { scoreSolo: 99, aportacionGrupo: -10 }),
    row(
      "2025-03",
      { A1: { aportacion: 1 } },
      { scoreSolo: 99, aportacionGrupo: -10, inflexion: inflexion("pico_bajista") },
    ),
  ])!;
  assert.equal(capped.scoreRecuperableGrupoEstimado, 100);
});

test("el diagnóstico usa el saldo de puntos y los empates siguen el orden canónico", () => {
  const rows = [
    row(
      "2025-01",
      { A1: { aportacion: 1 }, A5: { aportacion: 1 }, B3: { aportacion: 6 } },
      { scoreSolo: 75 },
    ),
    row(
      "2025-02",
      { A1: { aportacion: 2 }, A5: { aportacion: 2 }, B3: { aportacion: 4 } },
      { scoreSolo: 70 },
    ),
    row(
      "2025-03",
      { A1: { aportacion: 2.5 }, A5: { aportacion: 2.5 }, B3: { aportacion: 2 } },
      { scoreSolo: 66, inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.deepEqual(
    result.aciertos.map((item) => item.variable),
    ["A1", "A5"],
  );
  assert.equal(result.errores[0].variable, "B3");
  assert.equal(result.diagnosticoRespuesta, "reaccion_destructiva");
});

test("el holding se explica aparte y no cambia el diagnóstico autónomo", () => {
  const rows = [
    row("2025-01", {}, { aportacionGrupo: 0, scoreSolo: 60 }),
    row("2025-02", {}, { aportacionGrupo: 1, scoreSolo: 60 }),
    row("2025-03", {}, { aportacionGrupo: 2, scoreSolo: 60, inflexion: inflexion("pico_bajista") }),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.deepEqual(result.aciertos, []);
  assert.deepEqual(result.errores, []);
  assert.equal(result.diagnosticoRespuesta, "reaccion_pasiva");
  assert.equal(result.contextoHolding.deltaPuntos, 2);
  assert.equal(result.contextoHolding.observacion?.variable, "holding");
  assert.equal(result.contextoHolding.observacion?.tipo, "acierto_mitigante");
  assert.equal(result.contextoHolding.observacion?.productoSugerido, "cortafuegos_holding");
  assert.deepEqual(result.playbook.accionesInmediatas, []);
});

test("un suelo confirmado se clasifica en recuperación", () => {
  const rows = [
    row("2025-01", { C4: { aportacion: 2 } }, { scoreSolo: 42 }),
    row("2025-02", { C4: { aportacion: 3 } }, { scoreSolo: 48 }),
    row(
      "2025-03",
      { C4: { aportacion: 4 } },
      { scoreSolo: 55, inflexion: inflexion("suelo_alcista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.equal(result.diagnosticoRespuesta, "en_recuperacion");
  assert.equal(result.deltaScoreTotal, 13);
});

test("devuelve null sin inflexión, sin destino, con historia corta o con huecos", () => {
  const noInflexion = [row("2025-01"), row("2025-02"), row("2025-03")];
  assert.equal(analizarReaccionPostInflexion(noInflexion), null);
  assert.equal(analizarReaccionPostInflexion(noInflexion, "2025-04"), null);

  const short = [row("2025-01"), row("2025-02", {}, { inflexion: inflexion("pico_bajista") })];
  assert.equal(analizarReaccionPostInflexion(short), null);

  const gap = [row("2025-01"), row("2025-03", {}, { inflexion: inflexion("pico_bajista") })];
  assert.equal(analizarReaccionPostInflexion(gap), null);
});

test("rechaza empresas, meses duplicados y versiones incompatibles", () => {
  const multipleCompanies = [row("2025-01"), row("2025-02", {}, { company: "otra" })];
  assert.throws(() => analizarReaccionPostInflexion(multipleCompanies), /una empresa/);
  assert.throws(() => analizarReaccionPostInflexion([row("2025-01"), row("2025-01")]), /duplicado/);

  const incompatible = [
    row("2025-01", {}, { versionParametros: "v1" }),
    row("2025-02", {}, { versionParametros: "v2" }),
    row("2025-03", {}, { versionParametros: "v1", inflexion: inflexion("pico_bajista") }),
  ];
  assert.throws(() => analizarReaccionPostInflexion(incompatible), /incompatibles/);
  assert.throws(
    () =>
      analizarReaccionPostInflexion([
        row("2025-01"),
        row("2025-02"),
        row(
          "2025-03",
          {},
          {
            inflexion: { ...inflexion("pico_bajista"), mesInflexion: "2025-13" },
          },
        ),
      ]),
    /mes inválido/,
  );
});

test("excluye evidencia ausente, cambios de aplicabilidad y cambios de peso", () => {
  const rows = [
    row("2025-01", {
      A1: { aportacion: 1 },
      A5: { aportacion: 1 },
      B3: { aportacion: 4 },
    }),
    row("2025-02", {
      A1: { aportacion: 2, raw: null },
      A5: { aportacion: 2, aplicable: false },
      B3: { aportacion: 3, pesoEfectivo: 0.04 },
    }),
    row(
      "2025-03",
      { A1: { aportacion: 3 }, A5: { aportacion: 3 }, B3: { aportacion: 2 } },
      { inflexion: inflexion("pico_bajista") },
    ),
  ];
  const result = analizarReaccionPostInflexion(rows)!;

  assert.deepEqual(result.aciertos, []);
  assert.deepEqual(result.errores, []);
});

test("el mes destino no lee filas posteriores y la entrada permanece intacta", () => {
  const period = [
    row("2025-01", { A1: { aportacion: 1 } }),
    row("2025-02", { A1: { aportacion: 2 } }),
    row("2025-03", { A1: { aportacion: 3 } }, { inflexion: inflexion("pico_bajista") }),
  ];
  const snapshot = structuredClone(period);
  const expected = analizarReaccionPostInflexion(period, "2025-03");
  const future = row(
    "2025-04",
    { A1: { aportacion: -50 } },
    { versionParametros: "future-version", scoreSolo: 0 },
  );

  assert.deepEqual(analizarReaccionPostInflexion([...period, future], "2025-03"), expected);
  assert.deepEqual(analizarReaccionPostInflexion(period, "2025-03"), expected);
  assert.deepEqual(period, snapshot);
});

test("los contratos rechazan deltas con signo incoherente", () => {
  assert.throws(() =>
    decisionPostInflexionSchema.parse({
      variable: "A1",
      tipo: "acierto_mitigante",
      productoSugerido: "ninguno",
      deltaPuntos: -2,
      descripcion: "Cambio observado",
      leccionAprendida: "Lección",
      accionRecomendada: "Acción",
    }),
  );
});

test("el contrato exige un producto sugerido válido", () => {
  const base = {
    variable: "A1",
    canal: "operativo",
    tipo: "acierto_mitigante",
    deltaPuntos: 2,
    descripcion: "Cambio observado",
    leccionAprendida: "Lección",
    accionRecomendada: "Acción",
  };
  assert.throws(() => decisionPostInflexionSchema.parse(base), /productoSugerido/);
  assert.throws(
    () => decisionPostInflexionSchema.parse({ ...base, productoSugerido: "producto_invalido" }),
    /productoSugerido/,
  );
});
