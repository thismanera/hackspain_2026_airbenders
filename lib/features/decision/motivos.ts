import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { Accion, Banda, DecisionInput, Puerta } from "@/lib/features/decision/types";

/** Un solo formateador para todos los importes: construirlo por llamada es caro. */
const EUR = new Intl.NumberFormat("es-ES", { maximumFractionDigits: 0 });

export function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}
export function eur(x: number): string {
  return `${EUR.format(x)} €`;
}
export function dec(x: number, n = 2): string {
  return x.toFixed(n).replace(".", ",");
}

/**
 * decision-engine §3 tabla de motivos (decisión 44).
 *
 * Las tres puertas de pilar tienen dos textos, uno por cada mitad: la alerta (hecho, cierra ya) y
 * el umbral del pilar. Así la ficha dice cuál de las dos ha fallado sin tener que enseñar la
 * variable cruda, que ya no entra en el motor.
 */
export function motivoPuerta(
  p: Puerta,
  r: DecisionInput,
  causaCrossDefault: string | null,
): string {
  const alerta = (t: DecisionInput["alertas"][number]) => r.alertas.includes(t);
  switch (p) {
    case "historia":
      return `Historial insuficiente: confianza ${dec(r.confianza)} < ${dec(P.confMin, 1)}`;
    case "estado":
      return `Score ${Math.round(r.score)} por debajo de ${P.scoreMin}`;
    case "fiabilidad":
      return alerta("impago_obligaciones")
        ? "Impago de obligaciones (alerta)"
        : `Pago de obligaciones ${dec(r.subscores.B, 1)} por debajo de ${P.umbralPilar.B}`;
    case "caja":
      return alerta("deficit_persistente")
        ? "Déficit persistente (alerta)"
        : `Estado de caja ${dec(r.subscores.A, 1)} por debajo de ${P.umbralPilar.A}`;
    case "clientes":
      return alerta("vencido_alto")
        ? "Vencido alto (alerta)"
        : `Clientes ${dec(r.subscores.C, 1)} por debajo de ${P.umbralPilar.C}`;
    case "grupo":
      return `Cierre de ${causaCrossDefault ?? "una empresa del grupo"} (${pct(r.D1)} del grupo)`;
  }
}

/**
 * Decisión 43: el sufijo de `motivo_accion` sale de la **tendencia** a 3 meses, que sí está en el
 * contrato de entrada, y no de `delta_contrib`, que era la cascada entera de scoring. Se elige el
 * pilar que más se ha movido; sin tendencia por pilar se cae al movimiento del score.
 */
function topTendencia(r: DecisionInput): string {
  const pilares = (["A", "B", "C"] as const)
    .map((id) => ({ id, delta: r.tend3m[id] }))
    .filter((x): x is { id: "A" | "B" | "C"; delta: number } => x.delta !== null)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const top = pilares[0];
  if (top) return `${top.id} ${signo(top.delta)}`;
  return r.tendScore3m !== null ? `score ${signo(r.tendScore3m)}` : "sin cambios";
}

function signo(x: number): string {
  return `${x >= 0 ? "+" : ""}${dec(x, 1)}`;
}

/** decision-engine §11. */
export function motivoAccion(
  accion: Accion,
  r: DecisionInput,
  ctx: {
    banda: Banda;
    L: number;
    LPrev: number;
    LVigente: number;
    TMax: number;
    motivoCierre: string | null;
    causaReduccion: "estructural" | "confirmada" | "prevision" | "grupo" | null;
    causaCrossDefault?: string | null;
    bandaPred: Banda | null;
    mesesParaReapertura: number | null;
    cierrePendiente?: boolean;
  },
): string {
  switch (accion) {
    case "abrir":
      return `Elegible: score ${Math.round(r.score)} (banda ${ctx.banda}), límite ${eur(ctx.L)} hasta ${ctx.TMax} d`;
    case "ampliar":
      return `Límite sube de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${topTendencia(r)}`;
    case "reducir": {
      const causa =
        ctx.causaReduccion === "estructural"
          ? "deterioro estructural"
          : ctx.causaReduccion === "prevision"
            ? `previsión: banda ${ctx.bandaPred} en 3 meses`
            : ctx.causaReduccion === "grupo"
              ? ctx.causaCrossDefault
                ? `cross-default de ${ctx.causaCrossDefault}`
                : "techo de grupo"
              : "2 meses por debajo";
      const detalle = topTendencia(r);
      return `Límite baja de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${causa}, ${detalle}`;
    }
    case "cerrar":
      return ctx.motivoCierre ?? "No elegible";
    case "mantener":
      // Decisión 42: el mes de gracia de una puerta blanda lo dice con todas las letras.
      if (ctx.cierrePendiente)
        return `Pendiente confirmar cierre: ${ctx.motivoCierre ?? "no elegible"}`;
      if (ctx.mesesParaReapertura !== null) return `Reapertura en ${ctx.mesesParaReapertura} meses`;
      if (ctx.causaReduccion === "confirmada") return "Pendiente confirmar bajada";
      return `Sin cambios: score ${Math.round(r.score)}, límite ${eur(ctx.LPrev)}`;
  }
}
