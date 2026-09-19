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

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  footer,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta: ReactNode;
  footer?: ReactNode;
  accent: { tile: string };
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
        <p className="text-xl leading-tight font-semibold tracking-[-0.02em] tabular-nums sm:text-2xl">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-1 text-sm font-normal sm:text-base">{unit}</span>
          ) : null}
        </p>
        {delta}
      </div>

      {footer ? (
        <div className="text-muted-foreground truncate border-t pt-2.5 text-xs">{footer}</div>
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
  const { latest, previous } = file;
  const { decision } = latest;
  const previousMonth = previous?.month ?? latest.month;

  // Cálculo de ahorro estimado vs póliza bancaria tradicional estándar (8.2% TAE + apertura)
  const traditionalApr = 0.082;
  const activeApr = decision.eligible ? decision.apr : 0.07;
  const aprDifferential = Math.max(0, traditionalApr - activeApr);
  const baseAmount = decision.eligible && decision.limit > 0 ? decision.limit : 20000;
  const estimatedSavingsAnnual = Math.round(baseAmount * (aprDifferential + 0.005));

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
        accent={{ tile: "bg-status-healthy-surface text-status-healthy-fg" }}
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
          <>
            Banda {decision.band} · top{" "}
            <span className="text-foreground tabular-nums">
              {formatPercent(benchmark.scorePercentile, 0)}
            </span>{" "}
            del sector
          </>
        }
      />

      {/* KPI 2: Límite Preaprobado */}
      <KpiCard
        icon={Wallet}
        label="Límite preaprobado"
        value={decision.eligible ? formatEuros(decision.limit) : "0 €"}
        accent={{ tile: "bg-status-healthy-surface text-status-healthy-fg" }}
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
          decision.eligible
            ? `Hasta ${decision.maxTenorDays} días · TAE ${formatApr(decision.apr)}`
            : "Condiciones al pasar puertas"
        }
      />

      {/* KPI 3: Ahorro vs Banca */}
      <KpiCard
        icon={PiggyBank}
        label="Ahorro estimado anual"
        value={formatEuros(estimatedSavingsAnnual)}
        unit="/ año"
        accent={{ tile: "bg-status-watch-surface text-status-watch-fg" }}
        delta={
          <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
            <span className="bg-status-healthy-surface text-status-healthy-fg inline-flex items-center gap-0.5 rounded-full py-px pr-1.5 pl-1 font-medium tabular-nums">
              <ArrowDownRight aria-hidden className="size-3" strokeWidth={2.25} />
              -{(aprDifferential * 100).toFixed(1).replace(".", ",")} % TAE
            </span>
            <span className="text-muted-foreground">vs. media bancaria 8,2 %</span>
          </span>
        }
        footer="Informe de negociación para tu banco"
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
        }}
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
        footer="Sin compartir movimientos ni facturas"
      />
    </section>
  );
}
