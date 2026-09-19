"use client";

import { Building2, Check, HandCoins, Send, Users } from "lucide-react";
import { useState } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { AlertsTimeline } from "@/components/grifo/company/alerts-timeline";
import { Cascade } from "@/components/grifo/company/cascade";
import { CoveragePanel } from "@/components/grifo/company/coverage-panel";
import { GatesPanel } from "@/components/grifo/company/gates";
import { GroupPanel } from "@/components/grifo/company/group-panel";
import { OfferMenu } from "@/components/grifo/company/offer-menu";
import { OutlookPanel } from "@/components/grifo/company/outlook-panel";
import { ScoreTrend } from "@/components/grifo/company/score-trend";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { Figure, Panel } from "@/components/grifo/panel";
import { PeerSpace } from "@/components/grifo/peers/peer-space";
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
import type {
  BenchmarkResponse,
  BenchmarkRow,
  CompanyFileResponse,
  MonthScore,
} from "@/lib/features/portfolio/types";
import { BANDA, deriveBanda } from "@/lib/features/portfolio/vocabulary";

function ordinal(percentile: number): string {
  return `percentil ${Math.round(percentile * 100)}`;
}

function BenchmarkPanel({ benchmark }: { benchmark: BenchmarkResponse }) {
  const rows = benchmark.rows.filter((row) => row.percentile !== null);
  return (
    <Panel
      title="Frente a empresas parecidas"
      description={`Percentil por indicador entre ${benchmark.cohort} empresas comparables.`}
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
    </Panel>
  );
}

/**
 * El indicador con más recorrido: el que más puntos deja sobre la mesa por
 * debajo del percentil 40 de sus pares. Es la palanca que se le enseña a la
 * empresa, no la variable con peor nota en abstracto.
 */
function biggestLever(month: MonthScore, benchmark: BenchmarkResponse): BenchmarkRow | null {
  let best: { row: BenchmarkRow; gap: number } | null = null;
  for (const row of benchmark.rows) {
    if (row.percentile === null || row.percentile >= 0.4) continue;
    const own = month.contributions.find((entry) => entry.indicator === row.indicator);
    if (!own || own.raw === null) continue;
    const gap = own.weight * (100 - own.subscore);
    if (!best || gap > best.gap) best = { row, gap };
  }
  return best?.row ?? null;
}

function NextBandNote({ month, benchmark }: { month: MonthScore; benchmark: BenchmarkResponse }) {
  const step = nextBand(month.score);
  const lever = biggestLever(month, benchmark);
  const leverMeta = lever ? indicator(lever.indicator) : null;
  const current = BANDA[deriveBanda(month.score)];

  return (
    <div className="flex flex-col gap-1.5 border-t pt-3 text-xs text-pretty">
      {step ? (
        <p>
          <span className="font-medium">
            Te faltan {formatDecimal(step.pointsMissing)} puntos para la banda {step.band}.
          </span>{" "}
          <span className="text-muted-foreground">
            TAE base {formatApr(step.baseApr)} en vez de {formatApr(current.baseApr)}
            {step.maxTenor > current.maxTenor ? ` y plazo hasta ${formatDays(step.maxTenor)}` : ""}.
          </span>
        </p>
      ) : (
        <p>
          <span className="font-medium">Estás en la mejor banda.</span>{" "}
          <span className="text-muted-foreground">
            TAE base {formatApr(current.baseApr)} y plazo hasta {formatDays(current.maxTenor)}{" "}
            mientras el score no baje de 75.
          </span>
        </p>
      )}
      {lever && leverMeta ? (
        <p className="text-muted-foreground">
          Donde más recorrido tienes: {leverMeta.label.toLowerCase()},{" "}
          {formatIndicatorValue(lever.raw, leverMeta.format)} frente a una mediana de{" "}
          {formatIndicatorValue(lever.medianRaw, leverMeta.format)}.
        </p>
      ) : null}
    </div>
  );
}

function ScoreCard({
  file,
  benchmark,
  month,
}: {
  file: CompanyFileResponse;
  benchmark: BenchmarkResponse;
  month: string;
}) {
  const { latest } = file;
  const groupScore = latest.scoreGrupo ?? latest.standaloneScore + (latest.group?.adjustment ?? 0);
  const groupDiffers = latest.group !== null && Math.abs(groupScore - latest.score) >= 0.5;

  return (
    <div className="bg-card flex flex-col gap-4 rounded-xl border p-5">
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
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
          <span className="text-muted-foreground text-xs tabular-nums">
            Confianza {formatPercent(latest.confidence, 0)}
          </span>
          {groupDiffers ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              Con tu grupo {formatScore(groupScore)}
            </span>
          ) : null}
        </div>
      </div>
      <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
        <Users aria-hidden className="mr-1 inline size-3.5 align-[-2px]" />
        {ordinal(benchmark.scorePercentile)}: mejor que el{" "}
        {formatPercent(benchmark.scorePercentile, 0)} de {benchmark.cohort} empresas comparables.
      </p>
      {latest.estado === "sin_datos" ? null : <NextBandNote month={latest} benchmark={benchmark} />}
    </div>
  );
}

/**
 * El opt-in de PRODUCT §3.1: hasta que la empresa pulsa, nadie fuera de Embat
 * ve nada. La solicitud vive en la pestaña del navegador (`useOptIn`): no hay
 * backend de peticiones, y se dice.
 */
function OfferPanel({ file }: { file: CompanyFileResponse }) {
  const { latest, previous } = file;
  const { decision } = latest;
  const { requestedMonth, request, withdraw } = useOptIn(file.company.id);
  const requested = requestedMonth !== null;
  const changed = decision.action !== "mantener";
  const limitChange =
    decision.previousLimit > 0 && decision.limit > 0
      ? Math.round((decision.limit / decision.previousLimit - 1) * 100)
      : null;

  if (!decision.eligible) {
    return (
      <Panel
        title="Tu oferta este mes"
        description="Sin circulante preaprobado este mes. Nadie fuera de Embat lo sabe."
        aside={<ActionBadge action={decision.action} changed={changed} />}
      >
        <p className="max-w-[60ch] text-base leading-relaxed text-pretty">{decision.reason}</p>
        {previous?.decision.eligible ? (
          <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
            El mes pasado tenías hasta {formatEuros(previous.decision.limit)} preaprobados. Cuando
            vuelvas a pasar todas las puertas, la oferta reaparece sola.
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      title="Tu oferta este mes"
      description="Preaprobada y recalculada cada mes; nadie la ve fuera de Embat hasta que la pidas."
      aside={<ActionBadge action={decision.action} changed={changed} />}
    >
      <p className="max-w-[60ch] text-sm leading-relaxed text-pretty">{decision.reason}</p>

      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure
          label="Hasta"
          value={formatEuros(decision.limit)}
          hint={
            limitChange !== null && limitChange !== 0 ? (
              <span
                className={cn(limitChange > 0 ? "text-status-healthy-fg" : "text-status-watch-fg")}
              >
                {limitChange > 0 ? "+" : ""}
                {limitChange} % desde {formatEuros(decision.previousLimit)}
              </span>
            ) : (
              "Igual que el mes pasado"
            )
          }
        />
        <Figure label="Banda" value={decision.band} hint={BANDA[decision.band].description} />
        <Figure
          label="Plazo máximo"
          value={formatDays(decision.maxTenorDays)}
          hint="Según banda y tendencia"
        />
        <Figure
          label="TAE desde"
          value={formatApr(decision.apr)}
          hint={`Base ${formatApr(decision.baseApr)} de banda ${decision.band}`}
        />
      </dl>

      <div className="mt-4 flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        {requested ? (
          <p className="text-status-healthy-fg flex items-start gap-2 text-sm font-medium text-pretty">
            <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
            <span>
              Pedido en {formatMonthLong(requestedMonth)}. El partner ya ve tu score, tu límite y
              las alertas de cambio; sigue sin ver movimientos, facturas ni saldos.
            </span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm text-pretty">
            Al pedir, el partner ve tu score, tu límite y las alertas de cambio. Nada más: ni
            movimientos, ni facturas, ni saldos.
          </p>
        )}
        <div className="flex shrink-0 items-center gap-2">
          {requested ? (
            <Button variant="ghost" size="sm" onClick={withdraw}>
              Retirar
            </Button>
          ) : null}
          <Button size="sm" onClick={() => request(latest.month)} disabled={requested}>
            {requested ? (
              <Check aria-hidden className="size-4" />
            ) : (
              <Send aria-hidden className="size-4" />
            )}
            {requested ? "Pedido" : "Pedir circulante"}
          </Button>
        </div>
      </div>
      {requested ? (
        <p className="text-muted-foreground mt-2 text-xs">
          Demostración: la solicitud se guarda solo en esta pestaña del navegador.
        </p>
      ) : null}
    </Panel>
  );
}

/**
 * Mismo orden editorial que la ficha del partner (DESIGN §jerarquía): primero la
 * decisión (score y oferta), después lo que la mueve (hacia dónde va, pares,
 * histórico), y la cascada al final para quien quiera comprobar la cuenta.
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
  const own = peers.points.find((point) => point.company === companyId);
  const ownCluster =
    own && own.cluster !== null
      ? peers.clusters.find((cluster) => cluster.id === own.cluster)
      : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="lg:col-span-2">
        <ScoreCard file={file} benchmark={benchmark} month={month} />
      </div>
      <div className="lg:col-span-3">
        <OfferPanel file={file} />
      </div>

      <div className="flex flex-col gap-4 lg:col-span-3">
        <BenchmarkPanel benchmark={benchmark} />
        <ScoreTrend history={file.history} />
      </div>
      <div className="flex flex-col gap-4 lg:col-span-2">
        {latest.decision.eligible ? (
          <OfferMenu options={latest.decision.menu} />
        ) : (
          <GatesPanel gates={latest.decision.gates} />
        )}
        <OutlookPanel month={latest} />
        <AlertsTimeline alerts={latest.alerts} />
        {latest.group && file.peers.length > 0 ? (
          <GroupPanel
            group={latest.group}
            peers={file.peers}
            month={month}
            onSelect={onSelectCompany}
          />
        ) : null}
        <CoveragePanel coverage={latest.coverage} confidence={latest.confidence} />
      </div>

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
              Estás en el grupo «{ownCluster.label}» con otras {Math.max(0, ownCluster.size - 1)}{" "}
              empresas
              {ownCluster.medianScore !== null
                ? ` (score mediano ${formatScore(ownCluster.medianScore)})`
                : ""}
              .
            </>
          ) : undefined
        }
      />

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
        description="Score, comparación con empresas parecidas y oferta preaprobada. Privado hasta que la empresa pide."
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
