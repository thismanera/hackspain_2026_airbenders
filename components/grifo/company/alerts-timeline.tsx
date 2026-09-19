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
 * producto: los meses que el analista habría ganado. Por eso va escrita, no
 * deducible de dos fechas.
 */
export function AlertsTimeline({ alerts }: { alerts: Alert[] }) {
  if (alerts.length === 0) {
    return (
      <Panel title="Alertas">
        <p className="text-muted-foreground flex items-center gap-2 text-sm">
          <ShieldCheck aria-hidden className="text-status-healthy-fg size-4 shrink-0" />
          Ninguna alerta activa este mes.
        </p>
      </Panel>
    );
  }

  return (
    <Panel
      title="Alertas"
      description={`${alerts.length} ${alerts.length === 1 ? "señal activa" : "señales activas"} este mes.`}
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {alerts.map((alert) => {
          const lead = leadMonths(alert);
          return (
            <li key={`${alert.type}-${alert.indicator}`} className="flex gap-2.5 px-4 py-3">
              <AlertTriangle
                aria-hidden
                className={cn(
                  "mt-0.5 size-4 shrink-0",
                  alert.severity === "critica" ? "text-status-risk-fg" : "text-status-watch-fg",
                )}
              />
              <div className="min-w-0">
                <p className="text-sm text-pretty">{alert.label}</p>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Detectada en {formatMonthShort(alert.onsetMonth)}, confirmada en{" "}
                  {formatMonthShort(alert.confirmedMonth)}
                  {lead > 0 ? (
                    <>
                      {" · "}
                      <span className="text-foreground font-medium">
                        {lead} {lead === 1 ? "mes" : "meses"} de aviso
                      </span>
                    </>
                  ) : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
