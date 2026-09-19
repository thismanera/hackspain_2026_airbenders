"use client";

import { Building2, HandCoins } from "lucide-react";
import { useState } from "react";

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
import { PymeKpis } from "@/components/grifo/company/pyme-kpis";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { Figure, Panel } from "@/components/grifo/panel";
import { PeerSpace } from "@/components/grifo/peers/peer-space";
import { PageIntro } from "@/components/grifo/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/core/utils";
import { nextBand } from "@/lib/features/portfolio/band-ladder";
import {
  formatApr,
  formatDays,
  formatEuros,
  formatIndicatorValue,
  formatMonthLong,
  formatPercent,
  formatDecimal,
  formatScore,
} from "@/lib/features/portfolio/format";
import {
  useBenchmark,
  useCompanyFile,
  usePeers,
  usePymeState,
} from "@/lib/features/portfolio/hooks";
import { indicator } from "@/lib/features/portfolio/indicators";
import { useOptIn } from "@/lib/features/portfolio/opt-in";

/**
 * Vista de Empresa (Pyme / Mid-Market): Cuadro de mando ejecutivo donde el CFO
 * o tesorero monitoriza su score, explora su oferta preaprobada, analiza su
 * posición frente a la cohorte y cuantifica su ahorro bancario.
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
  const { data: file } = useCompanyFile(companyId, month);
  const { data: benchmark } = useBenchmark(companyId, month);
  const { data: peers } = usePeers(month, "embat", companyId);
  const { latest } = file;
  const own = peers?.points.find((point) => point.company === companyId);
  const ownCluster =
    peers && own && own.cluster !== null
      ? peers.clusters.find((cluster) => cluster.id === own.cluster)
      : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* 1. Strip Superior de 4 KPIs Ejecutivos con Mini Sparklines */}
      <PymeKpis file={file} benchmark={benchmark} requested={requestedMonth !== null} />

      {/* 2. Hero de Decisión: Score con Escalera de Bandas y Simulador de Circulante */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <BandLadderCard file={file} benchmark={benchmark} month={month} />
        </div>
        <div className="lg:col-span-3">
          <LoanSimulator file={file} />
        </div>
      </div>

      {/* 3. Inteligencia Comparativa & Financiera */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <BenchmarkExplorer benchmark={benchmark} />
        </div>
        <div className="lg:col-span-2">
          <NegotiationReport file={file} />
        </div>
      </div>

      {/* 4. Trayectoria Temporal & Alertas */}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <ScoreTrend history={file.history} />
        </div>
        <div className="flex flex-col gap-4 lg:col-span-2">
          <OutlookPanel month={latest} />
          <AlertsTimeline alerts={latest.alerts} />
          {!latest.decision.eligible ? (
            <GatesPanel gates={latest.decision.gates} />
          ) : null}
        </div>
      </div>

      {/* 5. Contexto de Grupo y Calidad del Dato */}
      <div className="grid gap-4 lg:grid-cols-2">
        {latest.group && file.peers.length > 0 ? (
          <GroupPanel
            group={latest.group}
            peers={file.peers}
            month={month}
            onSelect={onSelectCompany}
          />
        ) : null}
        <div className={latest.group && file.peers.length > 0 ? "" : "lg:col-span-2"}>
          <CoveragePanel coverage={latest.coverage} confidence={latest.confidence} />
        </div>
      </div>

      {peers ? (
        <PeerSpace
          data={peers}
          scope="embat"
          focus={companyId}
          title="Empresas como la tuya"
          description="Tu punto lleva nombre; el resto son siluetas. La estela es tu último año."
          className="lg:col-span-5"
          caption={
            ownCluster ? (
              <>
                Estás en el grupo «{ownCluster.label}» con otras{" "}
                {Math.max(0, ownCluster.size - 1)} empresas
                {ownCluster.medianScore !== null
                  ? ` (score mediano ${formatScore(ownCluster.medianScore)})`
                  : ""}
                .
              </>
            ) : undefined
          }
        />
      ) : null}

      <div className="lg:col-span-5">
        <Cascade month={latest} />
      </div>
    </div>
  );
}

export function EmpresaClient() {
  const [state, setState] = usePymeState();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Lo que ve la empresa antes de pedir nada"
        description="Score financiero, comparación con empresas parecidas y oferta preaprobada. Privado hasta que decidas solicitarlo."
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
          onSelectCompany={(companyId) => void setState({ empresa: companyId })}
        />
      ) : (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HandCoins aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Elige qué empresa eres</EmptyTitle>
            <EmptyDescription>
              En producción esta vista se abre ya con la empresa que ha iniciado sesión. Aquí puedes
              ponerte en la piel de cualquiera de la cartera.
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
