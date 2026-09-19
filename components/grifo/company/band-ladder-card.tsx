"use client";

import { Target } from "lucide-react";
import type { ReactNode } from "react";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { StatusBadge } from "@/components/grifo/status-badge";
import { Sparkline, TrendDelta } from "@/components/grifo/trend";
import { Panel } from "@/components/grifo/panel";
import { Skeleton } from "@/components/ui/skeleton";
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
  formatSigned,
} from "@/lib/features/portfolio/format";
import { useGroupScore } from "@/lib/features/portfolio/hooks";
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
  { id: "D", min: 0, max: 45 },
  { id: "C", min: 45, max: 60 },
  { id: "B", min: 60, max: 75 },
  { id: "A", min: 75, max: 100 },
] as const;

/** Cuatro peldaños iguales: el score se coloca dentro de su banda, no al % crudo. */
function markerLeft(score: number): number {
  const clamped = Math.min(100, Math.max(0, score));
  const index = BANDS.findIndex((band) => clamped < band.max || band.id === "A");
  const band = BANDS[index === -1 ? BANDS.length - 1 : index];
  const span = band.max - band.min || 1;
  const t = Math.min(1, Math.max(0, (clamped - band.min) / span));
  const percent = ((index + t) / BANDS.length) * 100;
  return Math.min(98, Math.max(2, percent));
}

const BAND_FILL = {
  D: "bg-status-risk",
  C: "bg-status-watch",
  B: "bg-status-healthy",
  A: "bg-primary",
} as const;

/**
 * Medidor de banda: se llena desde la izquierda hasta donde llega el score, en
 * vez de encender solo el peldaño en el que cae. Un tramo suelto iluminado a la
 * derecha se lee como «le falta todo lo de la izquierda»; lo que hay que ver es
 * cuánto camino lleva andado y cuánto le queda para la banda siguiente.
 */
function BandGauge({ score, label }: { score: number; label: string }) {
  const band = deriveBanda(score);
  const fill = markerLeft(score);

  return (
    <div>
      <div className="relative h-2">
        <div className="bg-muted absolute inset-0 overflow-hidden rounded-full">
          <div
            className={cn("h-full rounded-full transition-[width] duration-200", BAND_FILL[band])}
            style={{ width: `${fill}%` }}
          />
        </div>
        {/* Las fronteras de banda, marcadas sobre el propio medidor: sin ellas el
            relleno es un porcentaje cualquiera y no se ve qué peldaño cruza. */}
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            aria-hidden
            className="bg-card absolute inset-y-0 w-px"
            style={{ left: `${step * 25}%` }}
          />
        ))}
        <span className="sr-only">
          {label}: {formatScore(score)} de 100, banda {band}
        </span>
      </div>
      <div className="mt-1.5 flex text-xs">
        {BANDS.map((entry) => (
          <span
            key={entry.id}
            className={cn(
              "flex-1 text-center tabular-nums",
              entry.id === band ? "text-foreground font-semibold" : "text-muted-foreground",
            )}
          >
            {entry.id}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * Una nota con su medidor: el mismo bloque para la empresa y para su holding,
 * porque son la misma clase de cifra y compararlas es justamente el punto.
 */
function ScoreBlock({
  avatarId,
  caption,
  score,
  aside,
  children,
}: {
  avatarId: string;
  caption: string;
  score: number;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  const band = deriveBanda(score);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <CompanyAvatar companyId={avatarId} size="lg" />
          <div className="min-w-0">
            <p className="text-muted-foreground text-xs">{caption}</p>
            <p className="mt-0.5 flex items-baseline gap-2">
              <span className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
                {formatScore(score)}
              </span>
              <span className="text-muted-foreground text-sm">/ 100</span>
              <span className="text-muted-foreground text-xs font-medium">Banda {band}</span>
            </p>
          </div>
        </div>
        {aside}
      </div>
      {children}
      <BandGauge score={score} label={caption} />
    </div>
  );
}

/** La nota del holding, la misma que pinta `/grupos`: media ponderada por peso. */
function GroupScoreBlock({
  groupId,
  month,
  adjustment,
  siblings,
}: {
  groupId: string;
  month: string;
  adjustment: number;
  siblings: number;
}) {
  const { data, isPending } = useGroupScore(groupId, month);

  if (isPending) {
    return (
      <div className="flex items-center gap-3">
        <Skeleton className="size-10 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-1.5">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const neutral = Math.abs(adjustment) < 0.5;

  return (
    <ScoreBlock
      avatarId={groupId}
      caption={`Grupo · ${siblings + 1} empresas`}
      score={data.score}
      aside={
        <span
          className={cn(
            "shrink-0 text-xs font-medium tabular-nums",
            neutral
              ? "text-muted-foreground"
              : adjustment > 0
                ? "text-status-healthy-fg"
                : "text-status-risk-fg",
          )}
        >
          {neutral ? "Sin efecto" : `${formatSigned(adjustment)} a tu nota`}
        </span>
      }
    />
  );
}

export function BandLadderCard({
  file,
  benchmark,
  month,
  className,
}: {
  file: CompanyFileResponse;
  benchmark: BenchmarkResponse;
  month: string;
  className?: string;
}) {
  const { latest, company } = file;
  const currentBand = deriveBanda(latest.score);
  const step = nextBand(latest.score);
  const lever = biggestLever(latest, benchmark);
  const leverMeta = lever ? indicator(lever.indicator) : null;
  const currentBandInfo = BANDA[currentBand];
  const group = latest.group;
  const spark = file.history
    .filter((entry) => entry.coverage.observedMonths > 0)
    .map((entry) => entry.score)
    .slice(-12);

  return (
    <Panel
      title={company.id}
      description={[company.country, company.currency].filter(Boolean).join(" · ")}
      aside={<StatusBadge estado={latest.estado} />}
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col gap-4"
    >
      <ScoreBlock
        avatarId={company.id}
        caption={`Tu score · ${formatMonthShort(month)}`}
        score={latest.score}
        aside={<Sparkline values={spark} direction={latest.direction} className="mt-2" />}
      >
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <TrendDelta trend3m={latest.trend3m} direction={latest.direction} showWindow />
          <span className="text-muted-foreground text-xs tabular-nums">
            Mejor que el {formatPercent(benchmark.scorePercentile, 0)} de {benchmark.cohort}
          </span>
        </div>
      </ScoreBlock>

      <p className="text-muted-foreground text-xs text-pretty">
        {step ? (
          <>
            <span className="text-foreground font-medium">
              {formatDecimal(step.pointsMissing)} pts para banda {step.band}.
            </span>{" "}
            TAE base {formatApr(step.baseApr)}
            {step.maxTenor > currentBandInfo.maxTenor
              ? ` y plazo hasta ${formatDays(step.maxTenor)}`
              : ""}
            .
          </>
        ) : (
          "Banda A: el mejor tipo y el plazo más largo que ofrece el modelo."
        )}
      </p>

      {group && company.groupSize > 1 ? (
        <div className="border-t pt-4">
          <GroupScoreBlock
            groupId={group.groupId}
            month={month}
            adjustment={group.adjustment}
            siblings={group.siblings}
          />
        </div>
      ) : null}

      {lever && leverMeta ? (
        <div className="mt-auto border-t pt-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
            <Target aria-hidden className="size-3.5 shrink-0" />
            Dónde más puedes mejorar
          </p>
          <p className="mt-1 text-xs text-pretty">
            <span className="font-medium">{leverMeta.label}</span>
            <span className="text-muted-foreground">
              : {formatIndicatorValue(lever.raw, leverMeta.format)} · la mediana de tus pares es{" "}
              {formatIndicatorValue(lever.medianRaw, leverMeta.format)}
            </span>
          </p>
        </div>
      ) : null}
    </Panel>
  );
}
