"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, X } from "lucide-react";
import { useState } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyPicker, PORTFOLIO_PICKER_FILTERS } from "@/components/grifo/company-picker";
import { Panel } from "@/components/grifo/panel";
import {
  DIRECCION_OPTIONS,
  ESTADO_OPTIONS,
  FilterSelect,
} from "@/components/grifo/portfolio-filters";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import { fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";
import type { PortfolioListRow } from "@/lib/features/portfolio/types";
import { ACCION } from "@/lib/features/portfolio/vocabulary";

const W = 720;
const H = 360;
const PAD = { top: 26, right: 16, bottom: 34, left: 16 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Umbrales de SOURCE: 70 separa "sana" del resto; ±6 separa estable de movimiento. */
const HEALTHY_CUT = 70;
const TREND_CUT = 6;
const MIN_TREND_AXIS = 10;
const HOT_R = 8;

/** Mismo código que "Hot este mes": fuego (rojo) para lo que mejora, hielo (azul) para lo que cae. */
const TONE = {
  mejora: "var(--status-risk)",
  deterioro: "var(--color-sky-600)",
  estable: "var(--status-none)",
} satisfies Record<PortfolioListRow["direction"], string>;

/** Cuatro zonas: salud hoy (eje X) × trayectoria a 3 meses (eje Y). */
const QUADRANT = {
  weakImprove: {
    fill: "var(--status-watch-surface)",
    label: "var(--status-watch-fg)",
    title: "Débiles que mejoran",
  },
  healthyImprove: {
    fill: "var(--status-healthy-surface)",
    label: "var(--status-healthy-fg)",
    title: "Sanas que mejoran",
  },
  weakFall: {
    fill: "var(--status-risk-surface)",
    label: "var(--status-risk-fg)",
    title: "Débiles que caen",
  },
  healthyFall: {
    fill: "var(--status-none-surface)",
    label: "var(--status-none-fg)",
    title: "Sanas que caen",
  },
} as const;

/** Dos hot casi encima se separan un poco en horizontal para que se lean los dos números. */
function spread(points: { id: string; x: number; y: number }[]): Map<string, number> {
  const gap = HOT_R * 2 + 2;
  const placed: { x: number; y: number }[] = [];
  const result = new Map<string, number>();
  for (const point of points) {
    let px = point.x;
    for (let step = 1; step <= 12; step++) {
      const free = !placed.some((prev) => Math.hypot(prev.x - px, prev.y - point.y) < gap);
      if (free) break;
      const side = step % 2 === 1 ? 1 : -1;
      px = point.x + side * Math.ceil(step / 2) * gap;
    }
    placed.push({ x: px, y: point.y });
    result.set(point.id, px);
  }
  return result;
}

/**
 * Cada empresa es un punto: a la derecha cuanto más sana hoy, arriba cuanto más
 * mejora en 3 meses. Solo las "hot" llevan color y nombre; el resto es fondo.
 * La estela de 6 meses aparece al pasar por una empresa, no todas a la vez.
 */
export function TrajectoryMap({
  rows,
  month,
  filters,
  onChange,
  onOpenCompany,
  onHoverCompany,
  className,
}: {
  rows: PortfolioListRow[];
  month: string;
  filters: PortfolioSearchState;
  onChange: (update: Partial<PortfolioSearchState>) => void;
  onOpenCompany: (companyId: string) => void;
  onHoverCompany?: (companyId: string | null) => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);

  const hover = (companyId: string | null) => {
    setHovered(companyId);
    onHoverCompany?.(companyId);
  };

  const plotted = rows.filter((row) => row.trend3m !== null);
  const maxTrend = Math.max(
    MIN_TREND_AXIS,
    ...plotted.flatMap((row) => row.trail.map((point) => Math.abs(point.trend3m))),
  );
  const trendAxis = Math.ceil(maxTrend / 5) * 5;

  const x = (score: number) => PAD.left + (Math.min(100, Math.max(0, score)) / 100) * PLOT_W;
  const y = (trend: number) =>
    PAD.top +
    PLOT_H / 2 -
    (Math.min(trendAxis, Math.max(-trendAxis, trend)) / trendAxis) * (PLOT_H / 2);

  /** Por defecto solo se dibujan las hot: el resto de la cartera queda como fondo del cuadrante, no como nube de puntos. */
  const hot = plotted.filter((row) => row.hot !== null);
  const hotIds = new Set(hot.map((row) => row.company.id));

  /** "Buscar empresa" añade su punto aunque no sea hot ni pase los filtros activos:
      se resuelve contra la cartera sin filtrar, la misma que usa el propio buscador. */
  const pickerFilters = { ...PORTFOLIO_PICKER_FILTERS, mes: month };
  const { data: fullPortfolio } = useQuery({
    queryKey: portfolioKeys.list(pickerFilters),
    queryFn: () => fetchPortfolio(pickerFilters),
    enabled: pinnedIds.length > 0,
    staleTime: 60 * 60 * 1000,
  });
  const pinned = pinnedIds
    .filter((id) => !hotIds.has(id))
    .map((id) => fullPortfolio?.rows.find((row) => row.company.id === id))
    .filter((row): row is PortfolioListRow => !!row && row.trend3m !== null);

  const marked = [...hot, ...pinned];
  const markedX = spread(
    marked.map((row) => ({ id: row.company.id, x: x(row.score), y: y(row.trend3m!) })),
  );
  const active = hovered ? marked.find((row) => row.company.id === hovered) : undefined;

  return (
    <Panel
      title="Hoy y hacia dónde va"
      description="Derecha: mejor score hoy. Arriba: mejora en tres meses."
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col gap-3 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Filtrar por estado"
          value={filters.estado}
          options={ESTADO_OPTIONS}
          onChange={(value) => onChange({ estado: value as PortfolioSearchState["estado"] })}
        />
        <FilterSelect
          label="Filtrar por tendencia"
          value={filters.direccion}
          options={DIRECCION_OPTIONS}
          onChange={(value) => onChange({ direccion: value as PortfolioSearchState["direccion"] })}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => setPickerOpen(true)}
          className="ml-auto"
        >
          <Search aria-hidden className="size-3.5" />
          Buscar empresa
        </Button>
      </div>

      {pinnedIds.length > 0 ? (
        <ul className="-mt-1 flex flex-wrap items-center gap-1.5">
          {pinnedIds.map((companyId) => (
            <li key={companyId}>
              <button
                type="button"
                onClick={() => setPinnedIds((prev) => prev.filter((id) => id !== companyId))}
                className="bg-secondary hover:bg-secondary/70 flex items-center gap-1 rounded-full py-1 pr-1.5 pl-2.5 font-mono text-xs transition-colors duration-150"
              >
                {companyId}
                <X aria-hidden className="text-muted-foreground size-3.5" />
                <span className="sr-only">Quitar del gráfico</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="relative" onMouseLeave={() => hover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-auto w-full overflow-visible">
          {/* Cuatro cuadrantes coloreados: salud hoy × trayectoria a 3 meses. */}
          <rect
            x={PAD.left}
            y={PAD.top}
            width={x(HEALTHY_CUT) - PAD.left}
            height={y(0) - PAD.top}
            fill={QUADRANT.weakImprove.fill}
          />
          <rect
            x={x(HEALTHY_CUT)}
            y={PAD.top}
            width={PAD.left + PLOT_W - x(HEALTHY_CUT)}
            height={y(0) - PAD.top}
            fill={QUADRANT.healthyImprove.fill}
          />
          <rect
            x={PAD.left}
            y={y(0)}
            width={x(HEALTHY_CUT) - PAD.left}
            height={PAD.top + PLOT_H - y(0)}
            fill={QUADRANT.weakFall.fill}
          />
          <rect
            x={x(HEALTHY_CUT)}
            y={y(0)}
            width={PAD.left + PLOT_W - x(HEALTHY_CUT)}
            height={PAD.top + PLOT_H - y(0)}
            fill={QUADRANT.healthyFall.fill}
          />

          {/* Franja estable: empresas con poco movimiento estructural. */}
          <rect
            x={PAD.left}
            y={y(TREND_CUT)}
            width={PLOT_W}
            height={y(-TREND_CUT) - y(TREND_CUT)}
            fill="var(--card)"
            opacity={0.72}
          />

          <line x1={PAD.left} x2={PAD.left + PLOT_W} y1={y(0)} y2={y(0)} stroke="var(--border)" />
          <line
            x1={x(HEALTHY_CUT)}
            x2={x(HEALTHY_CUT)}
            y1={PAD.top}
            y2={PAD.top + PLOT_H}
            stroke="var(--border)"
            strokeDasharray="4 4"
          />

          {/* Etiqueta dentro de cada cuadrante para leer la zona sin mirar la leyenda. */}
          <g fontSize={11} fontWeight={500}>
            <text
              x={PAD.left + (x(HEALTHY_CUT) - PAD.left) / 2}
              y={PAD.top + (y(0) - PAD.top) / 2 + 4}
              textAnchor="middle"
              fill={QUADRANT.weakImprove.label}
            >
              {QUADRANT.weakImprove.title}
            </text>
            <text
              x={x(HEALTHY_CUT) + (PAD.left + PLOT_W - x(HEALTHY_CUT)) / 2}
              y={PAD.top + (y(0) - PAD.top) / 2 + 4}
              textAnchor="middle"
              fill={QUADRANT.healthyImprove.label}
            >
              {QUADRANT.healthyImprove.title}
            </text>
            <text
              x={PAD.left + (x(HEALTHY_CUT) - PAD.left) / 2}
              y={y(0) + (PAD.top + PLOT_H - y(0)) / 2 + 4}
              textAnchor="middle"
              fill={QUADRANT.weakFall.label}
            >
              {QUADRANT.weakFall.title}
            </text>
            <text
              x={x(HEALTHY_CUT) + (PAD.left + PLOT_W - x(HEALTHY_CUT)) / 2}
              y={y(0) + (PAD.top + PLOT_H - y(0)) / 2 + 4}
              textAnchor="middle"
              fill={QUADRANT.healthyFall.label}
            >
              {QUADRANT.healthyFall.title}
            </text>
            <text x={PAD.left + PLOT_W} y={y(0) - 4} textAnchor="end" fontSize={10} fill="var(--muted-foreground)">
              estables
            </text>
            <text x={x(HEALTHY_CUT) + 4} y={PAD.top + 10} fontSize={10} fill="var(--muted-foreground)">
              score {HEALTHY_CUT}
            </text>
          </g>

          {/* La estela solo de la empresa señalada: seis meses, del más viejo al de hoy. */}
          {active && active.trail.length > 1 ? (
            <g stroke={TONE[active.direction]}>
              <polyline
                points={active.trail
                  .map((point) => `${x(point.score)},${y(point.trend3m)}`)
                  .join(" ")}
                fill="none"
                strokeWidth={1.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={0.6}
              />
              {active.trail.slice(0, -1).map((point) => (
                <circle
                  key={point.month}
                  cx={x(point.score)}
                  cy={y(point.trend3m)}
                  r={2}
                  fill="var(--card)"
                  strokeWidth={1.25}
                />
              ))}
            </g>
          ) : null}

          {/* Las hot: color de su trayectoria y el número que tienen en la lista de al lado.
              Las añadidas a mano por "Buscar empresa" llevan el mismo color pero sin número. */}
          {marked.map((row) => (
            <g
              key={row.company.id}
              style={{
                transform: `translate(${markedX.get(row.company.id) ?? x(row.score)}px, ${y(row.trend3m!)}px)`,
              }}
              className="transition-transform duration-500 ease-out"
            >
              <circle
                r={HOT_R}
                fill={TONE[row.direction]}
                stroke="var(--card)"
                strokeWidth={2}
              />
              {row.hot ? (
                <text
                  y={3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="var(--card)"
                  className="tabular-nums"
                >
                  {row.hot.rank}
                </text>
              ) : null}
            </g>
          ))}
        </svg>

        {marked.map((row) => (
          <button
            key={row.company.id}
            type="button"
            aria-label={`${row.company.id}: score ${formatScore(row.score)}, ${formatSigned(row.trend3m!)} en tres meses, ${ACCION[row.action].label}`}
            onMouseEnter={() => hover(row.company.id)}
            onFocus={() => hover(row.company.id)}
            onBlur={() => hover(null)}
            onClick={() => onOpenCompany(row.company.id)}
            className="focus-visible:ring-ring absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top] duration-500 ease-out focus-visible:ring-2 focus-visible:outline-none"
            style={{
              left: `${((markedX.get(row.company.id) ?? x(row.score)) / W) * 100}%`,
              top: `${(y(row.trend3m!) / H) * 100}%`,
            }}
          />
        ))}

        {active ? (
          <div
            role="tooltip"
            className={cn(
              "bg-popover text-popover-foreground pointer-events-none absolute top-3 z-10 w-max max-w-56 rounded-md border px-2.5 py-2 text-xs shadow-sm",
              active.score < 50 ? "right-3" : "left-3",
            )}
          >
            <p className="flex items-center gap-2">
              <span className="font-mono font-medium">{active.company.id}</span>
              <ActionBadge action={active.action} changed={active.changed} />
            </p>
            <p className="text-muted-foreground mt-0.5 tabular-nums">
              Score {formatScore(active.score)} · {formatSigned(active.trend3m!)} en 3 m
            </p>
            {active.hot?.driver ? (
              <p className="text-muted-foreground tabular-nums">
                {active.hot.driver} {formatSigned(active.hot.driverDelta)}
              </p>
            ) : null}
            {active.trail.length > 1 ? (
              <p className="text-muted-foreground">
                Estela desde {formatMonthShort(active.trail[0]!.month)}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <ul className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs">
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ background: TONE.mejora }}
          />
          Hot que mejora
        </li>
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2.5 rounded-full"
            style={{ background: TONE.deterioro }}
          />
          Hot que cae
        </li>
        <li className="ml-auto hidden sm:list-item">
          El número es su puesto en la lista; pasa por encima para ver seis meses.
        </li>
      </ul>

      <CompanyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        month={month}
        title="Buscar empresa"
        chosen={[...hotIds, ...pinnedIds]}
        onPick={(companyId) => {
          setPickerOpen(false);
          setPinnedIds((prev) => (prev.includes(companyId) ? prev : [...prev, companyId]));
          hover(companyId);
        }}
      />
    </Panel>
  );
}
