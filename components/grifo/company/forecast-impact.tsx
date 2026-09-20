import { Figure } from "@/components/grifo/panel";
import { TellMeMark } from "@/components/grifo/tellme-mark";
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
  if (!forecast?.impact) return null;
  const { impact } = forecast;
  const action = showAction ? anticipation(impact) : null;
  return (
    <section
      aria-label="Lectura de inteligencia artificial"
      className={cn("ai-panel border-ai-border rounded-xl border px-4 py-3.5", className)}
    >
      <p className="text-ai-accent mb-2.5 flex items-center gap-2 text-sm font-medium">
        <TellMeMark size={64} className="size-8" />
        <span className="ai-label text-base">TellMe</span>
        <span className="sr-only">, redactada con plantilla, no decide</span>
      </p>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
        <p className="text-ai-fg max-w-[60ch] text-sm text-pretty">
          {impactSentence(impact, voice)}
        </p>
        {action ? (
          <span className="bg-ai-accent/20 text-ai-fg inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium">
            {action}
          </span>
        ) : null}
      </div>
    </section>
  );
}

/** Las cuatro cifras del impacto, para la ficha y la sheet. */
export function ForecastImpactFigures({
  impact,
  className,
}: {
  impact: ForecastImpact;
  className?: string;
}) {
  const aprDelta =
    impact.aprNow !== null && impact.aprPred !== null ? impact.aprPred - impact.aprNow : null;
  return (
    <dl className={cn("grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4", className)}>
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
      />
      <Figure
        label="Límite previsto"
        value={impact.limitPred > 0 ? formatEuros(impact.limitPred) : "Sin línea"}
        hint={
          impact.limitDelta !== 0 ? (
            <span className={IMPACT_TONE[impact.tone]}>{signedEuros(impact.limitDelta)}</span>
          ) : undefined
        }
      />
      <Figure
        label="TAE prevista"
        value={impact.aprPred !== null ? formatApr(impact.aprPred) : "Sin oferta"}
        hint={
          aprDelta !== null && aprDelta !== 0 ? (
            <span className={IMPACT_TONE[impact.tone]}>{formatSigned(aprDelta)} pp</span>
          ) : undefined
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
              : undefined
        }
      />
    </dl>
  );
}
