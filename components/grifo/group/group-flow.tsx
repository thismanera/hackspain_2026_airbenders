"use client";

import { Pause, Play } from "lucide-react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatPercent, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { Estado, GroupFileResponse, GroupMember } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

const WIDTH = 640;
const HEIGHT = 420;
const CENTER = { x: WIDTH / 2, y: HEIGHT / 2 };
const RADIUS_X = 230;
const RADIUS_Y = 150;
const NEUTRAL_BAND = 0.5;

type Sense = "support" | "drag" | "neutral";

function senseOf(member: GroupMember): Sense {
  if (member.adjustment >= NEUTRAL_BAND) return "support";
  if (member.adjustment <= -NEUTRAL_BAND) return "drag";
  return "neutral";
}

const SENSE_STROKE = {
  support: "var(--status-healthy)",
  drag: "var(--status-risk)",
  neutral: "var(--status-none)",
} satisfies Record<Sense, string>;

const SENSE_LABEL = {
  support: "el grupo la sostiene",
  drag: "el grupo la arrastra",
  neutral: "sin efecto apreciable",
} satisfies Record<Sense, string>;

const ESTADO_FILL = {
  sana: { fill: "var(--status-healthy-surface)", stroke: "var(--status-healthy)" },
  vigilar: { fill: "var(--status-watch-surface)", stroke: "var(--status-watch)" },
  riesgo: { fill: "var(--status-risk-surface)", stroke: "var(--status-risk)" },
  sin_datos: { fill: "var(--status-none-surface)", stroke: "var(--status-none)" },
} satisfies Record<Estado, { fill: string; stroke: string }>;

function nodeRadius(share: number): number {
  return 18 + Math.min(1, share) * 26;
}

function edgeWidth(interdependence: number): number {
  return 1.5 + Math.min(1, interdependence / 0.34) * 7;
}

function positionOf(index: number, total: number) {
  const angle = -Math.PI / 2 + (index / total) * Math.PI * 2;
  return {
    x: CENTER.x + Math.cos(angle) * RADIUS_X,
    y: CENTER.y + Math.sin(angle) * RADIUS_Y,
  };
}

/**
 * El grupo visto como red. SOURCE §1.7 no tiene matriz ni filiales: el "padre"
 * de cada empresa es el resto del grupo, así que el grafo es una estrella. Cada
 * arista es lo que el bloque D transmite: grosor por interdependencia (D5),
 * color y sentido por el ajuste en puntos, tamaño del nodo por peso (D1). No
 * son transferencias individuales; son las relaciones que el score ya usa.
 */
export function GroupFlow({
  group,
  month,
  onOpenCompany,
  className,
}: {
  group: GroupFileResponse;
  month: string;
  onOpenCompany: (companyId: string) => void;
  className?: string;
}) {
  const [moving, setMoving] = useState(false);
  const titleId = useId();
  const descId = useId();
  const markerId = useId();

  const members = group.members;
  const total = members.length;

  return (
    <section className={cn("bg-card rounded-xl border", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Cómo se transmite el efecto del grupo</h3>
          <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
            Tamaño = peso en el grupo (D1). Grosor = interdependencia (D5). Color = si el grupo
            sostiene o arrastra el score de cada empresa.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-pressed={moving}
          onClick={() => setMoving((value) => !value)}
          className="shrink-0 motion-reduce:hidden"
        >
          {moving ? <Pause aria-hidden /> : <Play aria-hidden />}
          {moving ? "Parar" : "Animar el flujo"}
        </Button>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        aria-labelledby={titleId}
        aria-describedby={descId}
        className="block w-full"
      >
        <title id={titleId}>Red del grupo {group.groupId}</title>
        <desc id={descId}>
          {members
            .map(
              (member) =>
                `${member.id}: ${ESTADO[member.estado].label}, score ${formatScore(member.score)}, peso ${formatPercent(member.share, 0)}, ajuste ${formatSigned(member.adjustment)} (${SENSE_LABEL[senseOf(member)]}).`,
            )
            .join(" ")}
        </desc>
        <defs>
          {(["support", "drag", "neutral"] as const).map((sense) => (
            <marker
              key={sense}
              id={`${markerId}-${sense}`}
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill={SENSE_STROKE[sense]} />
            </marker>
          ))}
        </defs>

        {members.map((member, index) => {
          const target = positionOf(index, total);
          const sense = senseOf(member);
          const r = nodeRadius(member.share);
          const dx = target.x - CENTER.x;
          const dy = target.y - CENTER.y;
          const length = Math.hypot(dx, dy) || 1;
          const start = { x: CENTER.x + (dx / length) * 40, y: CENTER.y + (dy / length) * 40 };
          const end = {
            x: target.x - (dx / length) * (r + 6),
            y: target.y - (dy / length) * (r + 6),
          };
          const mid = {
            x: (start.x + end.x) / 2 - dy * 0.12,
            y: (start.y + end.y) / 2 + dx * 0.12,
          };
          const labelAt = {
            x: 0.25 * start.x + 0.5 * mid.x + 0.25 * end.x,
            y: 0.25 * start.y + 0.5 * mid.y + 0.25 * end.y,
          };
          const label = formatSigned(member.adjustment);

          return (
            <g key={member.id}>
              <path
                d={`M ${start.x} ${start.y} Q ${mid.x} ${mid.y} ${end.x} ${end.y}`}
                fill="none"
                stroke={SENSE_STROKE[sense]}
                strokeWidth={edgeWidth(member.interdependence)}
                strokeLinecap="round"
                markerEnd={sense === "neutral" ? undefined : `url(#${markerId}-${sense})`}
                className="flow-edge"
                data-moving={moving && sense !== "neutral" ? "true" : "false"}
                data-sense={sense}
                opacity={sense === "neutral" ? 0.7 : 1}
              />
              {sense !== "neutral" ? (
                <g transform={`translate(${labelAt.x} ${labelAt.y})`}>
                  <rect
                    x={-(label.length * 3.6 + 8)}
                    y={-9}
                    width={label.length * 7.2 + 16}
                    height={18}
                    rx={9}
                    fill="var(--card)"
                    stroke="var(--border)"
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={11}
                    fontWeight={600}
                    fill={
                      sense === "support" ? "var(--status-healthy-fg)" : "var(--status-risk-fg)"
                    }
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {label}
                  </text>
                </g>
              ) : null}
            </g>
          );
        })}

        {/* El centro no es una empresa: es el resto del grupo, el "padre" de SOURCE §1.7. */}
        <g transform={`translate(${CENTER.x} ${CENTER.y})`}>
          <circle r={36} fill="var(--secondary)" stroke="var(--border)" />
          <text textAnchor="middle" y={-4} fontSize={10} fill="var(--muted-foreground)">
            Grupo
          </text>
          <text
            textAnchor="middle"
            y={12}
            fontSize={15}
            fontWeight={600}
            fill="var(--foreground)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {formatScore(group.score)}
          </text>
        </g>

        {members.map((member, index) => {
          const at = positionOf(index, total);
          const r = nodeRadius(member.share);
          const tone = ESTADO_FILL[member.estado];
          const short = member.id.replace(/^[A-Z]+_/, "");
          // La etiqueta va hacia fuera, lejos de la arista que entra por el otro lado.
          const ux = (at.x - CENTER.x) / RADIUS_X;
          const uy = (at.y - CENTER.y) / RADIUS_Y;
          const anchor = ux > 0.35 ? "start" : ux < -0.35 ? "end" : "middle";
          const lx = anchor === "middle" ? 0 : Math.sign(ux) * (r + 8);
          const ly =
            anchor === "middle" ? (uy < 0 ? -(r + 22) : r + 14) : uy < -0.5 ? -(r - 2) : uy > 0.5 ? r - 10 : -4;
          return (
            /* Enlace SVG real: abre la ficha en la hoja con clic simple y sigue
               siendo un enlace para el teclado, el clic central y la pestaña nueva. */
            <g key={member.id} transform={`translate(${at.x} ${at.y})`}>
              <a
                href={`/cartera/${member.id}?mes=${month}`}
                aria-label={`${member.id}, ${ESTADO[member.estado].label}, score ${formatScore(member.score)}. Abrir ficha`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                    return;
                  event.preventDefault();
                  onOpenCompany(member.id);
                }}
                className="focus-visible:outline-ring cursor-pointer outline-offset-2 focus-visible:outline-2 [&:hover_circle]:stroke-[3]"
              >
                <circle
                  r={r}
                  fill={tone.fill}
                  stroke={tone.stroke}
                  strokeWidth={2}
                  className="transition-[stroke-width] duration-150"
                />
                <text
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={r >= 30 ? 15 : 13}
                  fontWeight={600}
                  fill="var(--foreground)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {formatScore(member.score)}
                </text>
                <text
                  textAnchor={anchor}
                  x={lx}
                  y={ly}
                  fontSize={11}
                  fill="var(--muted-foreground)"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {short}
                </text>
                <text
                  textAnchor={anchor}
                  x={lx}
                  y={ly + 13}
                  fontSize={10}
                  fill="var(--muted-foreground)"
                >
                  {formatPercent(member.share, 0)} · {ESTADO[member.estado].label}
                </text>
              </a>
            </g>
          );
        })}
      </svg>

      <dl className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1 border-t px-4 py-2.5 text-xs">
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="bg-status-healthy inline-block h-0.5 w-4 rounded-full" />
          <dt className="sr-only">Verde</dt>
          <dd>Aval: el grupo suma puntos</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="bg-status-risk inline-block h-0.5 w-4 rounded-full" />
          <dt className="sr-only">Rojo</dt>
          <dd>Contagio: el grupo resta puntos</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <span aria-hidden className="bg-status-none inline-block h-0.5 w-4 rounded-full" />
          <dt className="sr-only">Gris</dt>
          <dd>Menos de ±0,5 puntos</dd>
        </div>
        <dd className="basis-full text-pretty">
          Relaciones del bloque D del score, no traspasos individuales. El grupo no es prestatario.
        </dd>
      </dl>
    </section>
  );
}
