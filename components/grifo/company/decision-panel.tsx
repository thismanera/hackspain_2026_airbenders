import { ActionBadge } from "@/components/grifo/action-badge";
import { ForecastImpactLine } from "@/components/grifo/company/forecast-impact";
import { Figure } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { formatApr, formatEuros } from "@/lib/features/portfolio/format";
import type { Decision, Forecast } from "@/lib/features/portfolio/types";
import { BANDA } from "@/lib/features/portfolio/vocabulary";

/**
 * Lo primero y lo más grande de la ficha: qué hacemos y por qué, en una frase
 * que se pueda repetir en comité sin traducir nada. Todo lo demás de la página
 * es la justificación, y está debajo porque se consulta, no se lee siempre.
 * Debajo de la decisión, la anticipación: dónde estará en 3 meses y qué cuesta.
 */
export function DecisionPanel({
  decision,
  changed,
  forecast,
}: {
  decision: Decision;
  changed: boolean;
  forecast?: Forecast | null;
}) {
  const limitChange =
    decision.previousLimit > 0 && decision.limit > 0
      ? Math.round((decision.limit / decision.previousLimit - 1) * 100)
      : null;

  return (
    <section
      aria-labelledby="decision-title"
      className="bg-card flex flex-col gap-5 rounded-xl border p-4 md:p-5 lg:flex-row lg:items-start lg:gap-8"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 id="decision-title" className="text-muted-foreground text-xs">
            Decisión de este mes
          </h2>
          <ActionBadge action={decision.action} changed={changed} />
        </div>
        {/* Única frase de la aplicación a 16 px: es la que de verdad se lee. */}
        <p className="mt-2 max-w-[60ch] text-base leading-relaxed text-pretty">{decision.reason}</p>
        {forecast ? (
          <div className="mt-3 border-t pt-3">
            <p className="text-muted-foreground text-xs">Anticipación a 3 meses</p>
            <ForecastImpactLine forecast={forecast} showAction className="mt-1" />
          </div>
        ) : null}
      </div>

      {decision.eligible ? (
        <dl className="grid shrink-0 grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4 lg:border-l lg:pl-8">
          <Figure
            label="Límite"
            value={formatEuros(decision.limit)}
            hint={
              limitChange !== null && limitChange !== 0 ? (
                <span
                  className={cn(
                    limitChange > 0 ? "text-status-healthy-fg" : "text-status-watch-fg",
                  )}
                >
                  {limitChange > 0 ? "+" : ""}
                  {limitChange} % desde {formatEuros(decision.previousLimit)}
                </span>
              ) : undefined
            }
          />
          <Figure
            label="Banda"
            value={decision.band}
            hint={`Factor ${BANDA[decision.band].factor.toLocaleString("es-ES")}`}
          />
          <Figure
            label="Plazo máximo"
            value={`${decision.maxTenorDays} d`}
            hint="Según banda y tendencia"
          />
          <Figure
            label="TAE desde"
            value={formatApr(decision.apr)}
            hint={`Base ${formatApr(decision.baseApr)} de banda`}
          />
        </dl>
      ) : null}
    </section>
  );
}
