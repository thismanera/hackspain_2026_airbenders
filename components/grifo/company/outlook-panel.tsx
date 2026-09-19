import { ForecastImpactLine, IMPACT_TONE } from "@/components/grifo/company/forecast-impact";
import { Figure, Panel } from "@/components/grifo/panel";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { formatEuros, formatScore } from "@/lib/features/portfolio/format";
import type { MonthScore } from "@/lib/features/portfolio/types";
import { NATURALEZA } from "@/lib/features/portfolio/vocabulary";

/**
 * Anticipación en lenguaje de empresa (PRODUCT §10, prioridad 4): dónde estará
 * el score si nada cambia, y qué significa para la oferta y para el bolsillo.
 * La previsión va en modo sombra (SOURCE parte 2): informa, no decide.
 */
export function OutlookPanel({
  month,
  inset = false,
}: {
  month: MonthScore;
  inset?: boolean;
}) {
  const { forecast } = month;

  if (!forecast) {
    const nature = NATURALEZA[month.nature];
    const empty = (
      <>
        <div className="flex items-baseline gap-3">
          <TrendDelta trend3m={month.trend3m} direction={month.direction} showWindow />
          <span className="text-sm">{nature.label}</span>
        </div>
        <p className="text-muted-foreground mt-2 text-xs text-pretty">{nature.description}</p>
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
          Todavía no hay previsión a 3 y 6 meses para esta empresa.
        </p>
      </>
    );
    return inset ? (
      empty
    ) : (
      <Panel
        title="Hacia dónde va tu score"
        description="Lo que dice la tendencia de los últimos tres meses."
      >
        {empty}
      </Panel>
    );
  }

  const { impact } = forecast;
  const groupDiffers =
    month.scoreGrupo !== undefined && Math.abs(month.scoreGrupo - month.score) >= 0.5;

  const body = (
    <>
      <dl className="grid grid-cols-3 gap-4">
        <Figure
          label="En 3 meses"
          value={formatScore(forecast.scoreSoloPred3m)}
          hint={`Rango ${formatScore(forecast.p10Solo3m)}–${formatScore(forecast.p90Solo3m)}`}
        />
        <Figure
          label="En 6 meses"
          value={formatScore(forecast.scoreSoloPred6m)}
          hint={`Hoy ${formatScore(month.score)}`}
        />
        <Figure
          label="Intereses al año"
          value={
            impact ? (
              <span className={cn(impact.annualDelta !== 0 && IMPACT_TONE[impact.tone])}>
                {impact.annualDelta === 0
                  ? "0 €"
                  : `${impact.annualDelta > 0 ? "+" : "−"}${formatEuros(Math.abs(impact.annualDelta))}`}
              </span>
            ) : (
              "—"
            )
          }
          hint={
            !impact
              ? "Si nada cambia"
              : impact.annualDelta > 0
                ? "Te ahorrarías"
                : impact.annualDelta < 0
                  ? "Pagarías de más"
                  : "Mismo coste que hoy"
          }
        />
      </dl>
      <ForecastImpactLine forecast={forecast} voice="tu" className="mt-3" />
      {groupDiffers ? (
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
          Con el efecto de tu grupo: {formatScore(month.scoreGrupo ?? month.score)} hoy,{" "}
          {formatScore(forecast.scoreGrupoPred3m)} en 3 meses (rango{" "}
          {formatScore(forecast.p10Grupo3m)}–{formatScore(forecast.p90Grupo3m)}).
        </p>
      ) : null}
    </>
  );

  return inset ? (
    body
  ) : (
    <Panel
      title="Hacia dónde va tu score"
      description="Si nada cambia. La oferta de este mes no depende de esta previsión."
    >
      {body}
    </Panel>
  );
}
