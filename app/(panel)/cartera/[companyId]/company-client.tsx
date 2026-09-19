"use client";

import { Info } from "lucide-react";

import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { DecisionPanel } from "@/components/grifo/company/decision-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { StatusBadge } from "@/components/grifo/status-badge";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { formatMonthLong, formatPercent, formatScore } from "@/lib/features/portfolio/format";
import { useCompanyFile } from "@/lib/features/portfolio/hooks";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

export function CompanyClient({ companyId, month }: { companyId: string; month: string }) {
  const { data } = useCompanyFile(companyId, month);
  const { company, latest, history, peers } = data;

  const unknown = latest.estado === "sin_datos";
  const chips = [company.country, company.currency, company.erp].filter(Boolean);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="font-mono text-2xl font-semibold tracking-tight">{company.id}</h1>
            <StatusBadge estado={latest.estado} size="lg" />
          </div>
          <p className="text-muted-foreground mt-1.5 text-sm">
            <span className="font-mono">{company.groupId}</span>
            {company.groupSize > 1
              ? ` · ${company.groupSize} empresas en el grupo`
              : " · única empresa del grupo"}
            {chips.length > 0 ? ` · ${chips.join(" · ")}` : ""}
          </p>
        </div>

        <dl className="flex shrink-0 gap-6 sm:gap-8">
          <div>
            <dt className="text-muted-foreground text-xs">Score en {formatMonthLong(month)}</dt>
            <dd
              className={cn(
                "mt-0.5 flex items-baseline gap-2 text-3xl font-semibold tabular-nums",
                unknown && "text-muted-foreground",
              )}
            >
              {formatScore(latest.score)}
              <TrendDelta trend3m={latest.trend3m} direction={latest.direction} />
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground text-xs">Confianza</dt>
            <dd className="mt-0.5 text-3xl font-semibold tabular-nums">
              {formatPercent(latest.confidence, 0)}
            </dd>
          </div>
        </dl>
      </header>

      {unknown ? (
        <p className="bg-status-none-surface flex items-start gap-2.5 rounded-lg border p-4 text-sm text-pretty">
          <Info aria-hidden className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <span>
            <span className="font-medium">No opinamos sobre esta empresa todavía.</span>{" "}
            {ESTADO.sin_datos.description} Con {latest.coverage.observedMonths} de 6 meses observados,
            el score de abajo se calcula igual pero no es defendible: trátalo como una estimación
            provisional, no como una recomendación.
          </span>
        </p>
      ) : null}

      <DecisionPanel decision={latest.decision} changed={latest.decision.action !== "mantener"} />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <ScoreTrend history={history} />
          <Cascade month={latest} />
        </div>

        <div className="flex flex-col gap-4">
          <OfferMenu options={latest.decision.menu} />
          <GatesPanel gates={latest.decision.gates} />
          <AlertsTimeline alerts={latest.alerts} />
          {latest.group && peers.length > 0 ? (
            <GroupPanel group={latest.group} peers={peers} month={month} />
          ) : null}
          <CoveragePanel coverage={latest.coverage} confidence={latest.confidence} />
        </div>
      </div>
    </div>
  );
}
