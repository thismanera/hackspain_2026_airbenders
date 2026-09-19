/**
 * La previsión traducida a dinero. El motor dice "score 58 dentro de 3 meses";
 * la empresa y el partner quieren saber qué banda es eso, qué límite y qué TAE
 * tocarían, y cuántos euros al año hay en juego. Se calcula en el servidor, con
 * las mismas tablas de banda que la decisión (SOURCE §2.1–2.2): la UI no calcula
 * (PRODUCT §7.4), solo enseña.
 */
import type { Banda, Decision, ForecastImpact } from "./types";
import { BANDA, deriveBanda } from "./vocabulary";

/** TAE media de una póliza de circulante mid-market fuera de Embat Flow (mismo supuesto que el informe de negociación). */
export const MARKET_APR = 8.2;

const BAND_RANK = { D: 0, C: 1, B: 2, A: 3 } satisfies Record<Banda, number>;

function roundThousand(value: number): number {
  return value > 0 ? Math.max(1000, Math.round(value / 1000) * 1000) : 0;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * El motor guarda la TAE en tanto por uno (0,065); las tablas de banda y los
 * fixtures del panel, en puntos (6,5). Las cuentas de impacto van en puntos.
 */
function asPercentagePoints(apr: number): number {
  return apr > 0 && apr <= 1 ? round1(apr * 100) : apr;
}

/**
 * Qué condiciones tocarían con la banda prevista, manteniendo todo lo demás de
 * la decisión de hoy. El límite se reescala por el factor de banda; la TAE
 * cambia solo su tramo base. Banda D: sin oferta.
 */
export function forecastImpact(decision: Decision, scorePred: number): ForecastImpact {
  const bandNow = decision.band;
  const bandPred = deriveBanda(scorePred);
  const limitNow = decision.eligible ? decision.limit : 0;
  const aprNow = decision.eligible ? asPercentagePoints(decision.apr) : null;

  const factorNow = BANDA[bandNow].factor;
  const factorPred = BANDA[bandPred].factor;

  // Base sobre la que aplicar el factor: el límite de hoy sin su factor, o la
  // capacidad si hoy no hay línea (para poder decir "volverías a tener línea").
  const capacities = [decision.capacityLimit, decision.operatingLimit].filter((value) => value > 0);
  const base =
    limitNow > 0 && factorNow > 0
      ? limitNow / factorNow
      : capacities.length > 0
        ? Math.min(...capacities)
        : 0;
  const limitPred = bandPred === "D" ? 0 : roundThousand(base * factorPred);

  const aprPred =
    bandPred === "D"
      ? null
      : aprNow !== null
        ? round1(aprNow - BANDA[bandNow].baseApr + BANDA[bandPred].baseApr)
        : BANDA[bandPred].baseApr;

  // Intereses de un año sobre el límite de hoy al precio de hoy y al previsto.
  // Sin línea en uno de los dos lados, la referencia es financiarse fuera al
  // precio de mercado: perder la línea cuesta ese sobreprecio; ganarla, lo
  // ahorra. Solo cuenta cuando la línea Embat es más barata que el mercado; si
  // no, el dinero en juego es el crédito en sí (`limitDelta`), no los intereses.
  let annualDelta = 0;
  if (limitNow > 0 && aprNow !== null && aprPred !== null) {
    annualDelta = Math.round((limitNow * (aprNow - aprPred)) / 100);
  } else if (limitNow > 0 && aprNow !== null && aprPred === null) {
    annualDelta = -Math.round((limitNow * Math.max(0, MARKET_APR - aprNow)) / 100);
  } else if (limitNow === 0 && limitPred > 0 && aprPred !== null) {
    annualDelta = Math.round((limitPred * Math.max(0, MARKET_APR - aprPred)) / 100);
  }

  const tone =
    BAND_RANK[bandPred] > BAND_RANK[bandNow]
      ? "mejora"
      : BAND_RANK[bandPred] < BAND_RANK[bandNow]
        ? "deterioro"
        : "igual";

  return {
    bandNow,
    bandPred,
    limitNow,
    limitPred,
    aprNow,
    aprPred,
    annualDelta,
    limitDelta: limitPred - limitNow,
    tone,
  };
}

const eur = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});
const pct = new Intl.NumberFormat("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function euros(value: number): string {
  return eur.format(Math.abs(value));
}

/**
 * La frase que resume el impacto, en el mismo texto para la ficha, la sheet y
 * la vista pyme. `voice: "tu"` habla a la empresa; `"ella"` habla de ella.
 */
export function impactSentence(impact: ForecastImpact, voice: "tu" | "ella" = "ella"): string {
  const tu = voice === "tu";
  const v = (forTu: string, forElla: string) => (tu ? forTu : forElla);
  const money =
    impact.annualDelta > 0
      ? `${euros(impact.annualDelta)} al año menos de intereses`
      : impact.annualDelta < 0
        ? `${euros(impact.annualDelta)} al año más de intereses`
        : null;

  if (impact.tone === "igual") {
    return `Si nada cambia, en 3 meses ${v("seguirías", "seguiría")} en banda ${impact.bandNow}, con las mismas condiciones.`;
  }

  if (impact.bandPred === "D") {
    const line =
      impact.limitNow > 0
        ? ` y ${v("perderías", "perdería")} la línea de ${euros(impact.limitNow)}`
        : "";
    const cost = money
      ? `: financiarse fuera costaría ${money.replace(" menos de intereses", "").replace(" más de intereses", " más")}`
      : ".";
    return `Si la previsión se cumple, en 3 meses ${v("caerías", "caería")} a banda D${line}${cost}`;
  }

  const verb = impact.tone === "mejora" ? v("subirías", "subiría") : v("bajarías", "bajaría");
  const limit =
    impact.limitNow === 0 && impact.limitPred > 0
      ? `${v("volverías", "volvería")} a tener línea, hasta ${euros(impact.limitPred)}`
      : `límite ${euros(impact.limitPred)} (${impact.limitDelta >= 0 ? "+" : "−"}${euros(impact.limitDelta)})`;
  const apr =
    impact.aprPred !== null
      ? `TAE ${pct.format(impact.aprPred)} %${
          impact.aprNow !== null
            ? ` (${impact.aprPred - impact.aprNow >= 0 ? "+" : "−"}${pct.format(Math.abs(impact.aprPred - impact.aprNow))} pp)`
            : ""
        }`
      : null;
  const parts = [limit, apr, money].filter((part): part is string => part !== null);
  return `Si la previsión se cumple, en 3 meses ${verb} a banda ${impact.bandPred}: ${parts.join(", ")}.`;
}

/**
 * Lo que el analista puede hacer antes de que pase. La previsión no decide
 * (decisión 38: va en sombra), pero sí ordena la agenda del partner.
 */
export function anticipation(impact: ForecastImpact): string | null {
  if (impact.tone === "deterioro") {
    return impact.bandPred === "D"
      ? "Revisar la línea antes de 3 meses"
      : "Preparar condición de preaviso";
  }
  if (impact.tone === "mejora") return "Preparar ampliación";
  return null;
}
