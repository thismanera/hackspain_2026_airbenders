"use client";

import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, XAxis, YAxis } from "recharts";

import { ACTION_ICON } from "@/components/grifo/action-badge";
import { Panel } from "@/components/grifo/panel";
import { STATUS_ICON } from "@/components/grifo/status-badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatMonthTick, formatPercent } from "@/lib/features/portfolio/format";
import type { PortfolioSearchState } from "@/lib/features/portfolio/search-params";
import type { Accion, Estado, PortfolioSummary } from "@/lib/features/portfolio/types";
import { ACCION, ESTADO } from "@/lib/features/portfolio/vocabulary";

/** Peor primero, igual que la tabla: la barra y la lista cuentan la misma historia. */
const ESTADOS: Estado[] = ["riesgo", "vigilar", "sana", "sin_datos"];

const estadoConfig = {
  riesgo: { label: ESTADO.riesgo.label, color: "var(--status-risk)" },
  vigilar: { label: ESTADO.vigilar.label, color: "var(--status-watch)" },
  sana: { label: ESTADO.sana.label, color: "var(--status-healthy)" },
  sin_datos: { label: ESTADO.sin_datos.label, color: "var(--status-none)" },
} satisfies ChartConfig;

const ESTADO_TEXT = {
  riesgo: "text-status-risk-fg",
  vigilar: "text-status-watch-fg",
  sana: "text-status-healthy-fg",
  sin_datos: "text-status-none-fg",
} satisfies Record<Estado, string>;

/**
 * Cómo se ha repartido la cartera entre estados, mes a mes. Las barras apiladas
 * suman siempre el total de empresas valoradas, así que el ojo lee a la vez
 * cuánto riesgo hay y cuánto ha crecido. La leyenda es el filtro de estado.
 */
export function EstadoEvolution({
  history,
  filters,
  onChange,
}: {
  history: PortfolioSummary[];
  filters: PortfolioSearchState;
  onChange: (update: Partial<PortfolioSearchState>) => void;
}) {
  const data = history.map((s) => ({ month: s.month, ...s.byEstado }));
  const current = history[history.length - 1];
  const total = current.total || 1;

  return (
    <Panel
      title="Evolución de la cartera"
      description={`Empresas por estado, ${formatMonthShort(history[0].month)} – ${formatMonthShort(current.month)}. Pulsa un estado para filtrar la tabla.`}
      className="lg:col-span-2"
    >
      <ul className="-mx-2 mb-3 flex flex-wrap gap-1">
        {ESTADOS.map((estado) => {
          const selected = filters.estado === estado;
          const Icon = STATUS_ICON[estado];
          return (
            <li key={estado}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => onChange({ estado: selected ? "todos" : estado })}
                title={ESTADO[estado].description}
                className={cn(
                  "focus-visible:ring-ring flex h-8 items-center gap-1.5 rounded-md px-2 text-xs transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none",
                  selected ? "bg-secondary font-medium" : "hover:bg-secondary/60",
                )}
              >
                <Icon aria-hidden className={cn("size-3.5", ESTADO_TEXT[estado])} />
                <span className="text-muted-foreground">{ESTADO[estado].label}</span>
                <span className="font-medium tabular-nums">{current.byEstado[estado]}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <ChartContainer config={estadoConfig} className="aspect-auto h-56 w-full">
        <BarChart
          data={data}
          margin={{ top: 4, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="28%"
        >
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <XAxis
            dataKey="month"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={16}
            tickFormatter={formatMonthTick}
          />
          <YAxis
            allowDecimals={false}
            tickLine={false}
            axisLine={false}
            tickMargin={4}
            width={28}
          />
          <ChartTooltip
            cursor={{ fill: "var(--muted)" }}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => formatMonthShort(String(value))}
                indicator="dot"
              />
            }
          />
          {[...ESTADOS].reverse().map((estado, index, all) => (
            <Bar
              key={estado}
              dataKey={estado}
              stackId="estado"
              fill={`var(--color-${estado})`}
              radius={index === all.length - 1 ? [3, 3, 0, 0] : 0}
              isAnimationActive={false}
            />
          ))}
        </BarChart>
      </ChartContainer>

      <p className="text-muted-foreground mt-2 text-xs text-pretty">
        En {formatMonthShort(current.month)},{" "}
        <span className="text-foreground tabular-nums">
          {formatPercent(current.byEstado.riesgo / total, 0)}
        </span>{" "}
        de la cartera está en riesgo y{" "}
        <span className="text-foreground tabular-nums">
          {formatPercent(current.byEstado.sana / total, 0)}
        </span>{" "}
        se considera sana.
      </p>
    </Panel>
  );
}

/** Solo las acciones que son noticia; "mantener" no se dibuja porque no mueve nada. */
const ACCIONES = ["cerrar", "reducir", "ampliar", "abrir"] as const satisfies readonly Accion[];

const accionConfig = {
  cerrar: { label: ACCION.cerrar.label, color: "var(--status-risk)" },
  reducir: { label: ACCION.reducir.label, color: "var(--status-watch)" },
  ampliar: { label: ACCION.ampliar.label, color: "var(--status-healthy)" },
  abrir: { label: ACCION.abrir.label, color: "var(--chart-3)" },
} satisfies ChartConfig;

const ACCION_TEXT = {
  cerrar: "text-status-risk-fg",
  reducir: "text-status-watch-fg",
  ampliar: "text-status-healthy-fg",
  abrir: "text-status-healthy-fg",
} satisfies Record<(typeof ACCIONES)[number], string>;

/**
 * Qué toca hacer este mes, en un anillo con el total en el centro y la lista al
 * lado. Cada fila de la lista es el filtro de acción de la tabla.
 */
export function AccionBreakdown({
  summary,
  filters,
  onChange,
}: {
  summary: PortfolioSummary;
  filters: PortfolioSearchState;
  onChange: (update: Partial<PortfolioSearchState>) => void;
}) {
  const data = ACCIONES.map((accion) => ({ accion, value: summary.byAccion[accion] })).filter(
    (d) => d.value > 0,
  );
  const empty = data.length === 0;

  return (
    <Panel
      title="Acciones del mes"
      description="Qué cambia respecto al mes pasado, y en cuántas empresas."
      className="flex flex-col"
      bodyClassName="flex flex-1 flex-col justify-center gap-5 sm:flex-row sm:items-center lg:flex-col lg:items-stretch"
    >
      <div className="relative mx-auto size-40 shrink-0">
        <ChartContainer config={accionConfig} className="aspect-square size-40">
          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
            {!empty ? (
              <ChartTooltip content={<ChartTooltipContent nameKey="accion" hideLabel />} />
            ) : null}
            <Pie
              data={empty ? [{ accion: "none", value: 1 }] : data}
              dataKey="value"
              nameKey="accion"
              innerRadius={56}
              outerRadius={76}
              paddingAngle={empty ? 0 : 2}
              cornerRadius={3}
              startAngle={90}
              endAngle={-270}
              stroke="none"
              isAnimationActive={false}
            >
              {(empty ? [{ accion: "none" }] : data).map((entry) => (
                <Cell
                  key={entry.accion}
                  fill={entry.accion === "none" ? "var(--muted)" : `var(--color-${entry.accion})`}
                />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
            {summary.moved}
          </span>
          <span className="text-muted-foreground mt-1 text-xs">
            {summary.moved === 1 ? "empresa" : "empresas"}
          </span>
        </div>
      </div>

      <ul className="flex-1 divide-y">
        {ACCIONES.map((accion) => {
          const count = summary.byAccion[accion];
          const selected = filters.accion === accion;
          const Icon = ACTION_ICON[accion];
          return (
            <li key={accion}>
              <button
                type="button"
                aria-pressed={selected}
                disabled={count === 0 && !selected}
                onClick={() => onChange({ accion: selected ? "todas" : accion })}
                title={ACCION[accion].description}
                className={cn(
                  "focus-visible:ring-ring -mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-2 text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none disabled:opacity-50",
                  selected ? "bg-secondary" : "enabled:hover:bg-secondary/60",
                )}
              >
                <span
                  aria-hidden
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: accionConfig[accion].color }}
                />
                <Icon aria-hidden className={cn("size-3.5 shrink-0", ACCION_TEXT[accion])} />
                <span className={cn("flex-1 text-left", selected && "font-medium")}>
                  {ACCION[accion].label}
                </span>
                <span className="font-medium tabular-nums">{count}</span>
                <span className="text-muted-foreground w-9 text-right text-xs tabular-nums">
                  {summary.moved > 0 ? formatPercent(count / summary.moved, 0) : "—"}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
