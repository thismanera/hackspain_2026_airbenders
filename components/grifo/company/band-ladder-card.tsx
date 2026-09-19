"use client";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusBadge } from "@/components/grifo/status-badge";
import { Sparkline, TrendDelta } from "@/components/grifo/trend";
import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { nextBand } from "@/lib/features/portfolio/band-ladder";
import {
  formatApr,
  formatDays,
  formatDecimal,
  formatIndicatorValue,
  formatMonthShort,
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
  { id: "D", min: 0, max: 45, color: "bg-status-risk" },
  { id: "C", min: 45, max: 60, color: "bg-status-watch" },
  { id: "B", min: 60, max: 75, color: "bg-status-healthy" },
  { id: "A", min: 75, max: 100, color: "bg-primary" },
] as const;

/** Cuatro peldaños iguales: el score se coloca dentro de su banda, no al % crudo. */
function markerLeft(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  const index = BANDS.findIndex((band) => clamped < band.max || band.id === "A");
  const band = BANDS[index === -1 ? BANDS.length - 1 : index];
  const span = band.max - band.min || 1;
  const t = Math.min(1, Math.max(0, (clamped - band.min) / span));
  const percent = ((index + t) / BANDS.length) * 100;
  return Math.min(96, Math.max(4, percent));
}

export function BandLadderCard({
  file,
  benchmark,
  month,
}: {
  file: CompanyFileResponse;
  benchmark: BenchmarkResponse;
  month: string;
}) {
  const { latest, company, history } = file;
  const currentBand = deriveBanda(latest.score);
  const step = nextBand(latest.score);
  const lever = biggestLever(latest, benchmark);
  const leverMeta = lever ? indicator(lever.indicator) : null;
  const currentBandInfo = BANDA[currentBand];
  const spark = history
    .filter((entry) => entry.coverage.observedMonths > 0)
    .map((entry) => entry.score)
    .slice(-12);

  return (
    <Panel
      title={company.id}
      description={[company.country, company.currency, company.groupSize > 1 ? company.groupId : null]
        .filter(Boolean)
        .join(" · ")}
      aside={<StatusBadge estado={latest.estado} />}
      className="flex flex-col"
      bodyClassName="flex flex-1 flex-col gap-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CompanyAvatar companyId={company.id} size="lg" />
          <div>
            <p className="text-muted-foreground text-xs">Score · {formatMonthShort(month)}</p>
            <p className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
                {formatScore(latest.score)}
              </span>
              <span className="text-muted-foreground text-sm">/ 100</span>
              <span className="text-muted-foreground text-xs font-medium">
                Banda {currentBand}
              </span>
            </p>
          </div>
        </div>
        <Sparkline values={spark} direction={latest.direction} className="mt-2" />
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
        <span className="text-muted-foreground text-xs tabular-nums">
          Mejor que el {formatPercent(benchmark.scorePercentile, 0)} de {benchmark.cohort}
        </span>
      </div>

      <div>
        <div className="relative h-3.5">
          <div className="absolute inset-x-0 top-1/2 flex h-2 -translate-y-1/2 gap-0.5">
            {BANDS.map((band) => (
              <div
                key={band.id}
                className={cn(
                  "h-full flex-1 rounded-full",
                  band.id === currentBand ? band.color : "bg-muted-foreground/15",
                )}
              />
            ))}
          </div>
          <div
            aria-hidden
            className="bg-card ring-foreground pointer-events-none absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2"
            style={{ left: `${markerLeft(latest.score)}%` }}
          />
          <span className="sr-only">
            Score {formatScore(latest.score)}, banda {currentBand}
          </span>
        </div>
        <div className="text-muted-foreground mt-1.5 flex gap-0.5 text-xs">
          {BANDS.map((band) => (
            <span
              key={band.id}
              className={cn(
                "flex-1 text-center tabular-nums",
                band.id === currentBand && "text-foreground font-semibold",
              )}
            >
              {band.id}
            </span>
          ))}
        </div>
      </div>

      {step ? (
        <p className="text-muted-foreground text-xs text-pretty">
          <span className="text-foreground font-medium">
            {formatDecimal(step.pointsMissing)} pts para banda {step.band}.
          </span>{" "}
          TAE base {formatApr(step.baseApr)}
          {step.maxTenor > currentBandInfo.maxTenor
            ? ` y plazo hasta ${formatDays(step.maxTenor)}`
            : ""}
          .
        </p>
      ) : (
        <p className="text-muted-foreground text-xs text-pretty">
          Banda A: el mejor tipo y el plazo más largo que ofrece el modelo.
        </p>
      )}

      {lever && leverMeta ? (
        <p className="text-muted-foreground border-t pt-3 text-xs text-pretty">
          <span className="text-foreground font-medium">Palanca: </span>
          {leverMeta.label.toLowerCase()} (
          {formatIndicatorValue(lever.raw, leverMeta.format)} frente a mediana{" "}
          {formatIndicatorValue(lever.medianRaw, leverMeta.format)}).
        </p>
      ) : null}
    </Panel>
  );
}
