"use client";

import { ArrowUpRight, Building2 } from "lucide-react";
import Link from "next/link";

import { ActionBadge } from "@/components/grifo/action-badge";
import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { NarrativeCard } from "@/components/grifo/narrative-card";
import { Figure } from "@/components/grifo/panel";
import { StatusBadge } from "@/components/grifo/status-badge";
import { TrendDelta } from "@/components/grifo/trend";
import { Button } from "@/components/ui/button";
import { SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatEuros,
  formatMonthShort,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import { useCompanyFile } from "@/lib/features/portfolio/hooks";
import {
  decisionNarrative,
  improvementNarrative,
  scoreNarrative,
} from "@/lib/features/portfolio/narrative";
import type { SheetTab } from "@/lib/features/portfolio/search-params";
import type { CompanyFileResponse, MonthScore } from "@/lib/features/portfolio/types";
import { ACCION, BANDA } from "@/lib/features/portfolio/vocabulary";

const CONDITION_MONTHS = 6;

/** Las condiciones de los últimos meses, una fila por mes: lo que el analista compara. */
function ConditionsHistory({ history }: { history: MonthScore[] }) {
  const rows = history.slice(-CONDITION_MONTHS).reverse();
  return (
    <section className="bg-card rounded-xl border">
      <div className="border-b px-4 py-3">
        <h3 className="text-sm font-medium">Condiciones mes a mes</h3>
        <p className="text-muted-foreground mt-0.5 text-xs">
          El límite, el precio y el plazo se recalculan cada cierre. Esto es lo que se ofreció.
        </p>
      </div>
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
                  <span
                    className={cn(
                      decision.action === "cerrar" && "text-status-risk-fg",
                      decision.action === "reducir" && "text-status-watch-fg",
                      (decision.action === "ampliar" || decision.action === "abrir") &&
                        "text-status-healthy-fg",
                    )}
                  >
                    {ACCION[decision.action].label}
                  </span>
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
    </section>
  );
}

function DecisionLead({ file }: { file: CompanyFileResponse }) {
  const { decision } = file.latest;
  const changed = decision.action !== "mantener";
  const limitChange =
    decision.previousLimit > 0 && decision.limit > 0
      ? Math.round((decision.limit / decision.previousLimit - 1) * 100)
      : null;

  return (
    <section aria-label="Decisión de este mes" className="flex flex-col gap-4">
      <ActionBadge action={decision.action} changed={changed} />
      <NarrativeCard
        narrative={decisionNarrative(file)}
        question={{ label: "¿Qué tendría que mejorar?", answer: improvementNarrative(file) }}
      />
      {decision.eligible ? (
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Figure
            label="Límite"
            value={formatEuros(decision.limit)}
            hint={
              limitChange !== null && limitChange !== 0 ? (
                <span
                  className={limitChange > 0 ? "text-status-healthy-fg" : "text-status-watch-fg"}
                >
                  {limitChange > 0 ? "+" : ""}
                  {limitChange} % desde {formatEuros(decision.previousLimit)}
                </span>
              ) : undefined
            }
          />
          <Figure label="Banda" value={decision.band} hint={BANDA[decision.band].description} />
          <Figure
            label="Plazo máximo"
            value={decision.maxTenorDays > 0 ? `${decision.maxTenorDays} d` : "—"}
          />
          <Figure
            label="TAE desde"
            value={formatApr(decision.apr)}
            hint={`Base ${formatApr(decision.baseApr)} de banda`}
          />
        </dl>
      ) : null}
    </section>
  );
}

export function CompanySheet({
  companyId,
  month,
  tab,
  onTabChange,
  onOpenCompany,
  onOpenGroup,
}: {
  companyId: string;
  month: string;
  tab: SheetTab;
  onTabChange: (tab: SheetTab) => void;
  onOpenCompany: (companyId: string) => void;
  onOpenGroup: (groupId: string) => void;
}) {
  const { data } = useCompanyFile(companyId, month);
  const { company, latest, history, peers } = data;
  const hasGroup = latest.group !== null && peers.length > 0;
  const unknown = latest.estado === "sin_datos";

  return (
    <Tabs
      value={hasGroup || tab !== "grupo" ? tab : "decision"}
      onValueChange={(value) => onTabChange(value as SheetTab)}
      className="flex h-full min-h-0 flex-col gap-0"
    >
      <header className="flex flex-col gap-3 border-b px-5 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 pr-8">
          <div className="min-w-0">
            <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
              {company.groupSize > 1 ? (
                <button
                  type="button"
                  onClick={() => onOpenGroup(company.groupId)}
                  className="hover:text-foreground focus-visible:ring-ring inline-flex items-center gap-1 rounded-sm font-mono transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
                >
                  <Building2 aria-hidden className="size-3" />
                  {company.groupId}
                  <span className="font-sans">
                    · {company.groupSize} empresas
                  </span>
                </button>
              ) : (
                <span>
                  <span className="font-mono">{company.groupId}</span>
                  {" · única del grupo"}
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2.5">
              <SheetTitle className="font-mono text-lg font-semibold tracking-[-0.01em]">
                {company.id}
              </SheetTitle>
              <StatusBadge estado={latest.estado} />
            </div>
            <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-2 text-xs">
              <span>
                Score{" "}
                <span
                  className={cn(
                    "text-foreground font-medium tabular-nums",
                    unknown && "text-muted-foreground",
                  )}
                >
                  {formatScore(latest.score)}
                </span>
              </span>
              <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
              <span aria-hidden>·</span>
              <span>
                Confianza{" "}
                <span className="text-foreground font-medium tabular-nums">
                  {formatPercent(latest.confidence, 0)}
                </span>
              </span>
              <span aria-hidden>·</span>
              <span>{formatMonthShort(month)}</span>
            </SheetDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            nativeButton={false}
            render={<Link href={`/cartera/${company.id}?mes=${month}`} />}
            className="shrink-0"
          >
            Ficha completa
            <ArrowUpRight aria-hidden />
          </Button>
        </div>

        <TabsList variant="line" className="-mb-px h-9 gap-4 p-0">
          <TabsTrigger value="decision" className="px-0 text-sm">
            Decisión
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm">
            Score
          </TabsTrigger>
          {hasGroup ? (
            <TabsTrigger value="grupo" className="px-0 text-sm">
              Grupo
            </TabsTrigger>
          ) : null}
        </TabsList>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <TabsContent value="decision" className="flex flex-col gap-4">
          <DecisionLead file={data} />
          <ConditionsHistory history={history} />
          {latest.decision.eligible ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <OfferMenu options={latest.decision.menu} />
              <GatesPanel gates={latest.decision.gates} />
            </div>
          ) : (
            <GatesPanel gates={latest.decision.gates} />
          )}
          {latest.alerts.length > 1 ? <AlertsTimeline alerts={latest.alerts} /> : null}
        </TabsContent>

        <TabsContent value="score" className="flex flex-col gap-4">
          <NarrativeCard narrative={scoreNarrative(data)} />
          <ScoreTrend history={history} />
          <Cascade month={latest} />
          <CoveragePanel coverage={latest.coverage} confidence={latest.confidence} />
        </TabsContent>

        {hasGroup && latest.group ? (
          <TabsContent value="grupo" className="flex flex-col gap-4">
            <GroupPanel group={latest.group} peers={peers} month={month} onSelect={onOpenCompany} />
            <Button
              variant="outline"
              className="w-fit"
              onClick={() => onOpenGroup(company.groupId)}
            >
              <Building2 aria-hidden />
              Ver el grupo entero y su flujo
            </Button>
          </TabsContent>
        ) : null}
      </div>
    </Tabs>
  );
}
