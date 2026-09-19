import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/core/utils";
import { formatEuros, formatScore, formatSigned } from "@/lib/features/portfolio/format";

export function ScoreFigure({
  value,
  muted = false,
  className,
}: {
  value: number;
  muted?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "font-medium tabular-nums",
        muted && "text-muted-foreground font-normal",
        className,
      )}
    >
      {formatScore(value)}
    </span>
  );
}

/** Variación del score a 3 meses. Columna propia, no pegada al número. */
export function DeltaFigure({
  delta,
  className,
}: {
  delta?: number | null;
  className?: string;
}) {
  if (delta == null || Math.abs(delta) < 0.5) {
    return <span className={cn("text-muted-foreground tabular-nums", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
        className,
      )}
    >
      {formatSigned(delta)}
    </span>
  );
}

/** Solo el movimiento en euros. Si no hubo cambio, un raya. */
export function MoneyDelta({
  amount,
  previous,
  className,
}: {
  amount: number;
  previous: number;
  className?: string;
}) {
  const delta = amount - previous;
  if (delta === 0) {
    return <span className={cn("text-muted-foreground tabular-nums", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "tabular-nums",
        delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
        className,
      )}
    >
      {delta > 0 ? "+" : "−"}
      {formatEuros(Math.abs(delta))}
    </span>
  );
}

/** Importe actual; opcionalmente el delta en euros debajo (p. ej. techo y alerta). */
export function MoneyFigure({
  amount,
  previous,
  empty = "Sin línea",
  align = "end",
  showDelta = true,
  className,
}: {
  amount: number;
  previous?: number | null;
  empty?: string;
  align?: "start" | "end" | "center";
  showDelta?: boolean;
  className?: string;
}) {
  const prior = previous ?? amount;
  const delta = amount - prior;
  const alignClass =
    align === "end" ? "items-end" : align === "center" ? "items-center" : "items-start";

  if (amount <= 0 && prior <= 0) {
    return (
      <span
        className={cn(
          "text-muted-foreground",
          align === "center" && "block text-center",
          className,
        )}
      >
        {empty}
      </span>
    );
  }

  if (!showDelta) {
    return (
      <span
        className={cn(
          "font-medium tabular-nums",
          align === "center" && "block text-center",
          className,
        )}
      >
        {formatEuros(amount)}
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col leading-tight", alignClass, className)}>
      <span className="font-medium tabular-nums">{formatEuros(amount)}</span>
      {delta !== 0 ? (
        <span
          className={cn(
            "text-xs tabular-nums",
            delta > 0 ? "text-status-healthy-fg" : "text-status-risk-fg",
          )}
        >
          {delta > 0 ? "+" : "−"}
          {formatEuros(Math.abs(delta))}
        </span>
      ) : null}
    </span>
  );
}

export function AlertFlag({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-status-watch-fg inline-flex items-center gap-0.5 text-xs font-medium">
      <AlertTriangle aria-hidden className="size-3" />
      <span className="tabular-nums">{count}</span>
      <span className="sr-only">{count === 1 ? "alerta activa" : "alertas activas"}</span>
    </span>
  );
}
