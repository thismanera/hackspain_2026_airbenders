"use client";

import {
  ArrowDownRight,
  ArrowLeftRight,
  ArrowUpRight,
  ShieldAlert,
  TrendingDown,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/core/utils";
import { formatEuros, formatMonthShort, formatSigned } from "@/lib/features/portfolio/format";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";
import type { PortfolioSummary } from "@/lib/features/portfolio/types";

/**
 * Cuatro respuestas a "¿qué ha pasado este mes?", cada una con su comparación
 * contra el mes anterior y los últimos doce meses detrás. Dos de ellas son a la
 * vez filtros: pulsar "En riesgo" deja la tabla en las empresas en riesgo, igual
 * que la vista del menú lateral.
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
  const Icon = value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="flex items-center gap-1.5 text-xs whitespace-nowrap">
      <span
        className={cn(
          "inline-flex items-center gap-0.5 rounded-full py-px pr-1.5 pl-1 font-medium tabular-nums",
          tone === "good" && "bg-status-healthy-surface text-status-healthy-fg",
          tone === "bad" && "bg-status-risk-surface text-status-risk-fg",
          tone === "neutral" && "bg-secondary text-secondary-foreground",
        )}
      >
        <Icon aria-hidden className="size-3" strokeWidth={2.25} />
        {format(value)}
      </span>
      <span className="text-muted-foreground">vs. {formatMonthShort(previousMonth)}</span>
    </span>
  );
}

/**
 * Doce barras, una por mes, con la última resaltada. Es una ayuda de lectura del
 * número grande de al lado, no un gráfico: sin ejes ni tooltip, y decorativa.
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
  pressed,
  onToggle,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
  delta: ReactNode;
  series: number[];
  footer?: ReactNode;
  accent: { tile: string; bars: string };
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
    </Root>
  );
}

export function PortfolioKpis({
  summary,
  previous,
  history,
  filters,
  onChange,
}: {
  summary: PortfolioSummary;
  previous: PortfolioSummary | null;
  history: PortfolioSummary[];
  filters: PortfolioSearchState;
  onChange: (update: Partial<PortfolioSearchState>) => void;
}) {
  const window = history.slice(-12);
  const previousMonth = previous?.month ?? summary.month;
  const delta = (pick: (s: PortfolioSummary) => number) =>
    previous ? pick(summary) - pick(previous) : 0;

  const riskOn = filters.estado === "riesgo";
  const deteriorationOn = filters.direccion === "deterioro";

  const up = summary.byAccion.abrir + summary.byAccion.ampliar;
  const down = summary.byAccion.reducir + summary.byAccion.cerrar;

  return (
    <section aria-label="Resumen del mes" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <KpiCard
        icon={Wallet}
        label="Límite vivo"
        value={formatEuros(summary.exposure)}
        accent={{
          tile: "bg-status-healthy-surface text-status-healthy-fg",
          bars: "text-status-healthy",
        }}
        series={window.map((s) => s.exposure)}
        delta={
          <Delta
            value={delta((s) => s.exposure)}
            format={(v) => `${v > 0 ? "+" : "−"}${formatEuros(Math.abs(v))}`}
            tone="neutral"
            previousMonth={previousMonth}
          />
        }
        footer={
          <>
            Suma de los límites de las{" "}
            <span className="text-foreground tabular-nums">{summary.eligible}</span> empresas con
            línea
          </>
        }
      />

      <KpiCard
        icon={ShieldAlert}
        label="En riesgo"
        value={String(summary.byEstado.riesgo)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-status-risk-surface text-status-risk-fg", bars: "text-status-risk" }}
        series={window.map((s) => s.byEstado.riesgo)}
        delta={
          <Delta
            value={delta((s) => s.byEstado.riesgo)}
            format={(v) => formatSigned(v, 0)}
            tone={delta((s) => s.byEstado.riesgo) > 0 ? "bad" : "good"}
            previousMonth={previousMonth}
          />
        }
        footer="Score bajo 45, o dos meses sin pagar una obligación"
        pressed={riskOn}
        onToggle={() => onChange({ estado: riskOn ? "todos" : "riesgo" })}
      />

      <KpiCard
        icon={TrendingDown}
        label="Con deterioro"
        value={String(summary.byDireccion.deterioro)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-status-watch-surface text-status-watch-fg", bars: "text-status-watch" }}
        series={window.map((s) => s.byDireccion.deterioro)}
        delta={
          <Delta
            value={delta((s) => s.byDireccion.deterioro)}
            format={(v) => formatSigned(v, 0)}
            tone={delta((s) => s.byDireccion.deterioro) > 0 ? "bad" : "good"}
            previousMonth={previousMonth}
          />
        }
        footer="El score cae 6 puntos o más respecto a hace 3 meses"
        pressed={deteriorationOn}
        onToggle={() => onChange({ direccion: deteriorationOn ? "todas" : "deterioro" })}
      />

      <KpiCard
        icon={ArrowLeftRight}
        label="Se mueven este mes"
        value={String(summary.moved)}
        unit={`de ${summary.total}`}
        accent={{ tile: "bg-secondary text-foreground", bars: "text-foreground" }}
        series={window.map((s) => s.moved)}
        delta={
          <Delta
            value={delta((s) => s.moved)}
            format={(v) => formatSigned(v, 0)}
            tone="neutral"
            previousMonth={previousMonth}
          />
        }
        footer={
          <span className="flex items-center gap-3">
            <span className="text-status-healthy-fg inline-flex items-center gap-1 tabular-nums">
              <ArrowUpRight aria-hidden className="size-3" /> {up} abren o amplían
            </span>
            <span className="text-status-risk-fg inline-flex items-center gap-1 tabular-nums">
              <ArrowDownRight aria-hidden className="size-3" /> {down} reducen o cierran
            </span>
          </span>
        }
      />
    </section>
  );
}
