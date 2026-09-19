import { Figure } from "@/components/grifo/panel";
import { cn } from "@/lib/core/utils";
import { anticipation, impactSentence } from "@/lib/features/portfolio/forecast-impact";
import { formatApr, formatEuros, formatSigned } from "@/lib/features/portfolio/format";
import type { Forecast, ForecastImpact } from "@/lib/features/portfolio/types";

export const IMPACT_TONE = {
  mejora: "text-status-healthy-fg",
  deterioro: "text-status-watch-fg",
  igual: "text-muted-foreground",
} satisfies Record<ForecastImpact["tone"], string>;

function signedEuros(value: number): string {
  if (value === 0) return "0 €";
  return `${value > 0 ? "+" : "−"}${formatEuros(Math.abs(value))}`;
}

/**
 * La previsión en una frase, con su consecuencia en dinero y, para el partner,
 * lo que puede hacer antes. Siempre acompañada de la advertencia de sombra: la
 * previsión informa, la decisión de este mes no depende de ella (decisión 38).
 */
export function ForecastImpactLine({
  forecast,
  voice = "ella",
  showAction = false,
  className,
}: {
  forecast: Forecast | null | undefined;
  voice?: "tu" | "ella";
  showAction?: boolean;
  className?: string;
}) {
  if (!forecast) return null;
  const { impact } = forecast;
  const action = showAction ? anticipation(impact) : null;
  return (
    <div className={cn("flex flex-col gap-1.5 text-sm", className)}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <p className={cn("max-w-[60ch] text-pretty", IMPACT_TONE[impact.tone])}>
          {impactSentence(impact, voice)}
        </p>
        {action ? (
          <span className="bg-secondary text-secondary-foreground inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium">
            {action}
          </span>
        ) : null}
      </div>
      <p className="text-muted-foreground text-xs">
        Previsión en sombra{forecast.sinTendencia ? ", sin tendencia suficiente" : ""}: informa,
        pero no cambia la decisión de este mes.
      </p>
    </div>
  );
}

/** Las cuatro cifras del impacto, para la ficha y la sheet. */
export function ForecastImpactFigures({ impact }: { impact: ForecastImpact }) {
  const aprDelta =
    impact.aprNow !== null && impact.aprPred !== null ? impact.aprPred - impact.aprNow : null;
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
      <Figure
        label="Banda en 3 m"
        value={
          impact.tone === "igual" ? (
            impact.bandNow
          ) : (
            <span className={IMPACT_TONE[impact.tone]}>
              {impact.bandNow} → {impact.bandPred}
            </span>
          )
        }
        hint={impact.tone === "igual" ? "Sin cambio" : impact.tone === "mejora" ? "Sube" : "Baja"}
      />
      <Figure
        label="Límite previsto"
        value={impact.limitPred > 0 ? formatEuros(impact.limitPred) : "Sin línea"}
        hint={
          impact.limitDelta !== 0 ? (
            <span className={IMPACT_TONE[impact.tone]}>{signedEuros(impact.limitDelta)}</span>
          ) : (
            "Como hoy"
          )
        }
      />
      <Figure
        label="TAE prevista"
        value={impact.aprPred !== null ? formatApr(impact.aprPred) : "Sin oferta"}
        hint={
          aprDelta !== null && aprDelta !== 0 ? (
            <span className={IMPACT_TONE[impact.tone]}>{formatSigned(aprDelta)} pp</span>
          ) : (
            "Base de la banda"
          )
        }
      />
      <Figure
        label="Al año"
        value={
          <span className={cn(impact.annualDelta !== 0 && IMPACT_TONE[impact.tone])}>
            {signedEuros(impact.annualDelta)}
          </span>
        }
        hint={
          impact.annualDelta > 0
            ? "Menos intereses"
            : impact.annualDelta < 0
              ? "Más intereses"
              : "Mismo coste"
        }
      />
    </dl>
  );
}
