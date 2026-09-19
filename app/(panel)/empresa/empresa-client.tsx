"use client";

import { Building2, HandCoins, PiggyBank } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { BandLadderCard } from "@/components/grifo/company/band-ladder-card";
import { BenchmarkExplorer, PeerLevers } from "@/components/grifo/company/benchmark-explorer";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { LoanSimulator } from "@/components/grifo/company/loan-simulator";
import { NegotiationReport } from "@/components/grifo/company/negotiation-report";
import { OutlookPanel } from "@/components/grifo/company/outlook-panel";
import {
  RcaFindingsList,
  RcaHoldingNote,
  RcaLead,
  RcaPlaybookList,
  RcaScenarios,
} from "@/components/grifo/company/rca-panel";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { DetailRow, DetailStack } from "@/components/grifo/panel";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/core/utils";
import {
  formatDecimal,
  formatEurosCompact,
  formatMonthLong,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import {
  useBacktest,
  useCompanyFileWithBenchmark,
  usePymeState,
} from "@/lib/features/portfolio/hooks";
import { DIAGNOSTICO } from "@/lib/features/rca/vocabulary";

/** Recharts fuera del bundle inicial: la oferta y el score no lo necesitan para hidratar. */
const ScoreTrend = dynamic(() =>
  import("@/components/grifo/company/score-trend").then((m) => m.ScoreTrend),
);

/**
 * Vista de empresa: la oferta primero, el score al lado, la evidencia plegada.
 * Misma jerarquía que la cartera del partner — un lead, un acto, un stack.
 */
function CompanyView({
  companyId,
  month,
  onSelectCompany,
}: {
  companyId: string;
  month: string;
  onSelectCompany: (companyId: string) => void;
}) {
  const [{ data: file }, { data: benchmark }] = useCompanyFileWithBenchmark(companyId, month);
  const { latest } = file;
  const hasGroup = latest.group !== null && file.peers.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <LoanSimulator file={file} className="lg:col-span-2" />
        <BandLadderCard file={file} benchmark={benchmark} month={month} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <ScoreTrend history={file.history} className="lg:col-span-2" />
        <PeerLevers benchmark={benchmark} />
      </div>

      <DetailStack label="Evidencia">
        <DetailRow title="Frente a empresas parecidas" aside={`${benchmark.cohort} de cohorte`}>
          <BenchmarkExplorer inset benchmark={benchmark} />
        </DetailRow>
        <DetailRow title="De dónde sale el score" aside={formatScore(latest.score)}>
          <Cascade inset month={latest} />
        </DetailRow>
        {file.rca ? (
          <DetailRow
            title="Cómo reaccionaste al último giro"
            aside={DIAGNOSTICO[file.rca.diagnosticoRespuesta].label}
          >
            <div className="flex flex-col gap-4">
              <RcaLead rca={file.rca} />
              <div className="grid gap-4 sm:grid-cols-2">
                <RcaFindingsList title="Mejoras observadas" items={file.rca.aciertos} />
                <RcaFindingsList title="Presiones a revisar" items={file.rca.errores} />
              </div>
              <RcaScenarios rca={file.rca} />
              {file.rca.playbook.mantener.length > 0 || file.rca.playbook.evitar.length > 0 ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  {file.rca.playbook.mantener.length > 0 ? (
                    <div>
                      <h4 className="text-muted-foreground text-xs font-medium">Mantener</h4>
                      <div className="mt-2">
                        <RcaPlaybookList items={file.rca.playbook.mantener} />
                      </div>
                    </div>
                  ) : null}
                  {file.rca.playbook.evitar.length > 0 ? (
                    <div>
                      <h4 className="text-muted-foreground text-xs font-medium">Evitar</h4>
                      <div className="mt-2">
                        <RcaPlaybookList items={file.rca.playbook.evitar} />
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
              <RcaHoldingNote rca={file.rca} />
            </div>
          </DetailRow>
        ) : null}
        {latest.forecast ? (
          <DetailRow
            title="Si nada cambia"
            aside={`${formatScore(latest.forecast.scoreSoloPred3m)} en 3 m`}
          >
            <OutlookPanel inset month={latest} />
          </DetailRow>
        ) : null}
        <DetailRow title="Cobertura del dato" aside={formatPercent(latest.confidence, 0)}>
          <CoveragePanel inset coverage={latest.coverage} confidence={latest.confidence} />
        </DetailRow>
        {latest.decision.eligible ? (
          <DetailRow
            title="Para llevar al banco"
            aside={latest.decision.eligible ? "condiciones de este mes" : undefined}
          >
            <NegotiationReport inset file={file} />
          </DetailRow>
        ) : null}
        {latest.alerts.length > 0 ? (
          <DetailRow title="Alertas" aside={`${latest.alerts.length}`}>
            <AlertsTimeline inset alerts={latest.alerts} />
          </DetailRow>
        ) : null}
        {!latest.decision.eligible ? (
          <DetailRow title="Por qué no hay línea">
            <GatesPanel inset gates={latest.decision.gates} />
          </DetailRow>
        ) : null}
        {hasGroup && latest.group ? (
          <DetailRow title="Tu grupo" aside={latest.group.groupId}>
            <GroupPanel
              inset
              group={latest.group}
              peers={file.peers}
              month={month}
              onSelect={onSelectCompany}
            />
          </DetailRow>
        ) : null}
      </DetailStack>
    </div>
  );
}

export function EmpresaClient() {
  const [isPending, startTransition] = useTransition();
  const [state, setState] = usePymeState(startTransition);
  const [pickerOpen, setPickerOpen] = useState(false);
  const { data: backtest } = useBacktest(state.mes);
  const engineDecision = backtest.engine?.decision ?? null;

  return (
    <div
      className={cn("flex flex-col gap-4 transition-opacity", isPending && "opacity-70")}
      aria-busy={isPending}
    >
      <PageIntro
        title="Mi score"
        description={
          state.empresa
            ? `Oferta preaprobada a cierre de ${formatMonthLong(state.mes)}. Nadie fuera de Embat la ve hasta que pidas la línea.`
            : "Tu score, por qué, y cuánto tienes preaprobado. Privado hasta que pidas la línea."
        }
        aside={
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Building2 aria-hidden className="size-4" />
            {state.empresa ? "Cambiar de empresa" : "Elegir empresa"}
          </Button>
        }
      />

      {engineDecision ? (
        <StatCard
          icon={PiggyBank}
          label="Lo que ahorra Embat Flow"
          value={formatEurosCompact(engineDecision.avoidedExposure)}
          tone="healthy"
          hint={
            engineDecision.closeLeadMedian === null
              ? "Exposición evitada al anticipar cierres de línea, medido sobre la cartera."
              : `Exposición evitada al anticipar cierres de línea con ${formatDecimal(engineDecision.closeLeadMedian)} meses de antelación, medido sobre la cartera.`
          }
        />
      ) : null}

      {state.empresa ? (
        <CompanyView
          companyId={state.empresa}
          month={state.mes}
          onSelectCompany={(companyId) => void setState({ empresa: companyId })}
        />
      ) : (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoins aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Elige la empresa</EmptyTitle>
            <EmptyDescription>
              En producción esta vista abre con la sesión. Aquí puedes mirar cualquiera de la
              cartera.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            Elegir empresa
          </Button>
        </Empty>
      )}

      <CompanyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        month={state.mes}
        title="Ver como esta empresa"
        chosen={state.empresa ? [state.empresa] : []}
        onPick={(companyId) => void setState({ empresa: companyId })}
      />
    </div>
  );
}
