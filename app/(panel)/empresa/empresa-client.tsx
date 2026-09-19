"use client";

import { Building2, HandCoins } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { BandLadderCard } from "@/components/grifo/company/band-ladder-card";
import { BenchmarkExplorer } from "@/components/grifo/company/benchmark-explorer";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { LoanSimulator } from "@/components/grifo/company/loan-simulator";
import { NegotiationReport } from "@/components/grifo/company/negotiation-report";
import { OutlookPanel } from "@/components/grifo/company/outlook-panel";
import {
  RcaFindingsCard,
  RcaHoldingNote,
  RcaLead,
  RcaPlaybookList,
  RcaScenarios,
} from "@/components/grifo/company/rca-panel";
import { ConditionsTable } from "@/components/grifo/company/sheet-panels";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { DetailRow, DetailStack, Panel } from "@/components/grifo/panel";
import { PageIntro } from "@/components/grifo/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import type { PymeTab } from "@/lib/features/portfolio/search-params";
import { DIAGNOSTICO } from "@/lib/features/rca/vocabulary";

/** Recharts fuera del bundle inicial: la oferta y el score no lo necesitan para hidratar. */
const ForecastPanel = dynamic(
  () => import("@/components/grifo/company/forecast-panel").then((m) => m.ForecastPanel),
  { loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);
const ScoreTrend = dynamic(
  () => import("@/components/grifo/company/score-trend").then((m) => m.ScoreTrend),
  { loading: () => <Skeleton className="h-64 w-full rounded-lg" /> },
);

/**
 * La serie del año largo y los dos puntos previstos, en la primera pantalla.
 * Es el gráfico de la ficha del partner: la empresa merece ver de dónde viene y
 * hacia dónde va sin abrir nada, y es lo único de esta vista que tiene tamaño
 * suficiente para ordenar la mirada.
 */
function TrajectoryPanel({ file }: { file: Parameters<typeof LoanSimulator>[0]["file"] }) {
  const forecast = file.latest.forecast;

  return (
    <Panel
      title={forecast ? "De dónde vienes y hacia dónde vas" : "De dónde vienes"}
      description={
        forecast
          ? "Score de los últimos meses y previsión a 3 y 6, con su rango. La oferta de este mes no depende de la previsión."
          : "Score mes a mes desde que hay movimientos."
      }
      className="flex flex-col"
      bodyClassName="flex-1"
    >
      {forecast ? <ForecastPanel file={file} inset /> : <ScoreTrend history={file.history} inset />}
    </Panel>
  );
}

/**
 * Vista de empresa: arriba la trayectoria y la nota —lo que da tamaño y contexto
 * de un vistazo—, y debajo, en pestañas, la oferta y la evidencia. Mismo reparto
 * que la ficha del partner: una cabecera que no cambia y un solo cuerpo que sí.
 */
function CompanyView({
  companyId,
  month,
  tab,
  onTabChange,
  onSelectCompany,
}: {
  companyId: string;
  month: string;
  tab: PymeTab;
  onTabChange: (tab: PymeTab) => void;
  onSelectCompany: (companyId: string) => void;
}) {
  const [{ data: file }, { data: benchmark }] = useCompanyFileWithBenchmark(companyId, month);
  const { latest } = file;
  const hasGroup = latest.group !== null && file.peers.length > 0;
  const hasRca = file.rca !== null && file.rca !== undefined;
  const current =
    (tab === "grupo" && !hasGroup) || (tab === "revision" && !hasRca) ? "oferta" : tab;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <TrajectoryPanel file={file} />
        <BandLadderCard file={file} benchmark={benchmark} month={month} />
      </div>

      <Tabs
        value={current}
        onValueChange={(value) => onTabChange(value as PymeTab)}
        className="gap-0"
      >
        <TabsList variant="line" className="h-9 gap-4 border-b p-0">
          <TabsTrigger value="oferta" className="px-0 text-sm after:!bottom-[-1px]">
            Mi oferta
          </TabsTrigger>
          <TabsTrigger value="score" className="px-0 text-sm after:!bottom-[-1px]">
            Mi score
          </TabsTrigger>
          {hasGroup ? (
            <TabsTrigger value="grupo" className="px-0 text-sm after:!bottom-[-1px]">
              Mi grupo
            </TabsTrigger>
          ) : null}
          <TabsTrigger value="pares" className="px-0 text-sm after:!bottom-[-1px]">
            Frente a pares
          </TabsTrigger>
          {hasRca ? (
            <TabsTrigger value="revision" className="px-0 text-sm after:!bottom-[-1px]">
              Mi revisión
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="oferta" className="flex flex-col gap-4 pt-4">
          <LoanSimulator file={file} />
          <DetailStack label="Detalle de la oferta">
            <DetailRow title="Qué ha cambiado este mes" aside="límite, TAE y plazo">
              <div className="-mx-4 -my-3">
                <ConditionsTable file={file} />
              </div>
            </DetailRow>
            {latest.decision.eligible ? (
              <DetailRow title="Para llevar al banco" aside="condiciones de este mes">
                <NegotiationReport inset file={file} />
              </DetailRow>
            ) : (
              <DetailRow title="Por qué no hay línea" aside={`${latest.decision.gates.length}`}>
                <GatesPanel inset gates={latest.decision.gates} />
              </DetailRow>
            )}
            {latest.alerts.length > 0 ? (
              <DetailRow title="Alertas" aside={`${latest.alerts.length}`}>
                <AlertsTimeline inset alerts={latest.alerts} />
              </DetailRow>
            ) : null}
          </DetailStack>
        </TabsContent>

        <TabsContent value="score" className="flex flex-col gap-4 pt-4">
          <Cascade bare month={latest} />
          <DetailStack label="Detalle del score">
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
          </DetailStack>
        </TabsContent>

        {hasGroup && latest.group ? (
          <TabsContent value="grupo" className="flex flex-col gap-4 pt-4">
            <GroupPanel
              cards
              group={latest.group}
              peers={file.peers}
              month={month}
              onSelect={onSelectCompany}
            />
          </TabsContent>
        ) : null}

        <TabsContent value="pares" className="flex flex-col gap-4 pt-4">
          <BenchmarkExplorer benchmark={benchmark} />
        </TabsContent>

        {hasRca && file.rca ? (
          <TabsContent value="revision" className="flex flex-col gap-4 pt-4">
            <Panel
              title="Cómo reaccionaste al último giro"
              description={DIAGNOSTICO[file.rca.diagnosticoRespuesta].label}
            >
              <RcaLead rca={file.rca} />
            </Panel>
            <div className="grid gap-4 sm:grid-cols-2">
              <RcaFindingsCard
                title="Mejoras observadas"
                items={file.rca.aciertos}
                empty="Sin mejoras seleccionadas en el periodo."
              />
              <RcaFindingsCard
                title="Presiones a revisar"
                items={file.rca.errores}
                empty="Sin presiones seleccionadas en el periodo."
              />
            </div>
            {file.rca.errores.length > 0 ? (
              <Panel title="Si se revierten las presiones seleccionadas">
                <RcaScenarios rca={file.rca} />
              </Panel>
            ) : null}
            <DetailStack label="Playbook">
              {file.rca.playbook.mantener.length > 0 ? (
                <DetailRow title="Qué mantener" aside={`${file.rca.playbook.mantener.length}`}>
                  <RcaPlaybookList items={file.rca.playbook.mantener} />
                </DetailRow>
              ) : null}
              {file.rca.playbook.evitar.length > 0 ? (
                <DetailRow title="Qué evitar" aside={`${file.rca.playbook.evitar.length}`}>
                  <RcaPlaybookList items={file.rca.playbook.evitar} />
                </DetailRow>
              ) : null}
              {file.rca.contextoHolding.observacion ? (
                <DetailRow title="Contexto de holding">
                  <RcaHoldingNote rca={file.rca} />
                </DetailRow>
              ) : null}
            </DetailStack>
          </TabsContent>
        ) : null}
      </Tabs>
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

      {state.empresa ? (
        <CompanyView
          companyId={state.empresa}
          month={state.mes}
          tab={state.pestana}
          onTabChange={(pestana) => void setState({ pestana }, { history: "replace" })}
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

      {/* Cifra de cartera, no de esta empresa: se queda al pie como nota de
          producto, sin tarjeta ni icono que compitan con la oferta. */}
      {engineDecision ? (
        <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
          Sobre toda la cartera, Embat Flow evita{" "}
          <span className="text-foreground font-medium tabular-nums">
            {formatEurosCompact(engineDecision.avoidedExposure)}
          </span>{" "}
          de exposición
          {engineDecision.closeLeadMedian === null
            ? " al anticipar cierres de línea."
            : ` al anticipar cierres de línea con ${formatDecimal(engineDecision.closeLeadMedian)} meses de antelación.`}
        </p>
      ) : null}

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
