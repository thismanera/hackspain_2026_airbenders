import { ArrowDownRight, ArrowUpRight } from "lucide-react";

import { Figure } from "@/components/grifo/panel";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/core/utils";
import { formatMonthShort, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { AnalisisPostInflexion, DecisionPostInflexion } from "@/lib/features/rca/types";
import { CANAL, describeTrigger, DIAGNOSTICO, PRODUCTO } from "@/lib/features/rca/vocabulary";

/**
 * Piezas del playbook de tesorería (docs/engines/treasury-playbook.md): la
 * misma evidencia se enseña completa en la ficha del partner (una pestaña) y
 * plegada en la vista de empresa (una fila de "Evidencia"), así que las
 * piezas se comparten y solo cambia el envoltorio.
 */

export function RcaDiagnosisBadge({
  diagnostico,
  className,
}: {
  diagnostico: AnalisisPostInflexion["diagnosticoRespuesta"];
  className?: string;
}) {
  const tone =
    diagnostico === "reaccion_destructiva"
      ? "bg-status-risk-surface text-status-risk-fg"
      : diagnostico === "reaccion_pasiva"
        ? "bg-status-watch-surface text-status-watch-fg"
        : "bg-status-healthy-surface text-status-healthy-fg";

  return (
    <span
      className={cn(
        "inline-flex w-fit items-center rounded-full py-0.5 pr-2.5 pl-2 text-xs font-medium whitespace-nowrap",
        tone,
        className,
      )}
    >
      {DIAGNOSTICO[diagnostico].label}
    </span>
  );
}

/** El resumen: diagnóstico, ventana de la inflexión y cuánto se movió el score. */
export function RcaLead({ rca }: { rca: AnalisisPostInflexion }) {
  const trigger = describeTrigger(rca.detonanteOriginal);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <RcaDiagnosisBadge diagnostico={rca.diagnosticoRespuesta} />
        <span className="text-muted-foreground text-xs">
          {formatMonthShort(rca.mesInflexion)} → {formatMonthShort(rca.mesActual)} ·{" "}
          {rca.mesesTranscurridos} {rca.mesesTranscurridos === 1 ? "mes" : "meses"}
        </span>
      </div>
      <p className="text-sm text-pretty">
        Score autónomo de {formatScore(rca.scoreEnInflexion)} a {formatScore(rca.scoreActual)} (
        <span
          className={cn(
            "font-medium tabular-nums",
            rca.deltaScoreTotal > 0
              ? "text-status-healthy-fg"
              : rca.deltaScoreTotal < 0
                ? "text-status-risk-fg"
                : "text-muted-foreground",
          )}
        >
          {formatSigned(rca.deltaScoreTotal)}
        </span>
        ) desde {rca.tipoInflexion === "pico_bajista" ? "un giro bajista" : "un suelo alcista"}.
        Primer detonante: {trigger.label}
        {trigger.support ? ` (${trigger.support})` : ""}.
      </p>
    </div>
  );
}

function FindingLine({ decision }: { decision: DecisionPostInflexion }) {
  const positive = decision.tipo === "acierto_mitigante";
  const producto = PRODUCTO[decision.productoSugerido];
  const Icon = positive ? ArrowUpRight : ArrowDownRight;

  return (
    <li className="flex items-start gap-2.5">
      <Icon
        aria-hidden
        className={cn(
          "mt-0.5 size-3.5 shrink-0",
          positive ? "text-status-healthy-fg" : "text-status-risk-fg",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-pretty">{decision.descripcion}</p>
          <span
            className={cn(
              "shrink-0 text-sm font-medium tabular-nums",
              positive ? "text-status-healthy-fg" : "text-status-risk-fg",
            )}
          >
            {formatSigned(decision.deltaPuntos)}
          </span>
        </div>
        <p className="text-muted-foreground mt-0.5 text-xs text-pretty">
          {CANAL[decision.canal]} · {decision.leccionAprendida}
        </p>
        {producto ? (
          <Badge variant="outline" className="mt-1.5">
            {producto}
          </Badge>
        ) : null}
      </div>
    </li>
  );
}

/** Mejoras o presiones, en su propia tarjeta: para la pestaña completa del partner. */
export function RcaFindingsCard({
  title,
  items,
  empty,
}: {
  title: string;
  items: DecisionPostInflexion[];
  empty: string;
}) {
  return (
    <section className="bg-card overflow-hidden rounded-xl border">
      <h3 className="border-b px-4 py-3 text-sm font-medium">{title}</h3>
      {items.length > 0 ? (
        <ul className="flex flex-col gap-3 p-4">
          {items.map((decision) => (
            <FindingLine key={decision.variable} decision={decision} />
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground px-4 py-3 text-sm text-pretty">{empty}</p>
      )}
    </section>
  );
}

/** Mismos hallazgos, sin tarjeta propia: para cuando ya están dentro de otro contenedor. */
export function RcaFindingsList({
  title,
  items,
}: {
  title: string;
  items: DecisionPostInflexion[];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-muted-foreground text-xs font-medium">{title}</h4>
      <ul className="mt-2 flex flex-col gap-3">
        {items.map((decision) => (
          <FindingLine key={decision.variable} decision={decision} />
        ))}
      </ul>
    </div>
  );
}

/** Los dos escenarios contables si se revierten las presiones seleccionadas (§6 del playbook). */
export function RcaScenarios({ rca }: { rca: AnalisisPostInflexion }) {
  if (rca.errores.length === 0) return null;
  const holdingGain = rca.scoreRecuperableGrupoEstimado - rca.scoreRecuperableEstimado;

  return (
    <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      <Figure label="Score actual" value={formatScore(rca.scoreActual)} />
      <Figure
        label="Sin las presiones seleccionadas"
        value={formatScore(rca.scoreRecuperableEstimado)}
      />
      {holdingGain > 0 ? (
        <Figure
          label="+ sin el drenaje del holding"
          value={formatScore(rca.scoreRecuperableGrupoEstimado)}
        />
      ) : null}
    </dl>
  );
}

/** `mantener` / `evitar` / `accionesInmediatas`: frases ya redactadas por el motor. */
export function RcaPlaybookList({ items }: { items: string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1.5">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-sm text-pretty">
          <span aria-hidden className="text-muted-foreground/60">
            ·
          </span>
          {item}
        </li>
      ))}
    </ul>
  );
}

/** El apoyo del grupo, cuando se movió lo suficiente para ser una observación (§5). */
export function RcaHoldingNote({ rca }: { rca: AnalisisPostInflexion }) {
  if (!rca.contextoHolding.observacion) return null;
  return (
    <ul className="flex flex-col gap-3">
      <FindingLine decision={rca.contextoHolding.observacion} />
    </ul>
  );
}
