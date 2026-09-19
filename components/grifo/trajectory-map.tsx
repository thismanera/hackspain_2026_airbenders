"use client";

import { Pause, Play } from "lucide-react";
import { useState } from "react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { Panel } from "@/components/grifo/panel";
import { useMonthPlayer } from "@/components/grifo/use-month-player";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatScore, formatSigned } from "@/lib/features/portfolio/format";
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

const TONE = {
  mejora: "var(--status-healthy)",
  deterioro: "var(--status-risk)",
  estable: "var(--status-none)",
} satisfies Record<PortfolioListRow["direction"], string>;

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
  months,
  onOpenCompany,
  className,
}: {
  rows: PortfolioListRow[];
  months: string[];
  onOpenCompany: (companyId: string) => void;
  className?: string;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const { playing, toggle } = useMonthPlayer(months);

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

  const hot = plotted.filter((row) => row.hot !== null);
  const hotX = spread(
    hot.map((row) => ({ id: row.company.id, x: x(row.score), y: y(row.trend3m!) })),
  );
  const active = hovered ? plotted.find((row) => row.company.id === hovered) : undefined;

  return (
    <Panel
      title="Hoy y hacia dónde va"
      description="Derecha: mejor score hoy. Arriba: mejora en tres meses."
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
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-auto w-full overflow-visible">
          {/* Franja estable en el centro y la línea de "sana" a la derecha. */}
          <rect
            x={PAD.left}
            y={y(TREND_CUT)}
            width={PLOT_W}
            height={y(-TREND_CUT) - y(TREND_CUT)}
            fill="var(--muted)"
            opacity={0.6}
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

          {/* Las cuatro esquinas dicen qué significa estar ahí. */}
          <g fill="var(--muted-foreground)" fontSize={11}>
            <text x={PAD.left} y={PAD.top - 10}>
              Débiles que mejoran
            </text>
            <text x={PAD.left + PLOT_W} y={PAD.top - 10} textAnchor="end">
              Sanas que mejoran
            </text>
            <text x={PAD.left} y={H - 8}>
              Débiles que caen
            </text>
            <text x={PAD.left + PLOT_W} y={H - 8} textAnchor="end">
              Sanas que caen
            </text>
            <text x={PAD.left + PLOT_W} y={y(0) - 4} textAnchor="end" fontSize={10}>
              estables
            </text>
            <text x={x(HEALTHY_CUT) + 4} y={PAD.top + 10} fontSize={10}>
              score {HEALTHY_CUT}
            </text>
          </g>

          {/* La estela solo de la empresa señalada: seis meses, del más viejo al de hoy. */}
          {active && active.trail.length > 1 ? (
            <g stroke={active.hot ? TONE[active.direction] : "var(--foreground)"}>
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

          {/* El resto de la cartera, en gris: contexto, no protagonista. */}
          {plotted
            .filter((row) => row.hot === null)
            .map((row) => (
              <circle
                key={row.company.id}
                cx={x(row.score)}
                cy={y(row.trend3m!)}
                r={hovered === row.company.id ? 5 : 3.5}
                fill={hovered === row.company.id ? "var(--foreground)" : "var(--status-none)"}
                stroke="var(--card)"
                strokeWidth={1.5}
                className="transition-[cx,cy] duration-500 ease-out"
              />
            ))}

          {/* Las hot: color de su trayectoria y el número que tienen en la lista de al lado. */}
          {hot.map((row) => (
            <g
              key={row.company.id}
              style={{
                transform: `translate(${hotX.get(row.company.id) ?? x(row.score)}px, ${y(row.trend3m!)}px)`,
              }}
              className="transition-transform duration-500 ease-out"
            >
              <circle r={HOT_R} fill={TONE[row.direction]} stroke="var(--card)" strokeWidth={1.5} />
              <text
                y={3.5}
                textAnchor="middle"
                fontSize={10}
                fontWeight={600}
                fill="var(--card)"
                className="tabular-nums"
              >
                {row.hot!.rank}
              </text>
            </g>
          ))}
        </svg>

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
            style={{ background: TONE.deterioro }}
          />
          Hot que cae
        </li>
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
            className="inline-block size-2 rounded-full"
            style={{ background: TONE.estable }}
          />
          Resto de la cartera
        </li>
        <li className="ml-auto">
          El número es su puesto en la lista; pasa por encima para ver seis meses.
        </li>
      </ul>
    </Panel>
  );
}
