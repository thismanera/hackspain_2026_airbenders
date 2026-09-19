"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  Check,
  Lock,
  PiggyBank,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatEuros,
  formatMonthShort,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import type { BenchmarkResponse, CompanyFileResponse } from "@/lib/features/portfolio/types";

/**
 * Doce barras, una por mes, con la última resaltada.
 * Ayuda visual de lectura del número grande, consistente con PortfolioKpis en Cartera.
 */
function MiniBars({ values, className }: { values: number[]; className?: string }) {
  const max = Math.max(...values, 1);
  return (
    <span aria-hidden className={cn("flex h-9 items-end gap-[3px]", className)}>
      {values.map((value, index) => {
        const last = index === values.length - 1;
        const height = Math.max(8, Math.round((value / max) * 100));
        return (
          <span
            key={index}
            className={cn("w-1.5 rounded-sm", last ? "bg-current" : "bg-current/25")}
            style={{ height: `${height}%` }}
          />
        );
      })}
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  series,
  footer,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta: ReactNode;
  series: number[];
  footer?: ReactNode;
  accent: { tile: string; bars: string };
}) {
  return (
    <div className="bg-card flex flex-col gap-3 rounded-xl border p-4 text-left">
      <div className="flex items-center gap-2.5">
        <span
          aria-hidden
          className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", accent.tile)}
        >
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <span className="text-muted-foreground text-sm font-medium">{label}</span>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-end justify-between gap-3">
          <p className="min-w-0 text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
            {value}
            {unit ? (
              <span className="text-muted-foreground ml-1 text-base font-normal">{unit}</span>
            ) : null}
          </p>
          <MiniBars values={series} className={cn("shrink-0", accent.bars)} />
        </div>
        {delta}
      </div>

      {footer ? (
        <div className="text-muted-foreground border-t pt-2.5 text-xs">{footer}</div>
      ) : null}
    </div>
  );
}

export function PymeKpis({
  file,
  benchmark,
  requested,
}: {
  file: CompanyFileResponse;
  benchmark: BenchmarkResponse;
  requested: boolean;
}) {
  const { latest, previous, history } = file;
  const { decision } = latest;
  const window12 = history.slice(-12);
  const previousMonth = previous?.month ?? latest.month;

  // Serie de scores de los últimos 12 meses
  const scoreSeries = window12.map((m) => Math.round(m.score));
  // Serie de límites de los últimos 12 meses
  const limitSeries = window12.map((m) => (m.decision.eligible ? m.decision.limit : 0));

  // Cálculo de ahorro estimado vs póliza bancaria tradicional estándar (8.2% TAE + apertura)
  const traditionalApr = 0.082;
  const activeApr = decision.eligible ? decision.apr : 0.07;
  const aprDifferential = Math.max(0, traditionalApr - activeApr);
  const baseAmount = decision.eligible && decision.limit > 0 ? decision.limit : 20000;
  const estimatedSavingsAnnual = Math.round(baseAmount * (aprDifferential + 0.005));
  const savingsSeries = window12.map((m) =>
    m.decision.eligible ? Math.round(m.decision.limit * (aprDifferential + 0.005)) : 300,
  );

  const scoreDiff = previous ? Math.round((latest.score - previous.score) * 10) / 10 : 0;
  const limitDiff =
    previous && decision.eligible && previous.decision.eligible
      ? decision.limit - previous.decision.limit
      : 0;

  return (
    <section aria-label="Indicadores ejecutivos" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {/* KPI 1: Score Financiero */}
      <KpiCard
        icon={ShieldCheck}
        label="Score de salud"
        value={formatScore(latest.score)}
        unit="/ 100"
        accent={{
          tile: "bg-status-healthy-surface text-status-healthy-fg",
          bars: "text-status-healthy",
        }}
        series={scoreSeries.length > 0 ? scoreSeries : [latest.score]}
        delta={
          scoreDiff !== 0 ? (
            <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 rounded-full py-px pr-1.5 pl-1 font-medium tabular-nums",
                  scoreDiff > 0
                    ? "bg-status-healthy-surface text-status-healthy-fg"
                    : "bg-status-risk-surface text-status-risk-fg",
                )}
              >
                {scoreDiff > 0 ? (
                  <ArrowUpRight aria-hidden className="size-3" strokeWidth={2.25} />
                ) : (
                  <ArrowDownRight aria-hidden className="size-3" strokeWidth={2.25} />
                )}
                {scoreDiff > 0 ? `+${scoreDiff}` : scoreDiff} pts
              </span>
              <span className="text-muted-foreground">vs. {formatMonthShort(previousMonth)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground text-xs whitespace-nowrap">
              Estable vs. {formatMonthShort(previousMonth)}
            </span>
          )
        }
        footer={
          <span>
            Banda <span className="font-semibold text-foreground">{decision.band}</span> · Mejor que el{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatPercent(benchmark.scorePercentile, 0)}
            </span>{" "}
            de {benchmark.cohort} comparables
          </span>
        }
      />

      {/* KPI 2: Límite Preaprobado */}
      <KpiCard
        icon={Wallet}
        label="Límite preaprobado"
        value={decision.eligible ? formatEuros(decision.limit) : "0 €"}
        accent={{
          tile: "bg-status-healthy-surface text-status-healthy-fg",
          bars: "text-status-healthy",
        }}
        series={limitSeries.length > 0 ? limitSeries : [decision.limit]}
        delta={
          decision.eligible ? (
            limitDiff !== 0 ? (
              <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-full py-px pr-1.5 pl-1 font-medium tabular-nums",
                    limitDiff > 0
                      ? "bg-status-healthy-surface text-status-healthy-fg"
                      : "bg-status-watch-surface text-status-watch-fg",
                  )}
                >
                  {limitDiff > 0 ? "+" : "−"}
                  {formatEuros(Math.abs(limitDiff))}
                </span>
                <span className="text-muted-foreground">vs. {formatMonthShort(previousMonth)}</span>
              </span>
            ) : (
              <span className="text-status-healthy-fg inline-flex items-center gap-1 text-xs font-medium">
                <Check aria-hidden className="size-3" strokeWidth={2.5} />
                Preaprobado sin aval adicional
              </span>
            )
          ) : (
            <span className="text-status-risk-fg text-xs font-medium">
              Revisión de puertas pendiente
            </span>
          )
        }
        footer={
          decision.eligible ? (
            <span>
              Hasta <span className="font-medium text-foreground tabular-nums">{decision.maxTenorDays} días</span> · TAE desde{" "}
              <span className="font-medium text-foreground tabular-nums">{formatApr(decision.apr)}</span>
            </span>
          ) : (
            <span>Condiciones disponibles al pasar puertas</span>
          )
        }
      />

      {/* KPI 3: Ahorro vs Banca */}
      <KpiCard
        icon={PiggyBank}
        label="Ahorro estimado anual"
        value={formatEuros(estimatedSavingsAnnual)}
        unit="/ año"
        accent={{
          tile: "bg-status-watch-surface text-status-watch-fg",
          bars: "text-status-watch",
        }}
        series={savingsSeries.length > 0 ? savingsSeries : [estimatedSavingsAnnual]}
        delta={
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="bg-status-healthy-surface text-status-healthy-fg inline-flex items-center gap-0.5 rounded-full py-px pr-1.5 pl-1 font-medium tabular-nums">
              <ArrowDownRight aria-hidden className="size-3" strokeWidth={2.25} />
              -{(aprDifferential * 100).toFixed(1).replace(".", ",")} % TAE
            </span>
            <span className="text-muted-foreground">vs. media bancaria 8,2 %</span>
          </span>
        }
        footer="Informe de negociación disponible para tu banco"
      />

      {/* KPI 4: Privacidad y Opt-in */}
      <KpiCard
        icon={Lock}
        label="Privacidad de datos"
        value={requested ? "Compartido" : "100 % Privado"}
        accent={{
          tile: requested
            ? "bg-status-healthy-surface text-status-healthy-fg"
            : "bg-secondary text-foreground",
          bars: requested ? "text-status-healthy" : "text-foreground",
        }}
        series={window12.map(() => (requested ? 100 : 50))}
        delta={
          requested ? (
            <span className="text-status-healthy-fg inline-flex items-center gap-1 text-xs font-medium">
              <Check aria-hidden className="size-3" strokeWidth={2.5} />
              Score visible para el partner
            </span>
          ) : (
            <span className="text-muted-foreground inline-flex items-center gap-1 text-xs font-medium">
              <Lock aria-hidden className="size-3" strokeWidth={2} />
              Opt-in activo: nadie ve tu nota
            </span>
          )
        }
        footer="Ni movimientos ni facturas se comparten jamás"
      />
    </section>
  );
}
