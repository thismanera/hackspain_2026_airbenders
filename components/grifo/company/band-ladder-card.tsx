"use client";

import { ArrowUpRight, Sparkles, TrendingUp, Users } from "lucide-react";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusBadge } from "@/components/grifo/status-badge";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { nextBand } from "@/lib/features/portfolio/band-ladder";
import {
  formatApr,
  formatDays,
  formatDecimal,
  formatIndicatorValue,
  formatMonthLong,
  formatPercent,
  formatScore,
} from "@/lib/features/portfolio/format";
import { indicator } from "@/lib/features/portfolio/indicators";
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

/**
 * El indicador con más recorrido: el que más puntos deja sobre la mesa por
 * debajo del percentil 40 de sus pares.
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

const BANDS = [
  { id: "D", min: 0, max: 44, label: "D (<45)", color: "bg-status-risk" },
  { id: "C", min: 45, max: 59, label: "C (45–59)", color: "bg-status-watch" },
  { id: "B", min: 60, max: 74, label: "B (60–74)", color: "bg-status-healthy" },
  { id: "A", min: 75, max: 100, label: "A (75–100)", color: "bg-primary" },
] as const;

export function BandLadderCard({
  file,
  benchmark,
  month,
}: {
  file: CompanyFileResponse;
  benchmark: BenchmarkResponse;
  month: string;
}) {
  const { latest, company } = file;
  const currentBand = deriveBanda(latest.score);
  const step = nextBand(latest.score);
  const lever = biggestLever(latest, benchmark);
  const leverMeta = lever ? indicator(lever.indicator) : null;
  const currentBandInfo = BANDA[currentBand];

  const groupScore = latest.scoreGrupo ?? latest.standaloneScore + (latest.group?.adjustment ?? 0);
  const groupDiffers = latest.group !== null && Math.abs(groupScore - latest.score) >= 0.5;

  return (
    <div className="bg-card flex flex-col justify-between rounded-xl border p-5">
      {/* Cabecera de identidad corporativa */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CompanyAvatar companyId={company.id} size="lg" />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-semibold tracking-tight">{company.id}</span>
              <span className="text-muted-foreground text-xs font-medium">
                {company.country} · {company.currency}
              </span>
            </div>
            <span className="text-muted-foreground text-xs">
              <span className="font-mono">{company.groupId}</span>
              {company.groupSize > 1 ? ` · Holding de ${company.groupSize} filiales` : " · Filial única"}
            </span>
          </div>
        </div>
        <StatusBadge estado={latest.estado} size="lg" />
      </div>

      {/* Score Principal */}
      <div className="mt-5">
        <p className="text-muted-foreground text-xs">Score de salud financiera en {formatMonthLong(month)}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-5xl leading-none font-semibold tracking-[-0.03em] tabular-nums">
            {formatScore(latest.score)}
          </span>
          <span className="text-muted-foreground text-xl font-normal">/ 100</span>
          <span
            className={cn(
              "ml-2 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide",
              currentBand === "A" && "bg-primary text-primary-foreground",
              currentBand === "B" && "bg-status-healthy-surface text-status-healthy-fg",
              currentBand === "C" && "bg-status-watch-surface text-status-watch-fg",
              currentBand === "D" && "bg-status-risk-surface text-status-risk-fg",
            )}
          >
            Banda {currentBand}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
          <span className="text-muted-foreground text-xs tabular-nums">
            Confianza {formatPercent(latest.confidence, 0)}
          </span>
          {groupDiffers ? (
            <span className="text-muted-foreground text-xs tabular-nums">
              Score consolidado con holding {formatScore(groupScore)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Escalera de Bandas Visual */}
      <div className="mt-6 rounded-lg border bg-muted/20 p-3.5">
        <div className="flex items-center justify-between text-xs">
          <span className="font-medium">Escalera de calificación crediticia</span>
          <span className="text-muted-foreground tabular-nums">
            Tu posición: {formatScore(latest.score)} pts
          </span>
        </div>

        {/* Barra segmentada */}
        <div className="relative mt-2.5 flex h-2 w-full overflow-hidden rounded-full bg-muted">
          {BANDS.map((band) => {
            const isCurrent = band.id === currentBand;
            return (
              <div
                key={band.id}
                className={cn(
                  "relative h-full flex-1 border-r border-card last:border-0 transition-opacity",
                  isCurrent ? band.color : "bg-muted-foreground/20",
                )}
                title={band.label}
              />
            );
          })}
          {/* Indicador de posición actual */}
          <div
            className="absolute -top-0.5 size-3 -translate-x-1/2 rounded-full border-2 border-card bg-foreground shadow-xs"
            style={{ left: `${Math.min(98, Math.max(2, latest.score))}%` }}
            title={`Score actual: ${latest.score}`}
          />
        </div>

        {/* Etiquetas de bandas */}
        <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
          {BANDS.map((band) => (
            <span
              key={band.id}
              className={cn("tabular-nums", band.id === currentBand && "font-semibold text-foreground")}
            >
              {band.id}
            </span>
          ))}
        </div>

        {/* Salto a la siguiente banda y ventajas */}
        {step ? (
          <div className="mt-3 flex items-start gap-2 border-t pt-2.5 text-xs text-pretty">
            <Sparkles aria-hidden className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
            <div>
              <p>
                <span className="font-medium text-foreground">
                  A {formatDecimal(step.pointsMissing)} puntos de Banda {step.band}:
                </span>{" "}
                <span className="text-muted-foreground">
                  desbloquearás TAE base {formatApr(step.baseApr)} (vs. {formatApr(currentBandInfo.baseApr)})
                  {step.maxTenor > currentBandInfo.maxTenor ? ` y plazo hasta ${formatDays(step.maxTenor)}` : ""}.
                </span>
              </p>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex items-center gap-1.5 border-t pt-2.5 text-xs text-status-healthy-fg">
            <Sparkles aria-hidden className="size-3.5" />
            <span className="font-medium">
              Calificación máxima activa: mejor tipo de interés y máximo plazo disponibles.
            </span>
          </div>
        )}
      </div>

      {/* Palanca de mejora operativa */}
      {lever && leverMeta ? (
        <div className="mt-3.5 flex items-start gap-2 rounded-lg border border-dashed p-3 text-xs">
          <TrendingUp aria-hidden className="mt-0.5 size-3.5 shrink-0 text-status-healthy-fg" />
          <p className="text-muted-foreground text-pretty">
            <span className="font-medium text-foreground">Palanca de mayor impacto: </span>
            {leverMeta.label.toLowerCase()} ({formatIndicatorValue(lever.raw, leverMeta.format)} frente a la mediana de{" "}
            {formatIndicatorValue(lever.medianRaw, leverMeta.format)}). Mejorar este indicador es el camino más directo para subir de banda.
          </p>
        </div>
      ) : null}

      {/* Cohorte de empresas */}
      <div className="mt-4 flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <Users aria-hidden className="size-3.5" />
          {ordinal(benchmark.scorePercentile)}: mejor que el{" "}
          <span className="font-medium text-foreground tabular-nums">
            {formatPercent(benchmark.scorePercentile, 0)}
          </span>{" "}
          de {benchmark.cohort} comparables
        </span>
        <span className="text-xs">Recalculado mensualmente</span>
      </div>
    </div>
  );
}
