"use client";

import { Flame, Pause, Play } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useEffect, useState, useTransition } from "react";

import { Panel } from "@/components/grifo/panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { CALENDAR, LATEST_MONTH } from "@/lib/features/portfolio/calendar";
import { formatMonthShort, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { Accion, PortfolioRow } from "@/lib/features/portfolio/types";
import { ACCION } from "@/lib/features/portfolio/vocabulary";

const W = 720;
const H = 340;
const PAD = { top: 18, right: 14, bottom: 30, left: 40 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

/** Umbrales de SOURCE: 45 y 70 separan los estados; ±6 separa estable de movimiento. */
const SCORE_CUTS = [45, 70];
const TREND_CUT = 6;
const MIN_TREND_AXIS = 10;

const ACTION_COLOR = {
  abrir: "var(--status-healthy)",
  ampliar: "var(--status-healthy)",
  mantener: "var(--status-none)",
  reducir: "var(--status-watch)",
  cerrar: "var(--status-risk)",
} satisfies Record<Accion, string>;

const LEGEND: Accion[] = ["abrir", "ampliar", "reducir", "cerrar"];

/**
 * Misma regla que el badge: la tinta es para lo que cambia este mes; seguir
 * igual va en gris. Las hot llevan el color de su trayectoria, como el fuego.
 */
function colorOf(row: PortfolioRow): string {
  if (row.hot) {
    return row.direction === "deterioro" ? "var(--status-risk)" : "var(--status-healthy)";
  }
  return row.changed ? ACTION_COLOR[row.action] : ACTION_COLOR.mantener;
}

const monthParser = parseAsStringLiteral(CALENDAR).withDefault(LATEST_MONTH);
const PLAY_INTERVAL_MS = 1100;

function useMonthPlayer(months: string[]) {
  const [, startTransition] = useTransition();
  const [month, setMonth] = useQueryState(
    "mes",
    monthParser.withOptions({ shallow: false, startTransition }),
  );
  const [playing, setPlaying] = useState(false);
  const last = months[months.length - 1];

  useEffect(() => {
    if (!playing) return;
    const index = months.indexOf(month);
    if (index === -1 || index >= months.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      void setMonth(months[index + 1]!);
    }, PLAY_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [playing, month, months, setMonth]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // Al final del calendario, reproducir vuelve al principio de la estela.
    if (month === last) void setMonth(months[Math.max(0, months.length - 12)]!);
    setPlaying(true);
  };

  return { playing, toggle };
}

/**
 * Cada empresa es un punto: a la derecha cuanto más sana hoy, arriba cuanto más
 * mejora en 3 meses. La estela son sus últimos 6 meses. El color es la acción
 * del motor; las "hot" van grandes y con fuego, el resto apagadas. Sin leyenda
 * de cuadrantes: los umbrales del motor ya dividen el tablero.
 */
export function TrajectoryMap({
  rows,
  months,
  onOpenCompany,
  className,
}: {
  rows: PortfolioRow[];
  months: string[];
  onOpenCompany: (companyId: string) => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { playing, toggle } = useMonthPlayer(months);

  const plotted = rows.filter((row) => row.trend3m !== null);
  const anyHot = plotted.some((row) => row.hot !== null);
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

  const active = hovered ? plotted.find((row) => row.company.id === hovered) : undefined;

  return (
    <Panel
      title="Hoy y hacia dónde va"
      description="Cada punto es una empresa; la estela, sus últimos seis meses."
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col gap-2 p-3"
      aside={
        <Button
          variant="outline"
          size="sm"
          onClick={toggle}
          aria-pressed={playing}
          disabled={months.length < 2}
        >
          {playing ? (
            <Pause aria-hidden className="size-3.5" />
          ) : (
            <Play aria-hidden className="size-3.5" />
          )}
          {playing ? "Pausar" : "Ver el año"}
        </Button>
      }
    >
      <div className="relative" onMouseLeave={() => setHovered(null)}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          aria-hidden
          className="h-auto w-full overflow-visible text-xs"
        >
          {/* Umbrales del motor: dónde cambia el estado y dónde empieza a moverse. */}
          {SCORE_CUTS.map((cut) => (
            <line
              key={cut}
              x1={x(cut)}
              x2={x(cut)}
              y1={PAD.top}
              y2={PAD.top + PLOT_H}
              stroke="var(--border)"
            />
          ))}
          <line
            x1={PAD.left}
            x2={PAD.left + PLOT_W}
            y1={y(0)}
            y2={y(0)}
            stroke="var(--foreground)"
            strokeOpacity={0.35}
          />
          {[TREND_CUT, -TREND_CUT].map((cut) => (
            <line
              key={cut}
              x1={PAD.left}
              x2={PAD.left + PLOT_W}
              y1={y(cut)}
              y2={y(cut)}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
          ))}

          {/* Ejes: qué significa cada lado, en las palabras del reto. */}
          <g fill="var(--muted-foreground)" fontSize={10}>
            {[0, ...SCORE_CUTS, 100].map((tick) => (
              <text key={tick} x={x(tick)} y={H - 16} textAnchor="middle" className="tabular-nums">
                {tick}
              </text>
            ))}
            <text x={PAD.left} y={H - 3} textAnchor="start">
              Hoy débil
            </text>
            <text x={PAD.left + PLOT_W} y={H - 3} textAnchor="end">
              Hoy sana
            </text>
            {[trendAxis, TREND_CUT, 0, -TREND_CUT, -trendAxis].map((tick) => (
              <text
                key={tick}
                x={PAD.left - 6}
                y={y(tick) + 3.5}
                textAnchor="end"
                className="tabular-nums"
              >
                {tick > 0 ? `+${tick}` : tick}
              </text>
            ))}
            <text
              transform={`translate(10 ${PAD.top + 4}) rotate(-90)`}
              textAnchor="end"
              fontWeight={500}
            >
              Va a mejor
            </text>
            <text
              transform={`translate(10 ${PAD.top + PLOT_H - 4}) rotate(-90)`}
              textAnchor="start"
              fontWeight={500}
            >
              Va a peor
            </text>
          </g>

          {/* Estelas debajo, puntos encima: el hoy siempre tapa al ayer. */}
          {plotted.map((row) => {
            const dim = anyHot && row.hot === null && hovered !== row.company.id;
            return (
              <polyline
                key={row.company.id}
                points={row.trail.map((point) => `${x(point.score)},${y(point.trend3m)}`).join(" ")}
                fill="none"
                stroke={colorOf(row)}
                strokeWidth={1.25}
                strokeLinejoin="round"
                strokeLinecap="round"
                opacity={dim ? 0.18 : 0.45}
                className="transition-opacity duration-300"
              />
            );
          })}
          {plotted.map((row) => {
            const color = colorOf(row);
            const hot = row.hot !== null;
            const isHovered = hovered === row.company.id;
            const dim = anyHot && !hot && !isHovered;
            return (
              <g
                key={row.company.id}
                style={{ transform: `translate(${x(row.score)}px, ${y(row.trend3m!)}px)` }}
                className="transition-[transform,opacity] duration-500 ease-out"
                opacity={dim ? 0.45 : 1}
              >
                {hot || isHovered ? (
                  <circle r={hot ? 10 : 8} fill="none" stroke={color} strokeOpacity={0.4} />
                ) : null}
                <circle r={hot ? 6 : 4.5} fill={color} stroke="var(--card)" strokeWidth={1.5} />
                {hot ? (
                  <Flame x={5} y={-17} width={12} height={12} color={color} strokeWidth={2.5} />
                ) : null}
              </g>
            );
          })}
        </svg>

        {/* Los puntos que se tocan son botones de verdad, encima del dibujo: con
            teclado, con nombre y con la ficha a un clic. */}
        {plotted.map((row) => (
          <button
            key={row.company.id}
            type="button"
            aria-label={`${row.company.id}: score ${formatScore(row.score)}, ${formatSigned(row.trend3m!)} en tres meses, ${ACCION[row.action].label}`}
            onMouseEnter={() => setHovered(row.company.id)}
            onFocus={() => setHovered(row.company.id)}
            onBlur={() => setHovered(null)}
            onClick={() => onOpenCompany(row.company.id)}
            className="focus-visible:ring-ring absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full transition-[left,top] duration-500 ease-out focus-visible:ring-2 focus-visible:outline-none"
            style={{
              left: `${(x(row.score) / W) * 100}%`,
              top: `${(y(row.trend3m!) / H) * 100}%`,
            }}
          />
        ))}

        {active ? (
          <div
            role="tooltip"
            className="bg-popover text-popover-foreground pointer-events-none absolute z-10 w-max max-w-56 -translate-x-1/2 rounded-md border px-2.5 py-2 text-xs shadow-sm"
            style={{
              left: `${(x(active.score) / W) * 100}%`,
              top: `${(y(active.trend3m!) / H) * 100}%`,
              transform: `translate(-50%, ${active.trend3m! >= 0 ? "14px" : "calc(-100% - 14px)"})`,
            }}
          >
            <p className="flex items-center gap-2">
              <span className="font-mono font-medium">{active.company.id}</span>
              <span
                className="inline-block size-2 rounded-full"
                style={{ background: colorOf(active) }}
              />
              <span>
                {active.changed
                  ? ACCION[active.action].label
                  : active.action === "cerrar"
                    ? "Sin línea"
                    : "Sin cambio"}
              </span>
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

      <ul className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs">
        {LEGEND.map((action) => (
          <li key={action} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2 rounded-full"
              style={{ background: ACTION_COLOR[action] }}
            />
            {ACCION[action].label}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{ background: ACTION_COLOR.mantener }}
          />
          Sin cambio
        </li>
        {anyHot ? (
          <li className="flex items-center gap-1.5">
            <Flame aria-hidden className="size-3" strokeWidth={2.5} />
            Hot
          </li>
        ) : null}
      </ul>
    </Panel>
  );
}
