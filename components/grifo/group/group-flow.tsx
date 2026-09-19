"use client";

import { Building2, Landmark, Pause, Play } from "lucide-react";
import { useId, useState, useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/core/utils";
import { formatPercent, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { Estado, GroupFileResponse, GroupMember } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

const WIDTH = 640;
const CARD_W = 180;
const CARD_H = 52;
const ROW_GAP = 14;
const PAD = 18;
const HUB_R = 24;
const BUS_OFFSET = 62;
const CORNER = 12;
const NEUTRAL_BAND = 0.5;
const PULSE_SECONDS = 2.8;

type Sense = "support" | "drag" | "neutral";

function senseOf(member: GroupMember): Sense {
  if (member.adjustment >= NEUTRAL_BAND) return "support";
  if (member.adjustment <= -NEUTRAL_BAND) return "drag";
  return "neutral";
}

const SENSE_INK = {
  support: "var(--status-healthy)",
  drag: "var(--status-risk)",
  neutral: "var(--muted-foreground)",
} satisfies Record<Sense, string>;

const SENSE_TEXT = {
  support: "var(--status-healthy-fg)",
  drag: "var(--status-risk-fg)",
  neutral: "var(--muted-foreground)",
} satisfies Record<Sense, string>;

const SENSE_LABEL = {
  support: "el grupo la sostiene",
  drag: "el grupo la arrastra",
  neutral: "sin efecto apreciable",
} satisfies Record<Sense, string>;

const ESTADO_TILE = {
  sana: { fill: "var(--status-healthy-surface)", ink: "var(--status-healthy-fg)" },
  vigilar: { fill: "var(--status-watch-surface)", ink: "var(--status-watch-fg)" },
  riesgo: { fill: "var(--status-risk-surface)", ink: "var(--status-risk-fg)" },
  sin_datos: { fill: "var(--status-none-surface)", ink: "var(--status-none-fg)" },
} satisfies Record<Estado, { fill: string; ink: string }>;

/**
 * Conector ortogonal del centro a la tarjeta, con las esquinas redondeadas:
 * sale del centro, sube o baja por el bus de su lado y entra en la tarjeta.
 * Si la tarjeta está a la misma altura, es una recta.
 */
function connector(hub: { x: number; y: number }, side: 1 | -1, cardY: number, cardEdgeX: number) {
  const start = hub.x + side * HUB_R;
  const busX = hub.x + side * BUS_OFFSET;
  const dy = cardY - hub.y;
  if (Math.abs(dy) < 1) return `M ${start} ${hub.y} H ${cardEdgeX}`;
  const v = Math.sign(dy);
  const r = Math.min(CORNER, Math.abs(dy) / 2);
  return [
    `M ${start} ${hub.y}`,
    `H ${busX - side * r}`,
    `Q ${busX} ${hub.y} ${busX} ${hub.y + v * r}`,
    `V ${cardY - v * r}`,
    `Q ${busX} ${cardY} ${busX + side * r} ${cardY}`,
    `H ${cardEdgeX}`,
  ].join(" ");
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function subscribeReducedMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCED_MOTION);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

/**
 * El grupo como red. SOURCE §1.7 no tiene matriz ni filiales: el "padre" de
 * cada empresa es el resto del grupo, así que el grupo va arriba y las empresas
 * cuelgan de él. Cada conector lleva el ajuste del bloque D que el grupo aplica
 * al score de esa empresa: un pulso teal si suma, rosa si resta, nada si no
 * llega a ±0,5. No son transferencias; son las relaciones que el score ya usa.
 *
 * El pulso es SMIL `animateMotion`: declarativo, sin JavaScript por fotograma,
 * y desaparece cuando el sistema prefiere menos movimiento.
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
  const reducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const moving = !reducedMotion && !paused;
  const titleId = useId();
  const descId = useId();

  const members = group.members;
  const total = members.length;
  const rows = Math.max(1, Math.ceil(total / 2));
  const height = Math.max(168, rows * CARD_H + (rows - 1) * ROW_GAP + PAD * 2);
  const hub = { x: WIDTH / 2, y: height / 2 };
  const leftCount = Math.ceil(total / 2);
  const nodes = members.map((member, index) => {
    const side: 1 | -1 = index < leftCount ? -1 : 1;
    const row = side === -1 ? index : index - leftCount;
    const count = side === -1 ? leftCount : total - leftCount;
    const columnHeight = count * CARD_H + (count - 1) * ROW_GAP;
    const top = hub.y - columnHeight / 2 + row * (CARD_H + ROW_GAP);
    const left = side === -1 ? PAD : WIDTH - PAD - CARD_W;
    const centerY = top + CARD_H / 2;
    return {
      member,
      left,
      top,
      sense: senseOf(member),
      path: connector(hub, side, centerY, side === -1 ? left + CARD_W : left),
    };
  });

  return (
    <section className={cn("bg-card rounded-xl border", className)}>
      <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium">Efecto del grupo sobre cada empresa</h3>
          <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
            Cada línea lleva el ajuste del bloque D al score de la empresa: suma por aval, resta
            por contagio.
          </p>
        </div>
        {reducedMotion ? null : (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-pressed={paused}
            onClick={() => setPaused((value) => !value)}
            className="text-muted-foreground shrink-0"
          >
            {paused ? <Play aria-hidden /> : <Pause aria-hidden />}
            {paused ? "Reanudar" : "Pausar"}
          </Button>
        )}
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
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

        {nodes.map(({ member, path }) => (
          <path
            key={member.id}
            d={path}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1.25}
            strokeLinecap="round"
          />
        ))}

        {moving
          ? nodes.map(({ member, sense, path }, index) =>
              sense === "neutral" ? null : (
                <rect
                  key={member.id}
                  x={-9}
                  y={-1.25}
                  width={18}
                  height={2.5}
                  rx={1.25}
                  opacity={0}
                  fill={SENSE_INK[sense]}
                >
                  <animateMotion
                    dur={`${PULSE_SECONDS}s`}
                    begin={`${(index / total) * PULSE_SECONDS}s`}
                    repeatCount="indefinite"
                    path={path}
                    rotate="auto"
                    calcMode="spline"
                    keyTimes="0;1"
                    keySplines="0.45 0 0.55 1"
                  />
                  <animate
                    attributeName="opacity"
                    values="0;1;1;0"
                    keyTimes="0;0.12;0.88;1"
                    dur={`${PULSE_SECONDS}s`}
                    begin={`${(index / total) * PULSE_SECONDS}s`}
                    repeatCount="indefinite"
                  />
                </rect>
              ),
            )
          : null}

        {/* El centro no es una empresa: es el resto del grupo, el "padre" de SOURCE §1.7. */}
        <g transform={`translate(${hub.x} ${hub.y})`}>
          <circle r={HUB_R} fill="var(--card)" stroke="var(--border)" strokeWidth={1.25} />
          <Landmark
            x={-10}
            y={-10}
            width={20}
            height={20}
            strokeWidth={1.75}
            aria-hidden
            color="var(--foreground)"
          />
          <text
            textAnchor="middle"
            y={HUB_R + 16}
            fontSize={11}
            fontWeight={500}
            fill="var(--foreground)"
            style={{ fontFamily: "var(--font-mono)" }}
          >
            {group.groupId}
          </text>
          <text
            textAnchor="middle"
            y={HUB_R + 30}
            fontSize={10.5}
            fill="var(--muted-foreground)"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            Score {formatScore(group.score)} · {total} empresas
          </text>
        </g>

        {nodes.map(({ member, left, top, sense }) => {
          const tile = ESTADO_TILE[member.estado];
          return (
            /* Enlace SVG real: abre la ficha en la hoja con clic simple y sigue
               siendo un enlace para el teclado, el clic central y la pestaña nueva. */
            <g key={member.id} transform={`translate(${left} ${top})`}>
              <a
                href={`/cartera/${member.id}?mes=${month}`}
                aria-label={`${member.id}, ${ESTADO[member.estado].label}, score ${formatScore(member.score)}. Abrir ficha`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey)
                    return;
                  event.preventDefault();
                  onOpenCompany(member.id);
                }}
                className="focus-visible:outline-ring group/node cursor-pointer outline-offset-2 focus-visible:outline-2"
              >
                <rect
                  width={CARD_W}
                  height={CARD_H}
                  rx={10}
                  fill="var(--card)"
                  stroke="var(--border)"
                  strokeWidth={1.25}
                  className="transition-[stroke] duration-150 group-hover/node:stroke-[var(--foreground)]"
                />
                <rect x={10} y={12} width={28} height={28} rx={8} fill={tile.fill} />
                <Building2
                  x={17}
                  y={19}
                  width={14}
                  height={14}
                  strokeWidth={2}
                  aria-hidden
                  color={tile.ink}
                />
                <text
                  x={46}
                  y={23}
                  fontSize={11.5}
                  fontWeight={500}
                  fill="var(--foreground)"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  {member.id}
                </text>
                <text
                  x={CARD_W - 10}
                  y={23}
                  textAnchor="end"
                  fontSize={10.5}
                  fontWeight={600}
                  fill={SENSE_TEXT[sense]}
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  {sense === "neutral" ? "±0" : formatSigned(member.adjustment)}
                </text>
                <text
                  x={46}
                  y={37}
                  fontSize={10.5}
                  fill="var(--muted-foreground)"
                  style={{ fontVariantNumeric: "tabular-nums" }}
                >
                  <tspan fontWeight={600} fill="var(--foreground)">
                    {formatScore(member.score)}
                  </tspan>
                  {" · "}
                  {formatPercent(member.share, 0)} del grupo
                </text>
              </a>
            </g>
          );
        })}
      </svg>

      <dl className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-1 border-t px-4 py-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span aria-hidden className="bg-status-healthy inline-block h-0.5 w-4 rounded-full" />
          <dt className="sr-only">Pulso teal</dt>
          <dd>Aval, suma puntos</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="bg-status-risk inline-block h-0.5 w-4 rounded-full" />
          <dt className="sr-only">Pulso rosa</dt>
          <dd>Contagio, resta puntos</dd>
        </div>
        <div className="flex items-center gap-2">
          <span aria-hidden className="bg-border inline-block h-px w-4" />
          <dt className="sr-only">Sin pulso</dt>
          <dd>Menos de ±0,5</dd>
        </div>
        <dd className="ml-auto text-pretty">
          Bloque D del score, no traspasos. El grupo no es prestatario.
        </dd>
      </dl>
    </section>
  );
}
