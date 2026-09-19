import { Check, X } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import type { Gate } from "@/lib/features/portfolio/types";

/**
 * Las puertas de SOURCE §2.0, más la de plazo (§2.2: banda C con deterioro
 * estructural no presta a ningún plazo). Se enseñan todas, no solo la que falla:
 * pasar seis y tropezar en una es información distinta de tropezar en cuatro.
 */
export function GatesPanel({ gates }: { gates: Gate[] }) {
  const failed = gates.filter((gate) => !gate.passed).length;

  return (
    <Panel
      title="Puertas de elegibilidad"
      description={
        failed === 0
          ? "Pasa las seis. Se puede prestar."
          : `Falla ${failed} de ${gates.length}. La primera que falla decide.`
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {gates.map((gate) => (
          <li key={gate.id} className="flex items-start gap-2.5 px-4 py-2.5">
            <span
              aria-hidden
              className={cn(
                "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full",
                gate.passed
                  ? "bg-status-healthy-surface text-status-healthy-fg"
                  : "bg-status-risk-surface text-status-risk-fg",
              )}
            >
              {gate.passed ? <Check className="size-3" /> : <X className="size-3" />}
            </span>
            <div className="min-w-0">
              <p className={cn("text-sm", !gate.passed && "font-medium")}>
                {gate.label}
                <span className="sr-only">: {gate.passed ? "pasa" : "no pasa"}</span>
              </p>
              <p className="text-muted-foreground text-xs text-pretty">{gate.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
