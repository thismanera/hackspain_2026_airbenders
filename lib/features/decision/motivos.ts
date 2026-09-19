import type { Accion, Banda, Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}
export function eur(x: number): string {
  return `${Math.round(x).toLocaleString("es-ES")} €`;
}
export function dec(x: number, n = 2): string {
  return x.toFixed(n).replace(".", ",");
}

/** decision-engine §3 tabla de motivos. */
export function motivoPuerta(p: Puerta, r: ScoreRow, causaCrossDefault: string | null): string {
  switch (p) {
    case "historia":
      return `Historial insuficiente: confianza ${dec(r.confianza)} < 0,5`;
    case "estado":
      return `Score ${Math.round(r.score)} por debajo de 45`;
    case "fiabilidad":
      return `${r.rachaB2} meses seguidos sin pagar obligaciones`;
    case "caja":
      return r.rachaDeficit > 2
        ? `${r.rachaDeficit} meses seguidos en déficit`
        : "Caja estresada no cubre cuotas actuales";
    case "clientes":
      return `${pct(r.C4 ?? 0)} de facturas vencidas sin cobrar`;
    case "grupo":
      return `Cierre de ${causaCrossDefault ?? "una empresa del grupo"} (${pct(r.D1)} del grupo)`;
  }
}

function topDelta(r: ScoreRow): string {
  const top = [...r.deltaContrib].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  return top ? `${top.id} ${top.delta >= 0 ? "+" : ""}${dec(top.delta, 1)}` : "sin cambios";
}

/** decision-engine §11. */
export function motivoAccion(
  accion: Accion,
  r: ScoreRow,
  ctx: {
    banda: Banda;
    L: number;
    LPrev: number;
    LVigente: number;
    TMax: number;
    motivoCierre: string | null;
    causaReduccion: "estructural" | "confirmada" | "prevision" | null;
    bandaPred: Banda | null;
    mesesParaReapertura: number | null;
  },
): string {
  switch (accion) {
    case "abrir":
      return `Elegible: score ${Math.round(r.score)} (banda ${ctx.banda}), límite ${eur(ctx.L)} hasta ${ctx.TMax} d`;
    case "ampliar":
      return `Límite sube de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${topDelta(r)}`;
    case "reducir": {
      const causa =
        ctx.causaReduccion === "estructural"
          ? "deterioro estructural"
          : ctx.causaReduccion === "prevision"
            ? `previsión: banda ${ctx.bandaPred} en 3 meses`
            : "2 meses por debajo";
      return `Límite baja de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${causa}, ${topDelta(r)}`;
    }
    case "cerrar":
      return ctx.motivoCierre ?? "No elegible";
    case "mantener":
      if (ctx.mesesParaReapertura !== null) return `Reapertura en ${ctx.mesesParaReapertura} meses`;
      if (ctx.causaReduccion === "confirmada") return "Pendiente confirmar bajada";
      return `Sin cambios: score ${Math.round(r.score)}, límite ${eur(ctx.LPrev)}`;
  }
}
