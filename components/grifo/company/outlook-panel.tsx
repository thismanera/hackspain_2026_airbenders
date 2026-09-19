import { Figure, Panel } from "@/components/grifo/panel";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { formatApr, formatDays, formatScore } from "@/lib/features/portfolio/format";
import type { Banda, MonthScore } from "@/lib/features/portfolio/types";
import { BANDA, NATURALEZA, deriveBanda } from "@/lib/features/portfolio/vocabulary";

const BAND_RANK = { D: 0, C: 1, B: 2, A: 3 } satisfies Record<Banda, number>;

function bandOutcome(current: Banda, predicted: Banda) {
  if (predicted === current) {
    return { text: `Seguirías en banda ${current}.`, tone: "text-muted-foreground" };
  }
  if (BAND_RANK[predicted] > BAND_RANK[current]) {
    return {
      text: `Entrarías en banda ${predicted}: TAE base ${formatApr(BANDA[predicted].baseApr)} y plazo hasta ${formatDays(BANDA[predicted].maxTenor)}.`,
      tone: "text-status-healthy-fg",
    };
  }
  return {
    text:
      predicted === "D"
        ? "Caerías a banda D: sin oferta hasta recuperar el score."
        : `Caerías a banda ${predicted}: menos importe y plazo hasta ${formatDays(BANDA[predicted].maxTenor)}.`,
    tone: "text-status-watch-fg",
  };
}

/**
 * Anticipación en lenguaje de empresa (PRODUCT §10, prioridad 4): dónde estará
 * el score si nada cambia, y qué significa para la oferta. La previsión va en
 * modo sombra (SOURCE parte 2): informa, no decide.
 */
export function OutlookPanel({ month }: { month: MonthScore }) {
  const { forecast } = month;
  const currentBand = deriveBanda(month.score);

  if (!forecast) {
    const nature = NATURALEZA[month.nature];
    return (
      <Panel
        title="Hacia dónde va tu score"
        description="Lo que dice la tendencia de los últimos tres meses."
      >
        <div className="flex items-baseline gap-3">
          <TrendDelta trend3m={month.trend3m} direction={month.direction} showWindow />
          <span className="text-sm">{nature.label}</span>
        </div>
        <p className="text-muted-foreground mt-2 text-xs text-pretty">{nature.description}</p>
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
          Todavía no hay previsión a 3 y 6 meses para esta empresa. Cuando exista, aparecerá aquí
          con su rango de incertidumbre.
        </p>
      </Panel>
    );
  }

  const outcome = bandOutcome(currentBand, deriveBanda(forecast.scoreSoloPred3m));
  const groupDiffers =
    month.scoreGrupo !== undefined && Math.abs(month.scoreGrupo - month.score) >= 0.5;

  return (
    <Panel
      title="Hacia dónde va tu score"
      description="Si nada cambia en tu operativa. Previsión orientativa; la oferta de este mes no depende de ella."
    >
      <dl className="grid grid-cols-2 gap-4">
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
      </dl>
      <p className={cn("mt-3 text-sm text-pretty", outcome.tone)}>{outcome.text}</p>
      {groupDiffers ? (
        <p className="text-muted-foreground mt-3 border-t pt-3 text-xs text-pretty">
          Con el efecto de tu grupo: {formatScore(month.scoreGrupo ?? month.score)} hoy,{" "}
          {formatScore(forecast.scoreGrupoPred3m)} en 3 meses (rango{" "}
          {formatScore(forecast.p10Grupo3m)}–{formatScore(forecast.p90Grupo3m)}).
        </p>
      ) : null}
    </Panel>
  );
}
