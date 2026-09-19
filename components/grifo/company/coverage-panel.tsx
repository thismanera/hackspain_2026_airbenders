import { Check, Minus } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatPercent } from "@/lib/features/portfolio/format";
import type { Coverage } from "@/lib/features/portfolio/types";

function Availability({ label, available, missing }: { label: string; available: boolean; missing: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
          available ? "bg-status-healthy-surface text-status-healthy-fg" : "bg-muted text-muted-foreground",
        )}
      >
        {available ? <Check className="size-3" /> : <Minus className="size-3" />}
      </span>
      <span className="text-sm">
        {label}
        <span className="sr-only">: {available ? "disponible" : "no disponible"}</span>
        {available ? null : (
          <span className="text-muted-foreground block text-xs text-pretty">{missing}</span>
        )}
      </span>
    </li>
  );
}

/**
 * Sobre qué estamos opinando. Sin esto, un score de 62 con dos meses de historia
 * y otro con dos años se leen igual, y no valen lo mismo.
 */
export function CoveragePanel({ coverage, confidence }: { coverage: Coverage; confidence: number }) {
  return (
    <Panel
      title="Cobertura del dato"
      description="Qué información tenemos de esta empresa y hasta dónde llega nuestra opinión."
    >
      <dl className="grid grid-cols-2 gap-4">
        <div>
          <dt className="text-muted-foreground text-xs">Confianza</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatPercent(confidence, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Meses observados</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {coverage.observedMonths} <span className="text-muted-foreground text-sm">de 6</span>
          </dd>
        </div>
      </dl>

      <p className="text-muted-foreground mt-3 text-xs text-pretty">
        {formatPercent(coverage.classifiedShare, 0)} del volumen tiene categoría fiable; el resto no
        puntúa.
      </p>

      <ul className="mt-4 flex flex-col gap-2 border-t pt-3">
        <Availability
          label="Cuotas de deuda"
          available={coverage.hasDebt}
          missing="Sin cuotas visibles: no se puntúan cobertura ni carga de deuda."
        />
        <Availability
          label="Facturas"
          available={coverage.hasInvoices}
          missing="Sin facturas: no se puntúan puntualidad, retraso de cobro ni vencido."
        />
        <Availability
          label="Línea de crédito"
          available={coverage.hasCreditLine}
          missing="Sin línea: no se puntúa la dependencia de crédito."
        />
      </ul>
    </Panel>
  );
}
