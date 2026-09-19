import type { Accion, Banda, DecisionRow } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const LEGACY = {
  coverageRatio: 1.3,
  stressReceipts: 0.8,
  stressPayments: 1.1,
  advanceRate: 0.8,
  bandThresholds: [75, 60, 45],
  bandFactors: { A: 1, B: 0.7, C: 0.4, D: 0 } satisfies Record<Banda, number>,
  price: { A: 0.05, B: 0.07, C: 0.1, D: null } satisfies Record<Banda, number | null>,
  confidenceTarget: 0.6,
  lowConfidence: 0.3,
  openingConfidence: 0.5,
  monthlyChangeCap: 0.25,
};

function band(score: number): Banda {
  return score >= LEGACY.bandThresholds[0]
    ? "A"
    : score >= LEGACY.bandThresholds[1]
      ? "B"
      : score >= LEGACY.bandThresholds[2]
        ? "C"
        : "D";
}
function lower(b: Banda): Banda {
  return b === "A" ? "B" : b === "B" ? "C" : "D";
}

/** rows: filas de UNA empresa en orden cronológico. */
export function decideLegacy(rows: ScoreRow[]): DecisionRow[] {
  const out: DecisionRow[] = [];
  for (let t = 0; t < rows.length; t++) {
    const r = rows[t],
      prev = out[t - 1],
      prev2 = out[t - 2];
    let b = band(r.score);
    if (r.direccion === "deterioro" && r.naturaleza === "estructural") b = lower(b);
    const dues = r.servicioDeudaMedia6m + r.amortCreditoMedia6m;
    const capacidadBase = Math.max(
      0,
      (r.cobrosOpMedia6m - r.pagosOpMedia6m) / LEGACY.coverageRatio - dues,
    );
    const capacidadAdv = Math.max(
      0,
      (LEGACY.stressReceipts * r.cobrosOpMedia6m - LEGACY.stressPayments * r.pagosOpMedia6m) /
        LEGACY.coverageRatio -
        dues,
    );
    const limiteCap = capacidadAdv * 12;
    const limiteOp = LEGACY.advanceRate * r.cobrosOpMedia3m * 3;
    const limiteRecomendado =
      Math.round(
        (Math.min(limiteCap, limiteOp) *
          LEGACY.bandFactors[b] *
          Math.min(1, r.confianza / LEGACY.confidenceTarget)) /
          1000,
      ) * 1000;
    const previousLimit = prev?.limiteVigente ?? 0;
    const hardClose = b === "D" || r.rachaDeficit >= 3 || (r.C4 !== null && r.C4 > 0.4);
    const declining2 =
      prev !== undefined &&
      limiteRecomendado < 0.85 * previousLimit &&
      prev.limiteRecomendado < 0.85 * (prev2?.limiteVigente ?? 0);
    const accion: Accion = hardClose
      ? "cerrar"
      : r.confianza < LEGACY.lowConfidence
        ? "mantener"
        : previousLimit === 0 && limiteRecomendado > 0 && r.confianza >= LEGACY.openingConfidence
          ? "abrir"
          : previousLimit > 0 &&
              (declining2 || (r.direccion === "deterioro" && r.naturaleza === "estructural"))
            ? "reducir"
            : previousLimit > 0 &&
                limiteRecomendado > 1.15 * previousLimit &&
                r.direccion !== "deterioro"
              ? "ampliar"
              : "mantener";
    const limiteVigente =
      accion === "cerrar"
        ? 0
        : accion === "abrir"
          ? limiteRecomendado
          : accion === "ampliar"
            ? Math.min(limiteRecomendado, previousLimit * (1 + LEGACY.monthlyChangeCap))
            : accion === "reducir"
              ? Math.max(limiteRecomendado, previousLimit * (1 - LEGACY.monthlyChangeCap))
              : previousLimit;
    const top = [...r.deltaContrib]
      .sort((a, c) => Math.abs(c.delta) - Math.abs(a.delta))
      .slice(0, 2);
    out.push({
      company: r.company,
      month: r.month,
      motor: "legacy",
      banda: b,
      precio: LEGACY.price[b],
      capacidadBase,
      capacidadAdv,
      limiteCap,
      limiteOp,
      limiteRecomendado,
      limiteVigente,
      accion,
      motivo: `${accion}: ${top.map((x) => `${x.id} ${x.delta >= 0 ? "+" : ""}${x.delta.toFixed(1)}`).join(", ")}`,
    });
  }
  return out;
}
