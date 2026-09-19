import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/core/utils";
import { formatSigned } from "@/lib/features/portfolio/format";
import type { Direccion } from "@/lib/features/portfolio/types";

const DIRECTION_TONE = {
  mejora: { icon: ArrowUpRight, text: "text-status-healthy-fg" },
  estable: { icon: ArrowRight, text: "text-muted-foreground" },
  deterioro: { icon: ArrowDownRight, text: "text-status-risk-fg" },
} satisfies Record<Direccion, { icon: typeof ArrowUpRight; text: string }>;

/**
 * Variación del score a 3 meses. La flecha y el signo dicen lo mismo que el
 * color, para que el color sea el tercer refuerzo y no el único.
 */
export function TrendDelta({
  trend3m,
  direction,
  className,
}: {
  trend3m: number | null;
  direction: Direccion;
  className?: string;
}) {
  if (trend3m === null) {
    return <span className={cn("text-muted-foreground text-xs", className)}>Sin histórico</span>;
  }

  const tone = DIRECTION_TONE[direction];
  const Icon = tone.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", tone.text, className)}>
      <Icon aria-hidden className="size-3.5" />
      <span className="tabular-nums">{formatSigned(trend3m)}</span>
      <span className="sr-only">
        {direction === "mejora" ? "de mejora" : direction === "deterioro" ? "de deterioro" : "de cambio"} en
        tres meses
      </span>
    </span>
  );
}

/**
 * Sparkline de los últimos meses de score. Es una ayuda de lectura, no un
 * gráfico: sin ejes, sin tooltip, y marcada como decorativa porque el número de
 * al lado ya dice lo mismo.
 */
export function Sparkline({
  values,
  direction,
  className,
}: {
  values: number[];
  direction: Direccion;
  className?: string;
}) {
  if (values.length < 2) {
    return <span className={cn("text-muted-foreground text-xs", className)}>—</span>;
  }

  const width = 64;
  const height = 20;
  const padding = 2;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;

  const points = values.map((value, index) => {
    const x = padding + (index / (values.length - 1)) * (width - padding * 2);
    const y = height - padding - ((value - min) / span) * (height - padding * 2);
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  const stroke =
    direction === "mejora"
      ? "var(--status-healthy)"
      : direction === "deterioro"
        ? "var(--status-risk)"
        : "var(--muted-foreground)";

  const [lastX, lastY] = points[points.length - 1].split(",");

  return (
    <svg
      aria-hidden
      focusable="false"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn("overflow-visible", className)}
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}
