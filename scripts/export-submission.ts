import { existsSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import { decisionRowSchema } from "../lib/features/decision/contracts";
import type { DecisionRow } from "../lib/features/decision/types";
import { analizarReaccionPostInflexion } from "../lib/features/rca/engine";
import type { ProductoSugerido } from "../lib/features/rca/types";
import { scoreRowSchema } from "../lib/features/scoring/contracts";
import { VARIABLES } from "../lib/features/scoring/params";
import type { ScoreRow } from "../lib/features/scoring/types";
import { dataset, lines, meta, readForecasts, root, runDir, scoringParams } from "./scoring-io";
import {
  submissionCsv,
  submissionJsonl,
  submissionSummary,
} from "../lib/features/submission/format";
import { submissionRowSchema } from "../lib/features/submission/contracts";
import type { SubmissionRow } from "../lib/features/submission/types";
import type { ForecastRow } from "../lib/features/forecast/types";

function key(company: string, month: string): string {
  return `${company}|${month}`;
}

function round1(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function suggestedTae(decision: DecisionRow): number | null {
  const option =
    decision.menu.find((item) => item.plazo >= decision.plazoNaturalAnticipo) ??
    decision.menu.at(-1);
  return option?.tae ?? null;
}

function productoRca(rows: ScoreRow[], targetMonth: string): ProductoSugerido | null {
  const analysis = analizarReaccionPostInflexion(rows, targetMonth);
  if (!analysis) return null;
  const order = new Map<string, number>(VARIABLES.map((id, index) => [id, index]));
  const candidates = analysis.errores
    .filter((item) => item.productoSugerido !== "ninguno")
    .map((item) => ({
      producto: item.productoSugerido,
      impacto: Math.abs(item.deltaPuntos),
      orden: order.get(item.variable) ?? VARIABLES.length,
    }));
  const holding = analysis.contextoHolding.observacion;
  if (holding?.tipo === "error_agravante" && holding.productoSugerido !== "ninguno")
    candidates.push({
      producto: holding.productoSugerido,
      impacto: Math.abs(holding.deltaPuntos),
      orden: VARIABLES.length,
    });
  candidates.sort((a, b) => b.impacto - a.impacto || a.orden - b.orden);
  return candidates[0]?.producto ?? null;
}

async function atomicWrite(file: string, contents: string): Promise<void> {
  const temporary = `${file}.tmp-${process.pid}`;
  await writeFile(temporary, contents, "utf8");
  await rename(temporary, file);
}

async function main(): Promise<void> {
  const m = await meta();
  const params = await scoringParams();
  const run = runDir(params, m.fingerprint);
  const scoresFile = path.join(run, "scores.jsonl");
  const decisionsFile = path.join(run, "decisions.jsonl");
  if (!existsSync(scoresFile) || !existsSync(decisionsFile))
    throw new Error("submission requires scoring:score and scoring:decide for the selected run");

  const scores = new Map<string, ScoreRow>();
  const byCompany = new Map<string, ScoreRow[]>();
  for await (const raw of lines<ScoreRow>(scoresFile)) {
    const row = scoreRowSchema.parse(raw);
    const id = key(row.company, row.month);
    if (scores.has(id)) throw new Error(`duplicate score key ${id}`);
    scores.set(id, row);
    const companyRows = byCompany.get(row.company) ?? [];
    companyRows.push(row);
    byCompany.set(row.company, companyRows);
  }

  const decisions = new Map<string, DecisionRow>();
  for await (const raw of lines<DecisionRow>(decisionsFile)) {
    const row = decisionRowSchema.parse(raw);
    const id = key(row.company, row.month);
    if (decisions.has(id)) throw new Error(`duplicate decision key ${id}`);
    decisions.set(id, row);
  }
  for (const id of scores.keys()) if (!decisions.has(id)) throw new Error(`missing decision ${id}`);
  for (const id of decisions.keys()) if (!scores.has(id)) throw new Error(`orphan decision ${id}`);

  let forecasts: ForecastRow[] | undefined;
  const forecastFile = path.join(run, "forecasts.jsonl");
  const forecastParametersFile = path.join(run, "forecast-parameters.json");
  if (existsSync(forecastFile) && existsSync(forecastParametersFile))
    forecasts = await readForecasts(run, params.version);
  else console.warn("[WARN] Submission sin forecast: las columnas de previsión quedarán vacías.");
  const forecastByKey = new Map<string, ForecastRow>();
  for (const row of forecasts ?? []) {
    const id = key(row.company, row.month);
    if (forecastByKey.has(id)) throw new Error(`duplicate forecast key ${id}`);
    forecastByKey.set(id, row);
  }

  const outputRows: SubmissionRow[] = [...scores.values()]
    .sort((a, b) => a.company.localeCompare(b.company) || a.month.localeCompare(b.month))
    .map((score) => {
      const decision = decisions.get(key(score.company, score.month))!;
      const forecast = forecastByKey.get(key(score.company, score.month));
      const forecast3 = forecast?.horizontes[3];
      const companyRows = byCompany.get(score.company)!;
      return submissionRowSchema.parse({
        company_id: score.company,
        month: score.month,
        group_id: score.groupId,
        score_solo: round1(score.scoreSolo),
        score_grupo: round1(score.scoreGrupo),
        ajuste_holding: round1(score.ajusteHolding),
        estado: score.estadoSolo,
        direccion: score.direccion,
        patron_trayectoria: score.patronTrayectoria,
        alerta_temprana: score.alertaTempranaDeterioro,
        canario_en_mina: score.canarioEnMina.detectado,
        inflexion_detectada: score.inflexion.hayInflexion,
        inflexion_mes: score.inflexion.mesInflexion,
        inflexion_antelacion_meses: score.inflexion.antelacionMeses,
        variable_detonante: score.inflexion.variableDetonante,
        score_pred_3m: forecast3?.scoreSoloPred ?? null,
        score_pred_grupo_3m: forecast3?.scoreGrupoPred ?? null,
        elegible_credito: decision.elegible,
        decision_accion: decision.accion,
        limite_sugerido_eur: decision.L,
        limite_vigente_eur: decision.LVigente,
        plazo_max_dias: decision.TMax,
        tae_operacion: suggestedTae(decision),
        gap_ciclo_dias: score.gapCicloDias,
        producto_embat: productoRca(companyRows, score.month),
        forecast_metodo_solo: forecast?.metodoSolo ?? null,
        forecast_metodo_grupo: forecast?.metodoGrupo ?? null,
        version_scoring: score.versionParametros,
        version_forecast: forecast?.versionParametros ?? null,
      });
    });

  const outputDir = path.resolve(process.env.SUBMISSION_OUT ?? path.join(root, "output"));
  await mkdir(outputDir, { recursive: true });
  const csvFile = path.join(outputDir, "submission.csv");
  const jsonlFile = path.join(outputDir, "submission.jsonl");
  await atomicWrite(csvFile, submissionCsv(outputRows));
  await atomicWrite(jsonlFile, submissionJsonl(outputRows));

  const summary = submissionSummary(outputRows);
  console.log(
    JSON.stringify(
      {
        dataset,
        run,
        summary,
        paths: { csv: path.resolve(csvFile), jsonl: path.resolve(jsonlFile) },
        artifacts: { scoringVersion: params.version, scoringParamsHash: params.paramsHash },
      },
      null,
      2,
    ),
  );
}

await main();
