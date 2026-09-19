import { Check, X } from "lucide-react";

import { Panel } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import type { Gate } from "@/lib/features/portfolio/types";

function GateRow({ gate }: { gate: Gate }) {
  return (
    <li className="flex items-start gap-2.5 px-4 py-2.5">
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
  );
}

/**
 * Las puertas de SOURCE §2.0, más la de plazo. Si alguna falla, esa es la
 * noticia; las que pasan quedan detrás de un detalle, no envuelven el cierre
 * con seis ticks verdes.
 */
export function GatesPanel({ gates }: { gates: Gate[] }) {
  const failedGates = gates.filter((gate) => !gate.passed);
  const passedGates = gates.filter((gate) => gate.passed);
  const failed = failedGates.length;

  return (
    <Panel
      title={failed === 0 ? "Puertas de elegibilidad" : "Por qué no hay línea"}
      description={
        failed === 0
          ? `Pasa las ${gates.length}. Se puede prestar.`
          : `Falla ${failed} de ${gates.length}. La primera que falla decide.`
      }
      bodyClassName="p-0"
    >
      <ul className="divide-y">
        {(failed === 0 ? gates : failedGates).map((gate) => (
          <GateRow key={gate.id} gate={gate} />
        ))}
      </ul>
      {failed > 0 && passedGates.length > 0 ? (
        <details className="border-t">
          <summary className="text-muted-foreground hover:text-foreground cursor-pointer px-4 py-2.5 text-sm transition-colors duration-150">
            Las otras {passedGates.length} puertas pasan
          </summary>
          <ul className="divide-y border-t">
            {passedGates.map((gate) => (
              <GateRow key={gate.id} gate={gate} />
            ))}
          </ul>
        </details>
      ) : null}
    </Panel>
  );
}
