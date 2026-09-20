import { Panel } from "@/components/grifo/panel";
import { TellMeMark } from "@/components/grifo/tellme-mark";
import { TrendDelta } from "@/components/grifo/trend";
import { cn } from "@/lib/core/utils";
import { formatEuros, formatScore } from "@/lib/features/portfolio/format";
import type { Banda, MonthScore } from "@/lib/features/portfolio/types";
import { deriveBanda, NATURALEZA } from "@/lib/features/portfolio/vocabulary";

/** Fronteras de banda de SOURCE §2.1, en porcentaje del recorrido 0-100. */
const BAND_EDGES = [45, 60, 75];

const BAND_FILL = {
  D: "bg-status-risk",
  C: "bg-status-watch",
  B: "bg-status-healthy",
  A: "bg-primary",
} satisfies Record<Banda, string>;

function clamp(value: number): number {
  return Math.min(100, Math.max(0, value));
}

/**
 * Una nota sobre el recorrido 0-100, con su rango si lo tiene. El rango dibujado
 * dice de un vistazo lo que «(rango 65–91)» entre paréntesis obliga a
 * reconstruir: cuánta horquilla hay detrás de ese 84.
 */
function ScoreTrack({
  score,
  low,
  high,
  band,
}: {
  score: number;
  low?: number;
  high?: number;
  band: Banda;
}) {
  const hasRange = low !== undefined && high !== undefined && high > low;

  return (
    <div className="relative h-3">
      {/* Pista neutra siempre; el rango es un tramo más oscuro del mismo gris,
          nunca del color de banda. Si tiñe con el color del punto, el punto
          —lo único que de verdad hay que ver— se funde con lo que tiene detrás. */}
      <div className="bg-muted absolute inset-0 overflow-hidden rounded-full">
        {hasRange ? (
          <div
            className="bg-foreground/20 absolute inset-y-0 rounded-full"
            style={{ left: `${clamp(low)}%`, width: `${clamp(high) - clamp(low)}%` }}
          />
        ) : null}
      </div>
      {BAND_EDGES.map((edge) => (
        <span
          key={edge}
          aria-hidden
          className="bg-card absolute inset-y-0 w-px"
          style={{ left: `${edge}%` }}
        />
      ))}
      {/* Anillo del color de la tarjeta: separa el punto de lo que tenga detrás
          en vez de fundirse con ello. */}
      <span
        aria-hidden
        className={cn(
          "absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_3px_var(--card)]",
          BAND_FILL[band],
        )}
        style={{ left: `${clamp(score)}%` }}
      />
    </div>
  );
}

function Milestone({
  caption,
  score,
  low,
  high,
}: {
  caption: string;
  score: number;
  low?: number;
  high?: number;
}) {
  const band = deriveBanda(score);
  const hasRange = low !== undefined && high !== undefined && high > low;

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <p className="text-muted-foreground text-xs">{caption}</p>
      <p className="flex items-baseline gap-2">
        <span className="text-2xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatScore(score)}
        </span>
        <span className="text-muted-foreground text-xs font-medium">Banda {band}</span>
      </p>
      <ScoreTrack score={score} low={low} high={high} band={band} />
      <p className="text-muted-foreground text-xs tabular-nums">
        {hasRange ? `Entre ${formatScore(low)} y ${formatScore(high)}` : "Cierre de este mes"}
      </p>
    </div>
  );
}

/**
 * Anticipación en lenguaje de empresa (PRODUCT §10, prioridad 4): dónde estará
 * el score si nada cambia, y qué significa para el bolsillo. La previsión va en
 * modo sombra (SOURCE parte 2): informa, no decide.
 */
export function OutlookPanel({ month, inset = false }: { month: MonthScore; inset?: boolean }) {
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
  const money =
    impact && impact.annualDelta !== 0
      ? `${impact.annualDelta > 0 ? "Te ahorrarías" : "Pagarías"} ${formatEuros(Math.abs(impact.annualDelta))} al año en intereses`
      : "Mismo coste en intereses que hoy";

  const body = (
    <div className="flex flex-col gap-4">
      <div className="grid gap-5 sm:grid-cols-3">
        <Milestone caption="Hoy" score={month.score} />
        <Milestone
          caption="En 3 meses"
          score={forecast.scoreSoloPred3m}
          low={forecast.p10Solo3m}
          high={forecast.p90Solo3m}
        />
        <Milestone
          caption="En 6 meses"
          score={forecast.scoreSoloPred6m}
          low={forecast.p10Solo6m}
          high={forecast.p90Solo6m}
        />
      </div>

      <section
        aria-label="Lectura de inteligencia artificial"
        className="ai-panel border-ai-border rounded-xl border px-4 py-3.5"
      >
        <p className="text-ai-accent mb-2.5 flex items-center gap-2 text-sm font-medium">
          <TellMeMark size={64} className="size-8" />
          <span className="ai-label text-base">TellMe</span>
        </p>
        <p className="text-ai-fg text-sm text-pretty">{money}.</p>
      </section>
    </div>
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
