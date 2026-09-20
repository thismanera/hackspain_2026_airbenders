"use client";

import { ArrowLeftRight, ShieldAlert, TrendingDown, Wallet, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { TrendPill } from "@/components/grifo/table-figures";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatSigned } from "@/lib/features/portfolio/format";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";
import type { PortfolioSummary } from "@/lib/features/portfolio/types";

/**
 * Cuatro respuestas a "¿qué ha pasado este mes?", cada una con su comparación
 * contra el mes anterior. Dos de ellas son a la vez filtros: pulsar "En riesgo"
 * deja la tabla en las empresas en riesgo, igual que la vista del menú lateral.
 */
type Tone = "good" | "bad" | "neutral";

function Delta({
  value,
  format,
  tone,
  previousMonth,
}: {
  value: number;
  format: (value: number) => string;
  tone: Tone;
  previousMonth: string;
}) {
  if (value === 0) {
    return (
      <span className="text-muted-foreground text-xs whitespace-nowrap">
        Sin cambio vs. {formatMonthShort(previousMonth)}
      </span>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs">
      <TrendPill value={value} format={format} tone={tone} />
      <span className="text-muted-foreground">vs. {formatMonthShort(previousMonth)}</span>
    </span>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  unit,
  delta,
  accent,
  pressed,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta: ReactNode;
  accent: { tile: string };
  pressed?: boolean;
  onToggle?: () => void;
}) {
  const interactive = onToggle !== undefined;
  const Root = interactive ? "button" : "div";

  return (
    <Root
      type={interactive ? "button" : undefined}
      aria-pressed={interactive ? pressed : undefined}
      onClick={onToggle}
      className={cn(
        "bg-card flex flex-col gap-3 rounded-xl border p-4 text-left",
        interactive &&
          "focus-visible:ring-ring hover:border-foreground/20 transition-[border-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:outline-none",
        pressed && "border-foreground/40 ring-foreground/10 ring-2",
      )}
    >
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
        <p className="text-3xl leading-tight font-semibold tracking-[-0.02em] tabular-nums sm:text-4xl">
          {value}
          {unit ? (
            <span className="text-muted-foreground ml-1.5 text-base font-normal sm:text-lg">
              {unit}
            </span>
          ) : null}
        </p>
        {delta}
      </div>
    </Root>
  );
}

export function PortfolioKpis({
  summary,
  previous,
  filters,
  onChange,
}: {
  summary: PortfolioSummary;
  previous: PortfolioSummary | null;
  filters: PortfolioSearchState;
  onChange: (update: Partial<PortfolioSearchState>) => void;
}) {
  const previousMonth = previous?.month ?? summary.month;
  const delta = (pick: (s: PortfolioSummary) => number) =>
    previous ? pick(summary) - pick(previous) : 0;

  const riskOn = filters.estado === "riesgo";
  const deteriorationOn = filters.direccion === "deterioro";

  return (
    <section aria-label="Resumen del mes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Wallet}
        label="Con línea activa"
        value={String(summary.eligible)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-status-healthy-surface text-status-healthy-fg" }}
        delta={
          <Delta
            value={delta((s) => s.eligible)}
            format={(v) => formatSigned(v, 0)}
            tone="neutral"
            previousMonth={previousMonth}
          />
        }
      />

      <KpiCard
        icon={ShieldAlert}
        label="En riesgo"
        value={String(summary.byEstado.riesgo)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-status-risk-surface text-status-risk-fg" }}
        delta={
          <Delta
            value={delta((s) => s.byEstado.riesgo)}
            format={(v) => formatSigned(v, 0)}
            tone={delta((s) => s.byEstado.riesgo) > 0 ? "bad" : "good"}
            previousMonth={previousMonth}
          />
        }
        pressed={riskOn}
        onToggle={() => onChange({ estado: riskOn ? "todos" : "riesgo" })}
      />

      <KpiCard
        icon={TrendingDown}
        label="Con deterioro"
        value={String(summary.byDireccion.deterioro)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-status-watch-surface text-status-watch-fg" }}
        delta={
          <Delta
            value={delta((s) => s.byDireccion.deterioro)}
            format={(v) => formatSigned(v, 0)}
            tone={delta((s) => s.byDireccion.deterioro) > 0 ? "bad" : "good"}
            previousMonth={previousMonth}
          />
        }
        pressed={deteriorationOn}
        onToggle={() => onChange({ direccion: deteriorationOn ? "todas" : "deterioro" })}
      />

      <KpiCard
        icon={ArrowLeftRight}
        label="Se mueven este mes"
        value={String(summary.moved)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-secondary text-foreground" }}
        delta={
          <Delta
            value={delta((s) => s.moved)}
            format={(v) => formatSigned(v, 0)}
            tone="neutral"
            previousMonth={previousMonth}
          />
        }
      />
    </section>
  );
}
