"use client";

import { HandCoins } from "lucide-react";
import dynamic from "next/dynamic";
import { useState, useTransition } from "react";

import { BandLadderCard } from "@/components/grifo/company/band-ladder-card";
import { BenchmarkExplorer } from "@/components/grifo/company/benchmark-explorer";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { LoanSimulator } from "@/components/grifo/company/loan-simulator";
import { OutlookPanel } from "@/components/grifo/company/outlook-panel";
import {
  RcaFindingsCard,
  RcaHoldingNote,
  RcaLead,
  RcaPlaybookList,
  RcaScenarios,
} from "@/components/grifo/company/rca-panel";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { DetailRow, DetailStack, Figure, Panel } from "@/components/grifo/panel";
import { PageIntro } from "@/components/grifo/stat-card";
import { TrendPill } from "@/components/grifo/table-figures";
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
  formatApr,
  formatDecimal,
  formatEuros,
  formatEurosCompact,
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
 * El recálculo del mes en tres cifras, junto al importe: hay sitio de sobra a
 * su lado. Sin la comparativa "antes X, ahora Y" en texto —la píldora ya dice
 * cuánto y hacia dónde, y el mes concreto no cambia la decisión de nadie.
 */
function ConditionsSummary({
  file,
  className,
}: {
  file: Parameters<typeof LoanSimulator>[0]["file"];
  className?: string;
}) {
  const current = file.latest.decision;
  const previous = file.previous?.decision ?? null;
  const limitDelta = previous && previous.limit > 0 ? current.limit - previous.limit : null;

  return (
    <Panel title="Qué ha cambiado este mes" className={className}>
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <Figure
            label="Límite vigente"
            value={current.limit > 0 ? formatEuros(current.limit) : "Sin línea"}
          />
          {limitDelta ? (
            <TrendPill
              value={limitDelta}
              format={(v) => `${v > 0 ? "+" : "−"}${formatEuros(Math.abs(v))}`}
              tone={limitDelta > 0 ? "good" : "bad"}
            />
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* "30 días" en la etiqueta: es la TAE del plazo más corto (la que usa
              el motor como TAE oficial del mes), no la del plazo marcado en la
              oferta de arriba, que puede ser mayor si el plazo es más largo. */}
          <Figure label="TAE 30 días" value={current.eligible ? formatApr(current.apr) : "—"} />
          <Figure
            label="Plazo máximo"
            value={current.eligible ? `${current.maxTenorDays} días` : "—"}
          />
        </div>
      </div>
    </Panel>
  );
}

/**
 * La serie del año largo y los dos puntos previstos, en la primera pantalla.
 * Es el gráfico de la ficha del partner: la empresa merece ver de dónde viene y
 * hacia dónde va sin abrir nada, y es lo único de esta vista que tiene tamaño
 * suficiente para ordenar la mirada.
 */
function TrajectoryPanel({
  file,
  className,
}: {
  file: Parameters<typeof LoanSimulator>[0]["file"];
  className?: string;
}) {
  const forecast = file.latest.forecast;

  return (
    <Panel
      title={forecast ? "De dónde vienes y hacia dónde vas" : "De dónde vienes"}
      description={
        forecast
          ? "Score de los últimos meses y previsión a 3 y 6, con su rango. La oferta de este mes no depende de la previsión."
          : "Score mes a mes desde que hay movimientos."
      }
      className={cn("flex flex-col", className)}
      bodyClassName="flex-1 lg:row-span-2 lg:grid lg:grid-rows-subgrid"
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
  const current = (tab === "grupo" && !hasGroup) || (tab === "revision" && !hasRca) ? "score" : tab;

  return (
    <div className="flex flex-col gap-4">
      {/* La oferta es el titular de la página: lo que la empresa viene a ver y
          lo único sobre lo que puede actuar. El recálculo del mes cabe a su
          lado en vez de debajo: la oferta no llena el ancho y dejarlo en
          blanco no cuenta la misma historia que ponerlo a usarse. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <LoanSimulator file={file} className="lg:col-span-2" />
        <ConditionsSummary file={file} className="h-fit" />
      </div>

      {/* Tres filas explícitas + subgrid (cabecera / contenido / TellMe): la
          caja TellMe de cada tarjeta arranca en el mismo punto aunque el
          contenido de encima tenga alturas distintas (grupo con hermanas vs.
          sin grupo, gráfico vs. bloques de score). */}
      <div className="grid gap-4 lg:grid-cols-3 lg:grid-rows-[auto_auto_1fr]">
        <TrajectoryPanel
          file={file}
          className="lg:col-span-2 lg:row-span-3 lg:grid lg:grid-rows-subgrid"
        />
        <BandLadderCard
          file={file}
          benchmark={benchmark}
          month={month}
          className="lg:row-span-3 lg:grid lg:grid-rows-subgrid"
        />
      </div>

      <Tabs
        value={current}
        onValueChange={(value) => onTabChange(value as PymeTab)}
        className="gap-0"
      >
        <TabsList variant="line" className="h-9 gap-4 border-b p-0">
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

        <TabsContent value="score" className="flex flex-col gap-4 pt-4">
          <Cascade bare month={latest} />
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

      {/* El detalle del score, siempre visible al pie: no depende de qué
          pestaña se mire y no necesita esconderse en un desplegable. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <OutlookPanel month={latest} />
        <CoveragePanel coverage={latest.coverage} confidence={latest.confidence} />
      </div>
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
        title="Tu score y oferta este mes"
        description={
          state.empresa
            ? null
            : "Score, por qué, y cuánto hay disponible. El partner solo lo recibe si pides la línea."
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
