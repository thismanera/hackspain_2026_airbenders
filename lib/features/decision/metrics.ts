import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { DecisionRow } from "@/lib/features/decision/types";
import { detectEvents } from "@/lib/features/scoring/backtest";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { median, monthIndex } from "@/lib/features/scoring/windows";

export type MetricasDecision = {
  eventos: number;
  exposicionEvitada: number;
  ingresosSimulados: number;
  oscilacion: number;
  cierres: number;
  cierresFalsos: number;
  leadTimeCierreMediano: number | null;
};

/**
 * decision-engine §14. Exposición evitada = Σ (L_vigente(t−3) − L_vigente(t)) sobre eventos de
 * deterioro en t. Oscilación = % de empresa-mes con un cambio de acción: un `cerrar` repetido no
 * cuenta (la empresa ya estaba cerrada, el grifo no se ha movido) y `mantener` nunca cuenta.
 */
export function metricasDecision(scores: ScoreRow[], decisions: DecisionRow[]): MetricasDecision {
  const byKey = new Map(decisions.map((d) => [`${d.company}|${d.month}`, d]));
  const byCompany = new Map<string, DecisionRow[]>();
  for (const d of decisions) {
    const list = byCompany.get(d.company) ?? [];
    list.push(d);
    byCompany.set(d.company, list);
  }
  for (const list of byCompany.values()) list.sort((a, b) => a.month.localeCompare(b.month));
  const eventos = detectEvents(scores).filter((e) => e.kind === "deterioro");
  let exposicionEvitada = 0;
  const leads: number[] = [];
  for (const e of eventos) {
    const t = monthIndex(e.month);
    const list = byCompany.get(e.company) ?? [];
    const antes = list.find((d) => monthIndex(d.month) === t - 3);
    const en = byKey.get(`${e.company}|${e.month}`);
    if (antes && en) exposicionEvitada += Math.max(0, antes.LVigente - en.LVigente);
    // Primer aviso del motor en los 6 meses previos al evento: de ahí sale el lead time.
    const primeraReduccion = list.find(
      (d) =>
        (d.accion === "reducir" || d.accion === "cerrar") &&
        monthIndex(d.month) < t &&
        monthIndex(d.month) >= t - 6,
    );
    if (primeraReduccion) leads.push(t - monthIndex(primeraReduccion.month));
  }
  let ingresos = 0,
    cambios = 0,
    cierres = 0,
    cierresFalsos = 0;
  const eventosPorEmpresa = new Map<string, number[]>();
  for (const e of eventos) {
    const list = eventosPorEmpresa.get(e.company) ?? [];
    list.push(monthIndex(e.month));
    eventosPorEmpresa.set(e.company, list);
  }
  for (const [company, list] of byCompany) {
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      // Supuesto explícito de §14: se usa el `usoSimulado` del límite vigente al plazo natural.
      const op = d.menu.find((o) => o.plazo >= d.plazoNaturalAnticipo) ?? d.menu.at(-1);
      if (op) ingresos += (P.usoSimulado * d.LVigente * op.tae * op.plazo) / P.baseDias;
      const cierreNuevo = d.accion === "cerrar" && (i === 0 || list[i - 1].accion !== "cerrar");
      // Transiciones, no estados: seguir cerrada mes tras mes no es un cambio de acción.
      if (d.accion !== "mantener" && (d.accion !== "cerrar" || cierreNuevo)) cambios++;
      if (cierreNuevo) {
        cierres++; // solo el mes en que se cierra, no cada mes que sigue cerrado
        const t = monthIndex(d.month);
        const ev = eventosPorEmpresa.get(company) ?? [];
        if (!ev.some((x) => x > t && x <= t + 6)) cierresFalsos++;
      }
    }
  }
  return {
    eventos: eventos.length,
    exposicionEvitada,
    ingresosSimulados: Math.round(ingresos),
    oscilacion: decisions.length ? cambios / decisions.length : 0,
    cierres,
    cierresFalsos,
    leadTimeCierreMediano: median(leads),
  };
}
