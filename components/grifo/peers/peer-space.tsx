"use client";

import { Pause, RotateCw, Scan, ZoomIn, ZoomOut } from "lucide-react";
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

// 720×460 y el cubo a 150 px por unidad: con la inclinación por defecto cabe
// entero. El ancho real lo fija la altura de la ventana (ver el wrapper), así
// que llena lo que haya sin desbordar.
const W = 720;
const H = 460;
const VIEW = { cx: 360, cy: 220, scale: 150 };

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
const MIN_ZOOM = 0.6;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;
/** Cuánto zoom por unidad de rueda; exponencial para que sea simétrico. */
const WHEEL_ZOOM = 0.0015;

type Camera = { zoom: number; panX: number; panY: number };
const INITIAL_CAMERA: Camera = { zoom: 1, panX: 0, panY: 0 };

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
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  const [spinning, setSpinning] = useState(true);
  const [hovered, setHovered] = useState<string | null>(null);
  const [activeCluster, setActiveCluster] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const dragRef = useRef<{
    id: number;
    mode: "rotate" | "pan";
    x0: number;
    y0: number;
    yaw0: number;
    pitch0: number;
    panX0: number;
    panY0: number;
    moved: boolean;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Cámara: el centro se desplaza con el pan y la escala con el zoom.
  const screenView = useMemo(
    () => ({
      cx: VIEW.cx + camera.panX,
      cy: VIEW.cy + camera.panY,
      scale: VIEW.scale * camera.zoom,
    }),
    [camera],
  );

  /** Zoom manteniendo fijo el punto (px, py) del lienzo, en unidades del viewBox. */
  const zoomAt = (factor: number, px = VIEW.cx, py = VIEW.cy) => {
    setCamera((current) => {
      const zoom = clamp(current.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      const ratio = zoom / current.zoom;
      return {
        zoom,
        panX: px - VIEW.cx - (px - VIEW.cx - current.panX) * ratio,
        panY: py - VIEW.cy - (py - VIEW.cy - current.panY) * ratio,
      };
    });
  };

  const resetCamera = () => setCamera(INITIAL_CAMERA);

  // La rueda hace zoom hacia el cursor. Listener nativo no pasivo: el de React
  // no puede impedir que la página haga scroll a la vez.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const px = ((event.clientX - rect.left) / rect.width) * W;
      const py = ((event.clientY - rect.top) / rect.height) * H;
      zoomAt(Math.exp(-event.deltaY * WHEEL_ZOOM), px, py);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, []);

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
      placed.push({ point, ...projected, ...toScreen(projected, screenView) });
    }
    const edges = CUBE_EDGES.map(([a, b]) => {
      const pa = project(a, yaw, pitch);
      const pb = project(b, yaw, pitch);
      return {
        a: toScreen(pa, screenView),
        b: toScreen(pb, screenView),
        depth: (pa.depth + pb.depth) / 2,
      };
    });
    const tips = AXIS_TIPS.map((tip) => {
      const projected = project(tip, yaw, pitch);
      return { ...toScreen(projected, screenView), depth: projected.depth };
    });
    return { placed: byDepth(placed), edges, tips };
  }, [data.points, view, screenView]);

  /** Si el punto cae fuera del lienzo (con zoom), no recibe botón ni etiqueta. */
  const onCanvas = (sx: number, sy: number) => sx >= 0 && sx <= W && sy >= 0 && sy <= H;

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
    // Botón principal gira; con Shift, o con el botón central, desplaza.
    const pan = event.button === 1 || (event.button === 0 && event.shiftKey);
    if (event.button !== 0 && !pan) return;
    dragRef.current = {
      id: event.pointerId,
      mode: pan ? "pan" : "rotate",
      x0: event.clientX,
      y0: event.clientY,
      yaw0: view.yaw,
      pitch0: view.pitch,
      panX0: camera.panX,
      panY0: camera.panY,
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
      if (drag.mode === "rotate") setSpinning(false);
    }
    if (drag.mode === "pan") {
      // De píxeles de pantalla a unidades del viewBox.
      const ratio = W / event.currentTarget.getBoundingClientRect().width;
      setCamera((current) => ({
        ...current,
        panX: drag.panX0 + dx * ratio,
        panY: drag.panY0 + dy * ratio,
      }));
      return;
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          {aside}
          <fieldset className="flex items-center gap-1" aria-label="Zoom">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => zoomAt(1 / ZOOM_STEP)}
              disabled={camera.zoom <= MIN_ZOOM}
              aria-label="Alejar"
              title="Alejar (rueda del ratón)"
            >
              <ZoomOut aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() => zoomAt(ZOOM_STEP)}
              disabled={camera.zoom >= MAX_ZOOM}
              aria-label="Acercar"
              title="Acercar (rueda del ratón)"
            >
              <ZoomIn aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={resetCamera}
              disabled={camera.zoom === 1 && camera.panX === 0 && camera.panY === 0}
              aria-label="Encuadrar"
              title="Encuadrar (doble clic en el cubo)"
            >
              <Scan aria-hidden className="size-3.5" />
            </Button>
          </fieldset>
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
      {/* Tan ancho como permita la altura de la ventana (menos cabecera, intro y
          leyendas), nunca más que la columna. 720/460 = 1.565. */}
      <div
        ref={canvasRef}
        className="relative mx-auto w-full max-w-[min(100%,calc((100dvh_-_18rem)*1.565))] min-w-[min(100%,480px)] cursor-grab touch-none overflow-hidden rounded-lg select-none active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerEnd}
        onPointerCancel={onPointerEnd}
        onDoubleClick={(event) => {
          // Doble clic sobre un punto es "quitar y poner"; solo el fondo reencuadra.
          if ((event.target as HTMLElement).closest("button")) return;
          resetCamera();
        }}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.stopPropagation();
            event.preventDefault();
          }
        }}
        onMouseLeave={() => setHovered(null)}
      >
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="h-auto w-full overflow-hidden">
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
                    return { ...toScreen(projected, screenView), index: entry.index };
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
          .filter(({ point, sx, sy }) => interactive(point) && onCanvas(sx, sy))
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
