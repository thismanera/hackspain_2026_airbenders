import { prisma } from "@/lib/core/db";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { forecastParametersSchema, forecastRowSchema } from "@/lib/features/forecast/contracts";
import { scoreRowSchema, parametersSchema } from "@/lib/features/scoring/contracts";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { COMPANY_SEED } from "./companies.seed";
import { CALENDAR, LATEST_MONTH } from "./calendar";
import type {
  CompanyFileResponse,
  CompanyMeta,
  Direccion,
  Estado,
  MonthScore,
  PortfolioResponse,
  PortfolioRow,
  PortfolioSummary,
  GroupFileResponse,
  GroupMember,
} from "./types";
import { deriveBanda } from "./vocabulary";

type CompatibleRun = {
  id: string;
  parameterVersion: string;
};

export type LivePortfolioFilters = {
  month?: string;
  q?: string;
  estado?: Estado | "todos";
  accion?: "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar" | "todas";
  direccion?: Direccion | "todas";
  banda?: "A" | "B" | "C" | "D" | "todas";
};

async function compatibleRun(): Promise<CompatibleRun | null> {
  const runs = await prisma.scoreRun.findMany({
    where: { status: "complete" },
    orderBy: { completedAt: "desc" },
    include: {
      parameters: true,
      forecasts: { take: 1, include: { parameters: true } },
    },
  });
  for (const run of runs) {
    const scoring = parametersSchema.safeParse(run.parameters.data);
    const forecast = run.forecasts[0];
    const forecastParams = forecast
      ? forecastParametersSchema.safeParse(forecast.parameters.data)
      : null;
    if (
      scoring.success &&
      scoring.data.version === run.parameterVersion &&
      forecast &&
      forecastParams?.success &&
      forecastParams.data.version === forecast.parameterVersion &&
      forecastParams.data.versionScoring === run.parameterVersion
    )
      return { id: run.id, parameterVersion: run.parameterVersion };
  }
  return null;
}

function companyMeta(
  companyId: string,
  groupId: string,
  currency: string | null,
  groupSize: number,
): CompanyMeta {
  const seed = COMPANY_SEED.find((company) => company.id === companyId);
  return {
    id: companyId,
    groupId,
    country: seed?.country ?? "",
    currency: currency ?? seed?.currency ?? "EUR",
    erp: seed?.erp ?? "",
    groupSize,
  };
}

type GateId = "historia" | "estado" | "fiabilidad" | "caja" | "clientes" | "grupo";
const GATE_LABELS = {
  historia: "Historia suficiente",
  estado: "Estado autónomo",
  fiabilidad: "Obligaciones",
  caja: "Caja",
  clientes: "Morosidad comercial",
  grupo: "Riesgo del grupo",
} satisfies Record<GateId, string>;

export function monthScore(
  row: ScoreRow,
  decision: ReturnType<typeof decisionRowSchema.parse> | null,
  forecast: ReturnType<typeof forecastRowSchema.parse> | null,
): MonthScore {
  const d = decision;
  const gateIds: GateId[] = ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"];
  const gates = gateIds.map((id) => ({
    id,
    label: GATE_LABELS[id],
    passed: d ? !d.puertasFallidas.includes(id as never) : true,
    detail: d?.puertasFallidas.includes(id as never)
      ? (d.motivo ?? "Puerta no superada")
      : "Superada",
  }));
  const menu =
    d?.menu.map((option) => ({
      days: option.plazo,
      maxAmount: option.cantidadMax,
      apr: option.tae,
      cost: option.costeMax,
    })) ?? [];
  return {
    company: row.company,
    month: row.month,
    score: row.scoreSolo,
    standaloneScore: row.scoreSolo,
    confidence: row.confianza,
    estado: row.estadoSolo,
    blocks: row.subscores,
    contributions: row.variables.map((variable) => ({
      indicator: variable.id,
      raw: variable.raw,
      subscore: variable.subnota ?? 50,
      confidence: variable.conf,
      weight: variable.pesoEfectivo,
      contribution: variable.aportacion,
      delta: row.deltaContrib.find((delta) => delta.id === variable.id)?.delta ?? 0,
    })),
    trend3m: row.tendScore3m,
    direction: row.direccion,
    nature: row.naturaleza,
    group:
      row.scoreGrupo === row.scoreSolo && row.ajusteHolding === 0
        ? null
        : {
            groupId: row.groupId,
            siblings: row.cobertura.nHermanasConDatos,
            weight: row.D5,
            peerScore: row.D2 ?? row.scoreSolo,
            support: row.D3 ?? 0,
            share: row.D1,
            interdependence: row.D5,
            adjustment: row.ajusteHolding,
          },
    decision: {
      eligible: d?.elegible ?? false,
      reason: d?.motivo ?? d?.motivoAccion ?? "Sin decisión importada",
      gates,
      band: d?.banda ?? deriveBanda(row.scoreSolo),
      limit: d?.L ?? 0,
      previousLimit: d?.estado.LPrev ?? 0,
      maxTenorDays: d?.TMax ?? 0,
      baseApr: menu[0]?.apr ?? 0,
      apr: menu[0]?.apr ?? 0,
      menu,
      action: d?.accion ?? "mantener",
      adverseCapacity: row.capacidadCuotaAdv,
      capacityLimit: d?.limiteOp ?? 0,
      operatingLimit: d?.L ?? 0,
    },
    alerts: row.alertas.map((alert) => ({
      type: alert.tipo,
      label: alert.tipo.replaceAll("_", " "),
      indicator: alert.tipo,
      onsetMonth: alert.desdeMes,
      confirmedMonth: row.month,
      severity:
        alert.tipo === "impago_obligaciones" || alert.tipo === "vencido_alto" ? "critica" : "aviso",
    })),
    coverage: {
      observedMonths: row.cobertura.mesesObs6m,
      classifiedShare: row.cobertura.pctClasificado6m,
      hasInvoices: row.cobertura.nFacturasCli6m + row.cobertura.nFacturasProv6m > 0,
      hasDebt: row.cobertura.tieneCuotas,
      hasCreditLine: row.cobertura.tieneLineaCredito,
    },
    scoreSolo: row.scoreSolo,
    scoreGrupo: row.scoreGrupo,
    forecast: forecast
      ? {
          scoreSoloPred3m: forecast.horizontes[3].scoreSoloPred,
          scoreGrupoPred3m: forecast.horizontes[3].scoreGrupoPred,
          scoreSoloPred6m: forecast.horizontes[6].scoreSoloPred,
          scoreGrupoPred6m: forecast.horizontes[6].scoreGrupoPred,
          p10Solo3m: forecast.horizontes[3].p10Solo,
          p90Solo3m: forecast.horizontes[3].p90Solo,
          p10Grupo3m: forecast.horizontes[3].p10Grupo,
          p90Grupo3m: forecast.horizontes[3].p90Grupo,
          metodoSolo: forecast.metodoSolo,
          metodoGrupo: forecast.metodoGrupo,
        }
      : null,
  };
}

/** Lee la última ejecución scoring+forecast compatible. Devuelve null si aún no se ha importado. */
export async function getCompanyFileLive(
  companyId: string,
  requestedMonth?: string,
): Promise<CompanyFileResponse | null> {
  try {
    const run = await compatibleRun();
    if (!run) return null;
    const rows = await prisma.companyMonthScore.findMany({
      where: { runId: run.id, companyId },
      include: { decision: true, forecast: true, company: true },
      orderBy: { month: "asc" },
    });
    if (!rows.length) return null;
    const history = rows.map((row) =>
      monthScore(
        scoreRowSchema.parse(row.data),
        row.decision ? decisionRowSchema.parse(row.decision.data) : null,
        row.forecast ? forecastRowSchema.parse(row.forecast.data) : null,
      ),
    );
    const month =
      requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
    const index = history.findIndex((item) => item.month === month);
    if (index < 0) return null;
    const current = history[index];
    const peerCompanies = await prisma.scoreCompany.findMany({
      where: { groupId: rows[0].company.groupId },
      select: { id: true },
    });
    const groupRows = await prisma.companyMonthScore.findMany({
      where: { runId: run.id, month, companyId: { in: peerCompanies.map((peer) => peer.id) } },
    });
    const peers = groupRows
      .filter((peer) => peer.companyId !== companyId)
      .map((peer) => {
        const score = scoreRowSchema.parse(peer.data);
        return {
          id: peer.companyId,
          score: score.scoreSolo,
          estado: score.estadoSolo,
          share: score.D1,
        };
      })
      .sort((a, b) => b.score - a.score);
    return {
      company: companyMeta(
        companyId,
        rows[0].company.groupId,
        rows[0].company.currency,
        groupRows.length || 1,
      ),
      month,
      months: CALENDAR,
      latest: current,
      previous: index > 0 ? history[index - 1] : null,
      history,
      peers,
    };
  } catch {
    return null;
  }
}

/** Grupo real del último run compatible; conserva el formato que consume el panel de grupo. */
export async function getGroupFileLive(
  groupId: string,
  requestedMonth?: string,
): Promise<GroupFileResponse | null> {
  try {
    const run = await compatibleRun();
    if (!run) return null;
    const records = await prisma.companyMonthScore.findMany({
      where: { runId: run.id, company: { groupId } },
      include: { decision: true, forecast: true, company: true },
      orderBy: [{ month: "asc" }, { companyId: "asc" }],
    });
    if (!records.length) return null;
    const byCompany = new Map<string, Map<string, MonthScore>>();
    for (const record of records) {
      const score = scoreRowSchema.parse(record.data);
      const point = monthScore(
        score,
        record.decision ? decisionRowSchema.parse(record.decision.data) : null,
        record.forecast ? forecastRowSchema.parse(record.forecast.data) : null,
      );
      const history = byCompany.get(record.companyId) ?? new Map<string, MonthScore>();
      history.set(record.month, point);
      byCompany.set(record.companyId, history);
    }
    const month =
      requestedMonth && CALENDAR.includes(requestedMonth) ? requestedMonth : LATEST_MONTH;
    if (![...byCompany.values()].some((history) => history.has(month))) return null;
    const memberAt = (company: string): GroupMember | null => {
      const history = byCompany.get(company);
      const current = history?.get(month);
      if (!history || !current) return null;
      const index = CALENDAR.indexOf(month);
      const previous = index > 0 ? history.get(CALENDAR[index - 1]) : null;
      return {
        id: company,
        score: current.score,
        previousScore: previous?.score ?? null,
        estado: current.estado,
        direction: current.direction,
        share: current.group?.share ?? 1,
        interdependence: current.group?.interdependence ?? 0,
        support: current.group?.support ?? 0,
        adjustment: current.group?.adjustment ?? 0,
        limit: current.decision.limit,
        previousLimit: current.decision.previousLimit,
        eligible: current.decision.eligible,
        action: current.decision.action,
        changed:
          current.decision.action !== "mantener" &&
          !(current.decision.action === "cerrar" && current.decision.previousLimit === 0),
        alertCount: current.alerts.length,
        blockedBy: current.decision.gates.find((gate) => !gate.passed)?.label ?? null,
      };
    };
    const companies = [...byCompany.keys()].sort();
    const members = companies
      .map(memberAt)
      .filter((member): member is GroupMember => member !== null)
      .sort((a, b) => b.share - a.share || a.id.localeCompare(b.id));
    const weightedScore = (items: { score: number; share: number }[]) => {
      const total = items.reduce((sum, member) => sum + member.share, 0);
      return total
        ? Math.round(
            (items.reduce((sum, member) => sum + member.score * member.share, 0) / total) * 100,
          ) / 100
        : 0;
    };
    const byEstado: GroupFileResponse["byEstado"] = {
      sana: 0,
      vigilar: 0,
      riesgo: 0,
      sin_datos: 0,
    };
    for (const member of members) byEstado[member.estado]++;
    const history = CALENDAR.filter(
      (candidate) =>
        candidate <= month && companies.some((company) => byCompany.get(company)?.has(candidate)),
    ).map((candidate) => {
      const snapshot = companies
        .map((company) => {
          const historyForCompany = byCompany.get(company);
          const current = historyForCompany?.get(candidate);
          if (!current) return null;
          const previousIndex = CALENDAR.indexOf(candidate) - 1;
          const previous =
            previousIndex >= 0 ? historyForCompany?.get(CALENDAR[previousIndex]) : null;
          return {
            score: current.score,
            share: current.group?.share ?? 1,
            limit: current.decision.limit,
            previousLimit: previous?.decision.limit ?? 0,
          };
        })
        .filter(
          (item): item is { score: number; share: number; limit: number; previousLimit: number } =>
            item !== null,
        );
      return {
        month: candidate,
        score: weightedScore(snapshot),
        exposure: snapshot.reduce((sum, item) => sum + item.limit, 0),
      };
    });
    const current = history.at(-1);
    const previous = history.at(-2);
    const totalShare = members.reduce((sum, member) => sum + member.share, 0) || 1;
    return {
      groupId,
      month,
      months: CALENDAR,
      members,
      score: current?.score ?? weightedScore(members),
      previousScore: previous?.score ?? null,
      byEstado,
      exposure: current?.exposure ?? members.reduce((sum, member) => sum + member.limit, 0),
      previousExposure: members.reduce((sum, member) => sum + member.previousLimit, 0),
      eligible: members.filter((member) => member.eligible).length,
      interdependence:
        Math.round(
          (members.reduce((sum, member) => sum + member.interdependence * member.share, 0) /
            totalShare) *
            10000,
        ) / 10000,
      crossDefault: members
        .filter((member) => member.action === "cerrar" && member.changed && member.share >= 0.3)
        .map((member) => member.id),
      history,
    };
  } catch {
    return null;
  }
}

function portfolioRow(
  meta: CompanyMeta,
  current: MonthScore,
  previous: MonthScore | null,
): PortfolioRow {
  const changed =
    current.decision.action !== "mantener" &&
    !(current.decision.action === "cerrar" && current.decision.previousLimit === 0);
  const failed = current.decision.gates.find((gate) => !gate.passed);
  return {
    company: meta,
    month: current.month,
    score: current.score,
    confidence: current.confidence,
    estado: current.estado,
    trend3m: current.trend3m,
    direction: current.direction,
    nature: current.nature,
    band: current.decision.band,
    limit: current.decision.limit,
    previousLimit: current.decision.previousLimit,
    apr: current.decision.eligible ? current.decision.apr : null,
    action: current.decision.action,
    changed,
    eligible: current.decision.eligible,
    blockedBy: failed?.label ?? null,
    reason: current.decision.reason,
    alertCount: current.alerts.length,
    spark: previous ? [previous.score, current.score] : [current.score],
    share: current.group?.share ?? 1,
  };
}

function summary(month: string, rows: PortfolioRow[]): PortfolioSummary {
  const byEstado = { sana: 0, vigilar: 0, riesgo: 0, sin_datos: 0 } satisfies Record<
    Estado,
    number
  >;
  const byDireccion = { mejora: 0, estable: 0, deterioro: 0 } satisfies Record<Direccion, number>;
  const byAccion = { abrir: 0, ampliar: 0, mantener: 0, reducir: 0, cerrar: 0 };
  let eligible = 0;
  let exposure = 0;
  let moved = 0;
  for (const row of rows) {
    byEstado[row.estado]++;
    byDireccion[row.direction]++;
    if (row.eligible) {
      eligible++;
      exposure += row.limit;
    }
    if (row.changed) {
      moved++;
      byAccion[row.action]++;
    }
  }
  return { month, total: rows.length, byEstado, byDireccion, byAccion, eligible, exposure, moved };
}

/** Cartera real del último run compatible; los fixtures siguen siendo el fallback local. */
export async function getPortfolioLive(
  filters: LivePortfolioFilters = {},
): Promise<PortfolioResponse | null> {
  try {
    const run = await compatibleRun();
    if (!run) return null;
    const records = await prisma.companyMonthScore.findMany({
      where: { runId: run.id },
      include: { decision: true, forecast: true, company: true },
      orderBy: [{ month: "asc" }, { companyId: "asc" }],
    });
    if (!records.length) return null;
    const companiesByGroup = new Map<string, Set<string>>();
    for (const record of records) {
      const companies = companiesByGroup.get(record.company.groupId) ?? new Set<string>();
      companies.add(record.companyId);
      companiesByGroup.set(record.company.groupId, companies);
    }
    const monthRows = new Map<string, MonthScore[]>();
    const metadata = new Map<string, CompanyMeta>();
    for (const record of records) {
      const score = scoreRowSchema.parse(record.data);
      const current = monthScore(
        score,
        record.decision ? decisionRowSchema.parse(record.decision.data) : null,
        record.forecast ? forecastRowSchema.parse(record.forecast.data) : null,
      );
      const list = monthRows.get(current.month) ?? [];
      list.push(current);
      monthRows.set(current.month, list);
      metadata.set(
        record.companyId,
        companyMeta(
          record.companyId,
          record.company.groupId,
          record.company.currency,
          companiesByGroup.get(record.company.groupId)?.size ?? 1,
        ),
      );
    }
    const month = filters.month && CALENDAR.includes(filters.month) ? filters.month : LATEST_MONTH;
    const byCompany = new Map<string, MonthScore[]>();
    for (const values of monthRows.values())
      for (const value of values)
        (
          byCompany.get(value.company) ??
          (byCompany.set(value.company, []), byCompany.get(value.company)!)
        ).push(value);
    const matches = (row: PortfolioRow) => {
      const q = filters.q?.trim().toLowerCase() ?? "";
      if (q && !`${row.company.id} ${row.company.groupId}`.toLowerCase().includes(q)) return false;
      if (filters.estado && filters.estado !== "todos" && row.estado !== filters.estado)
        return false;
      if (filters.accion && filters.accion !== "todas" && row.action !== filters.accion)
        return false;
      if (filters.direccion && filters.direccion !== "todas" && row.direction !== filters.direccion)
        return false;
      if (filters.banda && filters.banda !== "todas" && row.band !== filters.banda) return false;
      return true;
    };
    const allAt = (target: string) =>
      (monthRows.get(target) ?? []).map((current) => {
        const history = byCompany.get(current.company) ?? [];
        const index = history.findIndex((item) => item.month === target);
        return portfolioRow(
          metadata.get(current.company)!,
          current,
          index > 0 ? history[index - 1] : null,
        );
      });
    const all = allAt(month);
    const rows = all.filter(matches);
    rows.sort((a, b) => a.score - b.score || a.company.id.localeCompare(b.company.id));
    const months = CALENDAR.filter((candidate) => monthRows.has(candidate) && candidate <= month);
    const history = months.map((candidate) => summary(candidate, allAt(candidate).filter(matches)));
    return {
      month,
      months: CALENDAR,
      summary: history.at(-1) ?? summary(month, rows),
      previous: history.length > 1 ? history.at(-2)! : null,
      history,
      rows,
      totalUnfiltered: all.length,
    };
  } catch {
    return null;
  }
}
