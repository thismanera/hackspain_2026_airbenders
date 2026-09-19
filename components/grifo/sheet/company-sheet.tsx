"use client";

import { ArrowUpRight, Building2, Orbit } from "lucide-react";
import Link from "next/link";

import {
  ConditionsTable,
  FeaturedAlert,
  ScoreBlocks,
  TaeSplit,
} from "@/components/grifo/company/sheet-panels";
import { ActionBadge } from "@/components/grifo/action-badge";
import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { DeclaredReading } from "@/components/grifo/declared-reading";
import { DetailRow, DetailStack } from "@/components/grifo/panel";
import { StatusDot, statusTextClass } from "@/components/grifo/status-badge";
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
  holdingNarrative,
  scoreNarrative,
} from "@/lib/features/portfolio/narrative";
import type { SheetTab } from "@/lib/features/portfolio/search-params";
import type { CompanyFileResponse, MonthScore } from "@/lib/features/portfolio/types";
import { ESTADO, isDecisionNews } from "@/lib/features/portfolio/vocabulary";

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
                {/* Seis meses seguidos de pastillas serían ruido, pero
                    ActionBadge apaga los meses en que no pasó nada: la tinta
                    queda justo en el cierre que el analista viene a buscar. */}
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
      </section>
    </>
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
      <header className="flex flex-col gap-2 border-b px-5 pt-4 pb-0">
        <div className="min-w-0 pr-8">
          <div className="flex items-center gap-2">
            <CompanyAvatar companyId={company.id} />
            <SheetTitle className="font-mono text-lg font-semibold tracking-[-0.01em]">
              {company.id}
            </SheetTitle>
            <span
              className={cn(
                "inline-flex items-center gap-1.5 text-xs font-medium",
                statusTextClass(latest.estado),
              )}
            >
              <StatusDot estado={latest.estado} />
              {ESTADO[latest.estado].label}
            </span>
            <Button
              aria-label="Abrir ficha completa"
              variant="ghost"
              size="sm"
              nativeButton={false}
              render={<Link href={`/cartera/${company.id}?mes=${month}`} />}
              className="ml-auto shrink-0 px-2 sm:px-3"
            >
              <span className="hidden sm:inline">Abrir ficha</span>
              <ArrowUpRight aria-hidden />
            </Button>
          </div>
          <SheetDescription className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
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
          <div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/pares?empresas=${company.id}&mes=${month}`} />}
            >
              <Orbit aria-hidden />
              Comparar
            </Button>
            <Button
              variant="outline"
              size="sm"
              nativeButton={false}
              render={<Link href={`/cartera/${company.id}?mes=${month}`} />}
            >
              Ficha completa
              <ArrowUpRight aria-hidden />
            </Button>
          </div>
      </header>

      <TabsList variant="line" className="h-9 gap-4 p-0 px-5">
          <TabsTrigger value="decision" className="px-0 text-sm after:!bottom-[-1px]">
            Decisión
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm after:!bottom-[-1px]">
            Score
          </TabsTrigger>
          {hasGroup ? (
            <TabsTrigger value="grupo" className="px-0 text-sm after:!bottom-[-1px]">
              Grupo
            </TabsTrigger>
          ) : null}
        </TabsList>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <TabsContent value="decision" className="flex flex-col gap-4">
          <DecisionLead file={data} />
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
        </TabsContent>

        <TabsContent value="score" className="flex flex-col gap-4">
          <DeclaredReading
            kind="score"
            companyId={company.id}
            month={data.month}
            fallback={scoreNarrative(data)}
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
            <DetailRow title="Cobertura del dato" aside={formatPercent(latest.confidence, 0)}>
              <CoveragePanel inset coverage={latest.coverage} confidence={latest.confidence} />
            </DetailRow>
          </DetailStack>
        </TabsContent>

        {hasGroup && latest.group ? (
          <TabsContent value="grupo" className="flex flex-col gap-4">
            <DeclaredReading
              kind="grupo"
              companyId={company.id}
              month={data.month}
              fallback={holdingNarrative(data)}
            />
            <GroupPanel
              cards
              group={latest.group}
              peers={peers}
              month={month}
              onSelect={onOpenCompany}
            />
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
