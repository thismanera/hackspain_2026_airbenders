import { submissionRowSchema } from "@/lib/features/submission/contracts";
import type {
  SubmissionRow,
  SubmissionSlice,
  SubmissionSummary,
} from "@/lib/features/submission/types";
import type { Estado } from "@/lib/features/scoring/types";

export const SUBMISSION_COLUMNS = [
  "company_id",
  "month",
  "group_id",
  "score_solo",
  "score_grupo",
  "ajuste_holding",
  "estado",
  "direccion",
  "patron_trayectoria",
  "alerta_temprana",
  "canario_en_mina",
  "inflexion_detectada",
  "inflexion_mes",
  "inflexion_antelacion_meses",
  "variable_detonante",
  "score_pred_3m",
  "score_pred_grupo_3m",
  "elegible_credito",
  "decision_accion",
  "limite_sugerido_eur",
  "limite_vigente_eur",
  "plazo_max_dias",
  "tae_operacion",
  "gap_ciclo_dias",
  "producto_embat",
  "forecast_metodo_solo",
  "forecast_metodo_grupo",
  "version_scoring",
  "version_forecast",
] as const satisfies readonly (keyof SubmissionRow)[];

type SubmissionCell = SubmissionRow[(typeof SUBMISSION_COLUMNS)[number]];

function value(row: SubmissionRow, column: (typeof SUBMISSION_COLUMNS)[number]): SubmissionCell {
  return row[column];
}

export function csvCell(input: SubmissionCell): string {
  return `"${String(input ?? "").replaceAll('"', '""')}"`;
}

export function submissionCsv(rows: readonly SubmissionRow[]): string {
  const valid = rows.map((row) => submissionRowSchema.parse(row));
  const body = valid.map((row) =>
    SUBMISSION_COLUMNS.map((column) => csvCell(value(row, column))).join(","),
  );
  return `\uFEFF${[SUBMISSION_COLUMNS.join(","), ...body].join("\r\n")}\r\n`;
}

export function submissionJsonl(rows: readonly SubmissionRow[]): string {
  return (
    rows.map((row) => JSON.stringify(submissionRowSchema.parse(row))).join("\n") +
    (rows.length ? "\n" : "")
  );
}

const ESTADOS: readonly Estado[] = ["sana", "vigilar", "riesgo", "sin_datos"];

function slice(rows: readonly SubmissionRow[]): SubmissionSlice {
  const estados = Object.fromEntries(ESTADOS.map((estado) => [estado, 0])) as Record<
    Estado,
    number
  >;
  const companies = new Set<string>();
  const months = new Set<string>();
  let elegibles = 0;
  let limiteVigenteEur = 0;
  for (const row of rows) {
    companies.add(row.company_id);
    months.add(row.month);
    estados[row.estado]++;
    if (row.elegible_credito) elegibles++;
    limiteVigenteEur += row.limite_vigente_eur;
  }
  return {
    rows: rows.length,
    companies: companies.size,
    months: months.size,
    estados,
    tasaElegible: rows.length ? elegibles / rows.length : 0,
    limiteVigenteEur,
  };
}

export function submissionSummary(rows: readonly SubmissionRow[]): SubmissionSummary {
  const valid = rows.map((row) => submissionRowSchema.parse(row));
  const latestByCompany = new Map<string, SubmissionRow>();
  for (const row of valid) {
    const previous = latestByCompany.get(row.company_id);
    if (!previous || row.month > previous.month) latestByCompany.set(row.company_id, row);
  }
  const latest = [...latestByCompany.values()];
  return {
    totalRows: valid.length,
    companies: new Set(valid.map((row) => row.company_id)).size,
    months: new Set(valid.map((row) => row.month)).size,
    ultimaObservacion: slice(latest),
    historico: slice(valid),
    versionScoring: valid[0]?.version_scoring ?? "",
    versionsForecast: [
      ...new Set(valid.map((row) => row.version_forecast).filter((v): v is string => v !== null)),
    ].sort(),
  };
}
