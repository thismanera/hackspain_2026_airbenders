"use client";

import { Pause, RotateCw } from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { Panel } from "@/components/grifo/panel";
import { StatusBadge } from "@/components/grifo/status-badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import { peerLabel } from "@/lib/features/portfolio/peers";
import {
  AXIS_TIPS,
  CUBE_EDGES,
  byDepth,
  depthCue,
  project,
  toScreen,
  type Projected,
} from "@/lib/features/portfolio/projection";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";
import type { Estado, PeerMapResponse, PeerPoint, Vec3 } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

import { SERIES } from "./series";

// 720×440 y el cubo a 135 px por unidad: con la inclinación por defecto cabe
// entero y, acotado a 640 px de ancho, el panel entra en un portátil sin scroll.
const W = 720;
const H = 440;
const VIEW = { cx: 360, cy: 210, scale: 135 };

/** Los cuatro estados, mismos tokens que el resto del panel. */
const TONE = {
  sana: "var(--status-healthy)",
  vigilar: "var(--status-watch)",
  riesgo: "var(--status-risk)",
  sin_datos: "var(--status-none)",
} satisfies Record<Estado, string>;

const INITIAL_VIEW = { yaw: 0.6, pitch: 0.35 };
const DRAG_SENSITIVITY = 0.008;
const DRAG_THRESHOLD_PX = 4;
const MAX_PITCH = 1.25;
const SPIN_RAD_PER_S = 0.15;
const FRAME_MS = 33;
const HINT_MS = 2000;

type PeerSpaceProps = {
  data: PeerMapResponse;
  /** Partner: todas con nombre y se eligen hasta tres. Empresa: solo ella, sin selección. */
  scope: "partner" | "embat";
  selected?: string[];
  onToggle?: (companyId: string) => void;
  /** Empresa que consulta: anillo y estela siempre visibles. */
  focus?: string;
  title: string;
  description?: string;
  /** Controles extra junto al botón de giro (p. ej. "Ver el año"). */
  aside?: ReactNode;
  caption?: ReactNode;
  className?: string;
};

type Placed = { point: PeerPoint } & Projected & { sx: number; sy: number };

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Tramos consecutivos con dato: la estela no cruza los meses en blanco. */
function trailRuns(trail: readonly (Vec3 | null)[]): { index: number; pos: Vec3 }[][] {
  const runs: { index: number; pos: Vec3 }[][] = [];
  let current: { index: number; pos: Vec3 }[] = [];
  trail.forEach((pos, index) => {
    if (pos === null) {
      if (current.length > 0) runs.push(current);
      current = [];
      return;
    }
    current.push({ index, pos });
  });
  if (current.length > 0) runs.push(current);
  return runs;
}

function axisCaption(axis: PeerMapResponse["axes"][number]): string {
  const lead = axis.top[0];
  const label = lead ? peerLabel(lead.indicator) : undefined;
  const direction = lead && label ? (lead.loading >= 0 ? label.above : label.below) : "";
  return `${direction} · ${Math.round(axis.explained * 100)} %`;
}

export function PeerSpace({
  data,
  scope,
  selected = [],
  onToggle,
  focus,
  title,
  description,
  aside,
  caption,
  className,
}: PeerSpaceProps) {
  const [view, setView] = useState(INITIAL_VIEW);
  const [spinning, setSpinning] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const dragRef = useRef<{
    id: number;
    x0: number;
    y0: number;
    yaw0: number;
    pitch0: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);

  // Auto-giro: un setState por frame de ~33 ms. Se para al arrastrar y al pasar
  // por encima de un punto; el botón lo dice siempre (DESIGN: sin media query,
  // control visible).
  useEffect(() => {
    if (!spinning || hovered !== null) return;
    let raf = 0;
    let last = performance.now();
    let accumulated = 0;
    const tick = (now: number) => {
      accumulated += now - last;
      last = now;
      if (!dragRef.current && accumulated >= FRAME_MS) {
        const seconds = accumulated / 1000;
        accumulated = 0;
        setView((current) => ({ ...current, yaw: current.yaw + SPIN_RAD_PER_S * seconds }));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spinning, hovered]);

  useEffect(() => {
    if (!hint) return;
    const timer = window.setTimeout(() => setHint(null), HINT_MS);
    return () => window.clearTimeout(timer);
  }, [hint]);

  const clusterById = useMemo(
    () => new Map(data.clusters.map((cluster) => [cluster.id, cluster])),
    [data.clusters],
  );

  const scene = useMemo(() => {
    const { yaw, pitch } = view;
    const placed: Placed[] = [];
    for (const point of data.points) {
      if (!point.pos) continue;
      const projected = project(point.pos, yaw, pitch);
      placed.push({ point, ...projected, ...toScreen(projected, VIEW) });
    }
    const edges = CUBE_EDGES.map(([a, b]) => {
      const pa = project(a, yaw, pitch);
      const pb = project(b, yaw, pitch);
      return { a: toScreen(pa, VIEW), b: toScreen(pb, VIEW), depth: (pa.depth + pb.depth) / 2 };
    });
    const tips = AXIS_TIPS.map((tip) => {
      const projected = project(tip, yaw, pitch);
      return { ...toScreen(projected, VIEW), depth: projected.depth };
    });
    return { placed: byDepth(placed), edges, tips };
  }, [data.points, view]);

  const visibleTrails = useMemo(() => {
    const ids = new Set<string>(selected);
    if (focus) ids.add(focus);
    if (hovered) ids.add(hovered);
    return data.points.filter((point) => point.company !== null && ids.has(point.company));
  }, [data.points, selected, focus, hovered]);

  const seriesOf = (companyId: string | null): string | null => {
    if (companyId === null) return null;
    const index = selected.indexOf(companyId);
    return index === -1 ? null : SERIES[index];
  };

  const dimmed = (point: PeerPoint) =>
    activeCluster !== null && point.cluster !== activeCluster ? 0.2 : 1;

  const interactive = (point: PeerPoint) =>
    point.company !== null && (scope === "partner" || point.company === focus);

  const handleClick = (companyId: string) => {
    if (suppressClickRef.current || !onToggle) return;
    if (selected.includes(companyId)) {
      onToggle(companyId);
      return;
    }
    if (selected.length >= COMPARE_SLOTS) {
      setHint("Quita una para añadir otra: se comparan tres como mucho.");
      return;
    }
    onToggle(companyId);
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      id: event.pointerId,
      x0: event.clientX,
      y0: event.clientY,
      yaw0: view.yaw,
      pitch0: view.pitch,
      moved: false,
    };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.x0;
    const dy = event.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      // Quien arrastra toma el mando: el giro automático no le quita el ángulo.
      setSpinning(false);
    }
    setView({
      yaw: drag.yaw0 + dx * DRAG_SENSITIVITY,
      pitch: clamp(drag.pitch0 + dy * DRAG_SENSITIVITY, -MAX_PITCH, MAX_PITCH),
    });
  };

  const onPointerEnd = () => {
    if (dragRef.current?.moved) {
      suppressClickRef.current = true;
      requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    }
    dragRef.current = null;
  };

  const active = hovered ? data.points.find((point) => point.company === hovered) : undefined;
  const activePlaced = active ? scene.placed.find((entry) => entry.point === active) : undefined;
  const firstMonth = data.months[0];
  const trailLabel = data.months.length > 1 ? `desde ${formatMonthShort(firstMonth)}` : "";

  return (
    <Panel
      title={title}
      description={description}
      className={cn("flex flex-col", className)}
      bodyClassName="flex flex-1 flex-col gap-3 p-3"
      aside={
        <div className="flex items-center gap-2">
          {aside}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSpinning((current) => !current)}
            aria-pressed={spinning}
          >
            {spinning ? (
              <Pause aria-hidden className="size-3.5" />
            ) : (
              <RotateCw aria-hidden className="size-3.5" />
            )}
            {spinning ? "Pausar" : "Girar"}
          </Button>
        </div>
      }
    >
      <div
        className="relative mx-auto w-full max-w-[640px] cursor-grab touch-none select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-auto w-full overflow-visible">
          {/* Aristas del cubo: las de atrás más tenues, para que se lea el volumen. */}
          {scene.edges.map((edge, index) => (
            <line
              key={index}
              x1={edge.a.sx}
              y1={edge.a.sy}
              x2={edge.b.sx}
              y2={edge.b.sy}
              stroke="var(--border)"
              strokeWidth={1}
              opacity={edge.depth < 0 ? 0.5 : 1}
            />
          ))}

          {/* Estelas: solo las que importan ahora mismo, de tenue (antiguo) a firme (hoy). */}
          {visibleTrails.map((point) => {
            const color = seriesOf(point.company) ?? "var(--foreground)";
            const total = Math.max(1, point.trail.length - 1);
            return (
              <g key={`trail-${point.key}`} opacity={dimmed(point)}>
                {trailRuns(point.trail).map((run, runIndex) => {
                  const screen = run.map((entry) => {
                    const projected = project(entry.pos, view.yaw, view.pitch);
                    return { ...toScreen(projected, VIEW), index: entry.index };
                  });
                  return (
                    <g key={runIndex}>
                      {screen.slice(1).map((to, i) => {
                        const from = screen[i];
                        const t = to.index / total;
                        return (
                          <line
                            key={to.index}
                            x1={from.sx}
                            y1={from.sy}
                            x2={to.sx}
                            y2={to.sy}
                            stroke={color}
                            strokeWidth={1.25}
                            strokeLinecap="round"
                            opacity={0.15 + 0.65 * t}
                          />
                        );
                      })}
                      {screen.slice(0, -1).map((entry) => (
                        <circle
                          key={`dot-${entry.index}`}
                          cx={entry.sx}
                          cy={entry.sy}
                          r={1.5}
                          fill={color}
                          opacity={0.2 + 0.6 * (entry.index / total)}
                        />
                      ))}
                    </g>
                  );
                })}
              </g>
            );
          })}

          {/* Puntos, de lejos a cerca. */}
          {scene.placed.map(({ point, sx, sy, depth }) => {
            const cue = depthCue(depth);
            const anonymous = point.company === null;
            const series = seriesOf(point.company);
            const ringed = series !== null || (focus !== undefined && point.company === focus);
            const labelled = ringed || point.company === hovered;
            return (
              <g
                key={point.key}
                opacity={dimmed(point)}
                className="transition-opacity duration-150"
              >
                {ringed ? (
                  <circle
                    cx={sx}
                    cy={sy}
                    r={cue.r + 4}
                    fill="none"
                    stroke={series ?? "var(--foreground)"}
                    strokeWidth={2}
                  />
                ) : null}
                <circle
                  cx={sx}
                  cy={sy}
                  r={anonymous ? cue.r * 0.8 : cue.r}
                  fill={TONE[point.estado]}
                  stroke={anonymous ? "none" : "var(--card)"}
                  strokeWidth={1.5}
                  opacity={anonymous ? 0.35 * cue.opacity : cue.opacity}
                />
                {labelled && point.company ? (
                  <text
                    x={sx + cue.r + 7}
                    y={sy + 4}
                    fontSize={11}
                    fontFamily="var(--font-mono)"
                    fill="var(--foreground)"
                  >
                    {point.company}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Rótulos en el extremo positivo de cada eje. */}
          {scene.tips.map((tip, axis) => (
            <text
              key={axis}
              x={tip.sx}
              y={tip.sy}
              fontSize={11}
              textAnchor="middle"
              fill="var(--muted-foreground)"
              opacity={tip.depth < -0.6 ? 0.5 : 1}
            >
              {axisCaption(data.axes[axis])}
            </text>
          ))}
        </svg>

        {scene.placed
          .filter(({ point }) => interactive(point))
          .map(({ point, sx, sy }) => {
            const cluster = point.cluster !== null ? clusterById.get(point.cluster) : undefined;
            return (
              <button
                key={point.key}
                type="button"
                aria-label={[
                  point.company,
                  point.score !== null ? `score ${formatScore(point.score)}` : null,
                  ESTADO[point.estado].label,
                  cluster ? `grupo «${cluster.label}»` : null,
                  onToggle
                    ? selected.includes(point.company!)
                      ? "en la comparación, pulsa para quitarla"
                      : "pulsa para comparar"
                    : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                aria-pressed={onToggle ? selected.includes(point.company!) : undefined}
                onMouseEnter={() => setHovered(point.company)}
                onFocus={() => setHovered(point.company)}
                onBlur={() => setHovered(null)}
                onClick={() => handleClick(point.company!)}
                className="focus-visible:ring-ring absolute size-6 -translate-x-1/2 -translate-y-1/2 rounded-full focus-visible:ring-2 focus-visible:outline-none"
                style={{ left: `${(sx / W) * 100}%`, top: `${(sy / H) * 100}%` }}
              />
            );
          })}

        {active && activePlaced ? (
          <div
            role="tooltip"
            className={cn(
              "bg-popover text-popover-foreground pointer-events-none absolute top-3 z-10 w-max max-w-64 rounded-md border px-2.5 py-2 text-xs",
              activePlaced.sx < W / 2 ? "right-3" : "left-3",
            )}
          >
            <p className="flex items-center gap-2">
              <span className="font-mono font-medium">{active.company}</span>
              <StatusBadge estado={active.estado} size="sm" />
            </p>
            {active.score !== null ? (
              <p className="text-muted-foreground mt-0.5 tabular-nums">
                Score {formatScore(active.score)}
                {active.deltaTrail !== null
                  ? ` · ${formatSigned(active.deltaTrail)} ${trailLabel}`
                  : ""}
              </p>
            ) : null}
            {active.cluster !== null && clusterById.get(active.cluster) ? (
              <p className="text-muted-foreground">
                Grupo «{clusterById.get(active.cluster)!.label}»
              </p>
            ) : null}
          </div>
        ) : null}

        {hint ? (
          <output
            aria-live="polite"
            className="bg-popover text-popover-foreground absolute bottom-3 left-1/2 -translate-x-1/2 rounded-md border px-2.5 py-1.5 text-xs"
          >
            {hint}
          </output>
        ) : null}
      </div>

      <ul className="flex flex-wrap gap-1.5 text-xs" aria-label="Grupos de empresas parecidas">
        {data.clusters.map((cluster) => {
          const isActive = activeCluster === cluster.id;
          return (
            <li key={cluster.id}>
              <button
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveCluster(isActive ? null : cluster.id)}
                className={cn(
                  "hover:border-foreground/30 focus-visible:ring-ring inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none",
                  isActive && "bg-secondary border-foreground/40",
                  activeCluster !== null && !isActive && "opacity-60",
                )}
              >
                <span>{cluster.label}</span>
                <span className="text-muted-foreground tabular-nums">
                  {cluster.size}
                  {cluster.medianScore !== null ? ` · ${formatScore(cluster.medianScore)}` : ""}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <dl className="text-muted-foreground grid gap-x-4 gap-y-0.5 text-xs sm:grid-cols-3">
        {data.axes.map((axis, index) => (
          <div key={index} className="flex gap-1.5">
            <dt className="shrink-0">Eje {index + 1}</dt>
            <dd className="min-w-0">
              {Math.round(axis.explained * 100)} % ·{" "}
              {axis.top
                .map((entry) => {
                  const label = peerLabel(entry.indicator);
                  return label ? (entry.loading >= 0 ? label.above : label.below) : entry.indicator;
                })
                .join(", ")}
            </dd>
          </div>
        ))}
      </dl>

      {caption ? <p className="text-sm text-pretty">{caption}</p> : null}
    </Panel>
  );
}
