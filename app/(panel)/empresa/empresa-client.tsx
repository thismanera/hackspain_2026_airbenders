"use client";

import { Building2, Check, HandCoins, Lock, Send, Users } from "lucide-react";
import { useState } from "react";

import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { Cascade } from "@/components/grifo/company/cascade";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { Figure, Panel } from "@/components/grifo/panel";
import { PageIntro } from "@/components/grifo/stat-card";
import { StatusBadge } from "@/components/grifo/status-badge";
import { TrendDelta } from "@/components/grifo/trend";
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
  formatApr,
  formatDays,
  formatEuros,
  formatIndicatorValue,
  formatMonthLong,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import { useBenchmark, useCompanyFile, usePymeState } from "@/lib/features/portfolio/hooks";
import { indicator } from "@/lib/features/portfolio/indicators";
import type { BenchmarkResponse, CompanyFileResponse } from "@/lib/features/portfolio/types";

function ordinal(percentile: number): string {
  return `percentil ${Math.round(percentile * 100)}`;
}

function BenchmarkPanel({ benchmark }: { benchmark: BenchmarkResponse }) {
  const rows = benchmark.rows.filter((row) => row.percentile !== null);
  return (
    <Panel
      title="Frente a empresas parecidas"
      description={`${benchmark.cohort} empresas con al menos tres meses de datos. Tu score está en el ${ordinal(benchmark.scorePercentile)}: mejor que el ${formatPercent(benchmark.scorePercentile, 0)} de ellas.`}
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {rows.map((row) => {
          const meta = indicator(row.indicator);
          if (!meta || row.percentile === null) return null;
          const good = row.percentile >= 0.5;
          return (
            <li
              key={row.indicator}
              className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-2.5 sm:grid-cols-[1.4fr_1fr_1fr_6rem]"
            >
              <span className="flex flex-col leading-tight">
                <span className="text-sm">{meta.label}</span>
                <span className="text-muted-foreground text-xs">{meta.question}</span>
              </span>
              <span className="text-right text-sm tabular-nums sm:text-left">
                <span className="text-muted-foreground mr-1 text-xs sm:hidden">Tú</span>
                {formatIndicatorValue(row.raw, meta.format)}
              </span>
              <span className="text-muted-foreground col-span-2 text-xs tabular-nums sm:col-span-1 sm:text-sm">
                Mediana {formatIndicatorValue(row.medianRaw, meta.format)}
              </span>
              <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
                <span
                  aria-hidden
                  className="bg-muted relative h-1.5 flex-1 overflow-hidden rounded-full"
                >
                  <span
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full",
                      good ? "bg-status-healthy" : "bg-status-watch",
                    )}
                    style={{ width: `${Math.max(4, row.percentile * 100)}%` }}
                  />
                </span>
                <span className="w-8 text-right text-xs tabular-nums">
                  p{Math.round(row.percentile * 100)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="text-muted-foreground border-t px-4 py-2 text-xs">
        La barra es tu posición: p80 significa que puntúas mejor que el 80 % de las empresas con ese
        dato.
      </p>
    </Panel>
  );
}

/**
 * El opt-in de PRODUCT §3.1: hasta que la empresa pulsa, nadie fuera de Embat
 * ve nada. Aquí la solicitud vive solo en la sesión del navegador: no hay
 * backend de peticiones, y se dice.
 */
function OfferPanel({ file }: { file: CompanyFileResponse }) {
  const [requested, setRequested] = useState(false);
  const { decision } = file.latest;

  if (!decision.eligible) {
    const failed = decision.gates.filter((gate) => !gate.passed);
    return (
      <Panel
        title="Tu oferta este mes"
        description="Preaprobada por el motor, sin pedirla todavía."
      >
        <p className="text-sm text-pretty">
          Este mes no hay circulante preaprobado. {decision.reason}
        </p>
        {failed.length > 0 ? (
          <ul className="mt-3 flex flex-col gap-1.5">
            {failed.map((gate) => (
              <li key={gate.id} className="flex gap-2 text-sm">
                <Lock aria-hidden className="text-status-risk-fg mt-0.5 size-3.5 shrink-0" />
                <span>
                  <span className="font-medium">{gate.label}.</span>{" "}
                  <span className="text-muted-foreground">{gate.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
        <p className="text-muted-foreground mt-3 text-xs text-pretty">
          El score se recalcula cada mes. Si la puerta se abre, la oferta aparece aquí sin que nadie
          tenga que pedirla.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Tu oferta este mes"
      description="Preaprobada por el motor. Nadie la ve fuera de Embat hasta que la pidas."
      aside={
        <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
          <Lock aria-hidden className="size-3" />
          Privado
        </span>
      }
    >
      <dl className="grid grid-cols-3 gap-4">
        <Figure label="Hasta" value={formatEuros(decision.limit)} hint={`Banda ${decision.band}`} />
        <Figure label="Plazo máximo" value={formatDays(decision.maxTenorDays)} />
        <Figure label="TAE" value={formatApr(decision.apr)} hint="Según plazo, ver menú" />
      </dl>

      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {requested ? (
          <p className="text-status-healthy-fg flex items-center gap-2 text-sm font-medium">
            <Check aria-hidden className="size-4" />
            Solicitud enviada: el partner ya puede ver tu score y tu límite.
          </p>
        ) : (
          <p className="text-muted-foreground text-sm text-pretty">
            Al pedir, Embat comparte con el partner tu score, tu límite y las alertas de cambio.
            Nada más.
          </p>
        )}
        <Button
          size="sm"
          onClick={() => setRequested(true)}
          disabled={requested}
          className="shrink-0"
        >
          {requested ? (
            <Check aria-hidden className="size-4" />
          ) : (
            <Send aria-hidden className="size-4" />
          )}
          {requested ? "Pedido" : "Pedir circulante"}
        </Button>
      </div>
      {requested ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Demostración: la solicitud no se guarda; al recargar vuelve al estado privado.
        </p>
      ) : null}
    </Panel>
  );
}

function CompanyView({ companyId, month }: { companyId: string; month: string }) {
  const { data: file } = useCompanyFile(companyId, month);
  const { data: benchmark } = useBenchmark(companyId, month);
  const { latest } = file;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="bg-card flex flex-col gap-4 rounded-xl border p-5 lg:col-span-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="bg-secondary flex size-9 items-center justify-center rounded-lg"
            >
              <Building2 className="size-4" strokeWidth={2} />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-mono text-sm font-medium">{file.company.id}</span>
              <span className="text-muted-foreground text-xs">
                {file.company.groupId}
                {file.company.groupSize > 1 ? ` · ${file.company.groupSize} empresas` : ""}
              </span>
            </span>
          </div>
          <StatusBadge estado={latest.estado} size="lg" />
        </div>
        <div>
          <p className="text-muted-foreground text-xs">Tu score en {formatMonthLong(month)}</p>
          <p className="mt-1 text-5xl leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {formatScore(latest.score)}
            <span className="text-muted-foreground ml-1 text-lg font-normal">/ 100</span>
          </p>
          <div className="mt-2 flex items-center gap-3 text-sm">
            <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
            <span className="text-muted-foreground text-xs tabular-nums">
              Confianza {formatPercent(latest.confidence, 0)}
            </span>
          </div>
        </div>
        <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
          <Users aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
          Mejor que el {formatPercent(benchmark.scorePercentile, 0)} de las {benchmark.cohort}{" "}
          empresas comparables. Sale de tus cobros, pagos y deuda en Embat: el mismo número que ve
          el analista.
        </p>
      </div>

      <div className="lg:col-span-3">
        <OfferPanel file={file} />
      </div>

      <div className="lg:col-span-3">
        <BenchmarkPanel benchmark={benchmark} />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-2">
        <ScoreTrend history={file.history} />
        <AlertsTimeline alerts={latest.alerts} />
      </div>

      <div className="lg:col-span-5">
        <Cascade month={latest} />
      </div>
      {latest.decision.eligible ? (
        <div className="lg:col-span-5">
          <OfferMenu options={latest.decision.menu} />
        </div>
      ) : null}
    </div>
  );
}

export function EmpresaClient() {
  const [state, setState] = usePymeState();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Mi score"
        title="Lo que ve la empresa antes de pedir nada"
        description="Score completo, cascada, comparación con empresas parecidas y la oferta preaprobada. Todo privado hasta que la empresa pulsa pedir circulante."
        aside={
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Building2 aria-hidden className="size-4" />
            {state.empresa ? "Cambiar de empresa" : "Elegir empresa"}
          </Button>
        }
      />

      {state.empresa ? (
        <CompanyView companyId={state.empresa} month={state.mes} />
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
