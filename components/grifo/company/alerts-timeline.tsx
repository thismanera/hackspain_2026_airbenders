import { AlertTriangle, ShieldCheck } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { CALENDAR } from "@/lib/features/portfolio/calendar";
import { formatMonthShort } from "@/lib/features/portfolio/format";
import type { Alert } from "@/lib/features/portfolio/types";

function leadMonths(alert: Alert): number {
  return CALENDAR.indexOf(alert.confirmedMonth) - CALENDAR.indexOf(alert.onsetMonth);
}

/**
 * La distancia entre "detectado" y "confirmado" es el argumento entero del
 * producto: los meses que el analista habría ganado. Por eso va en una
 * píldora visible, no enterrada en una frase con las dos fechas.
 */
export function AlertsTimeline({
  alerts,
  /** Dentro de otro contenedor: sin tarjeta propia, porque no se anidan. */
  inset = false,
}: {
  alerts: Alert[];
  inset?: boolean;
}) {
  if (alerts.length === 0) {
    const empty = (
      <p className="text-muted-foreground flex items-center gap-2 text-sm">
        <ShieldCheck aria-hidden className="text-status-healthy-fg size-4 shrink-0" />
        Ninguna alerta activa este mes.
      </p>
    );
    return inset ? empty : <Panel title="Alertas">{empty}</Panel>;
  }

  const list = (
    <ul className="flex flex-col gap-3">
      {alerts.map((alert) => {
        const lead = leadMonths(alert);
        return (
          <li key={`${alert.type}-${alert.indicator}`} className="flex items-start gap-2.5">
            <AlertTriangle
              aria-hidden
              className={cn(
                "mt-0.5 size-4 shrink-0",
                alert.severity === "critica" ? "text-status-risk-fg" : "text-status-watch-fg",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                <p className="text-sm font-medium text-pretty">{alert.label}</p>
                {lead > 0 ? (
                  <span className="bg-status-watch-surface text-status-watch-fg shrink-0 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums">
                    {lead} {lead === 1 ? "mes" : "meses"} de aviso
                  </span>
                ) : null}
              </div>
              <p className="text-muted-foreground text-xs tabular-nums">
                {formatMonthShort(alert.onsetMonth)} → {formatMonthShort(alert.confirmedMonth)}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );

  return inset ? list : <Panel title="Alertas">{list}</Panel>;
}
