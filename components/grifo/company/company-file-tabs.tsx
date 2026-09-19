"use client";

import { Building2 } from "lucide-react";
import Link from "next/link";

import { ActionBadge } from "@/components/grifo/action-badge";
import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { ForecastImpactLine } from "@/components/grifo/company/forecast-impact";
import { ForecastPanel } from "@/components/grifo/company/forecast-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import {
  ConditionsTable,
  FeaturedAlert,
  ScoreBlocks,
  TaeSplit,
} from "@/components/grifo/company/sheet-panels";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { DeclaredReading } from "@/components/grifo/declared-reading";
import { DetailRow, DetailStack } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatEuros,
  formatMonthShort,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import {
  decisionNarrative,
  holdingNarrative,
  scoreNarrative,
} from "@/lib/features/portfolio/narrative";
import type { CompanyFileResponse, MonthScore } from "@/lib/features/portfolio/types";
import { isDecisionNews } from "@/lib/features/portfolio/vocabulary";

const CONDITION_MONTHS = 6;

/** Las condiciones de los últimos meses, una fila por mes: lo que el analista compara. */
function ConditionsHistory({ history }: { history: MonthScore[] }) {
  const rows = history.slice(-CONDITION_MONTHS).reverse();
  return (
    <div className="-mx-4 -my-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-xs">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Mes
            </th>
            <th scope="col" className="px-2 py-2 text-left font-medium">
              Acción
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              Límite
            </th>
            <th scope="col" className="px-2 py-2 text-right font-medium">
              TAE
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Plazo
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((month, index) => {
            const { decision } = month;
            return (
              <tr key={month.month} className={cn(index === 0 && "font-medium")}>
                <td className="px-4 py-2 tabular-nums">{formatMonthShort(month.month)}</td>
                <td className="px-2 py-2">
                  <ActionBadge
                    action={decision.action}
                    changed={isDecisionNews(decision)}
                    className="-ml-1.5"
                  />
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {decision.eligible ? formatEuros(decision.limit) : "—"}
                </td>
                <td className="px-2 py-2 text-right tabular-nums">
                  {decision.eligible ? formatApr(decision.apr) : "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {decision.eligible ? `${decision.maxTenorDays} d` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * La decisión del mes: primero la frase redactada, en su caja azul, y debajo
 * las tres condiciones que cambian con el aviso que más pesa. Todo lo demás es
 * evidencia y va detrás, plegado.
 */
function DecisionLead({ file }: { file: CompanyFileResponse }) {
  const { alerts } = file.latest;

  return (
    <>
      <DeclaredReading
        kind="decision"
        companyId={file.company.id}
        month={file.month}
        fallback={decisionNarrative(file)}
      />
      <section
        aria-label="Condiciones de este mes"
        className="bg-card overflow-hidden rounded-xl border"
      >
        <ConditionsTable file={file} />
        {alerts.length > 0 ? (
          <div className="border-t px-4 py-2.5">
            <FeaturedAlert alerts={alerts} />
          </div>
        ) : null}
        {/* Anticipación: dónde estará en 3 meses y qué cuesta. En sombra (decisión 38):
            informa y ordena la agenda, pero la decisión de arriba no depende de ella. */}
        {file.latest.forecast ? (
          <div className="border-t px-4 py-2.5">
            <p className="text-muted-foreground text-xs">Anticipación a 3 meses</p>
            <ForecastImpactLine forecast={file.latest.forecast} showAction className="mt-1" />
          </div>
        ) : null}
      </section>
    </>
  );
}

export function CompanyDecisionTab({ file }: { file: CompanyFileResponse }) {
  const { latest, history } = file;

  return (
    <>
      <DecisionLead file={file} />
      {latest.decision.eligible ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <OfferMenu options={latest.decision.menu} />
          <GatesPanel gates={latest.decision.gates} />
        </div>
      ) : (
        <GatesPanel gates={latest.decision.gates} />
      )}
      <DetailStack label="Detalle de la decisión">
        <DetailRow title="Histórico de condiciones" aside={`${CONDITION_MONTHS} cierres`}>
          <ConditionsHistory history={history} />
        </DetailRow>
        {latest.decision.eligible ? (
          <DetailRow title="Desglose de la TAE" aside={formatApr(latest.decision.apr)}>
            <TaeSplit decision={latest.decision} />
          </DetailRow>
        ) : null}
        {latest.alerts.length > 1 ? (
          <DetailRow title="Todas las alertas" aside={`${latest.alerts.length}`}>
            <AlertsTimeline inset alerts={latest.alerts} />
          </DetailRow>
        ) : null}
      </DetailStack>
    </>
  );
}

export function CompanyScoreTab({ file }: { file: CompanyFileResponse }) {
  const { company, latest, history } = file;

  return (
    <>
      <DeclaredReading
        kind="score"
        companyId={company.id}
        month={file.month}
        fallback={scoreNarrative(file)}
      />
      <section
        aria-label="Los cuatro bloques de la nota"
        className="bg-card rounded-xl border px-4 py-3"
      >
        <ScoreBlocks month={latest} />
      </section>
      <Cascade bare month={latest} />
      <DetailStack label="Detalle del score">
        <DetailRow title="Evolución del score">
          <ScoreTrend history={history} inset />
        </DetailRow>
        {latest.forecast ? (
          <DetailRow
            title="Previsión a 3 y 6 meses"
            aside={`${formatScore(latest.forecast.scoreSoloPred3m)} en 3 m · banda ${latest.forecast.bandaSoloPred3m}`}
          >
            <ForecastPanel file={file} inset />
          </DetailRow>
        ) : null}
        <DetailRow title="Cobertura del dato" aside={formatPercent(latest.confidence, 0)}>
          <CoveragePanel inset coverage={latest.coverage} confidence={latest.confidence} />
        </DetailRow>
      </DetailStack>
    </>
  );
}

export function CompanyGroupTab({
  file,
  onOpenCompany,
  onOpenGroup,
}: {
  file: CompanyFileResponse;
  onOpenCompany?: (companyId: string) => void;
  onOpenGroup?: (groupId: string) => void;
}) {
  const { company, latest, peers } = file;
  if (!latest.group) return null;

  return (
    <>
      <DeclaredReading
        kind="grupo"
        companyId={company.id}
        month={file.month}
        fallback={holdingNarrative(file)}
      />
      <GroupPanel
        cards
        group={latest.group}
        peers={peers}
        month={file.month}
        onSelect={onOpenCompany}
      />
      {onOpenGroup ? (
        <Button variant="outline" className="w-fit" onClick={() => onOpenGroup(company.groupId)}>
          <Building2 aria-hidden />
          Ver el grupo
        </Button>
      ) : (
        <Button
          variant="outline"
          className="w-fit"
          nativeButton={false}
          render={<Link href={`/grupos?mes=${file.month}&grupo=${company.groupId}`} />}
        >
          <Building2 aria-hidden />
          Ver el grupo
        </Button>
      )}
    </>
  );
}
