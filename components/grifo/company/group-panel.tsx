import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { Figure, Panel } from "@/components/grifo/panel";
import { StatusDot } from "@/components/grifo/status-badge";
import { formatPercent, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { GroupAdjustment, GroupPeer } from "@/lib/features/portfolio/types";
import { ESTADO } from "@/lib/features/portfolio/vocabulary";

/**
 * Bloque D de SOURCE §1.7. La asimetría (decisión #16) es lo que hay que dejar
 * claro: el grupo solo avala si tiene con qué, pero arrastra siempre.
 *
 * En la hoja las cuatro cifras van cada una en su card y las hermanas en otra:
 * es la misma jerarquía que Decisión y Score, no un párrafo suelto sobre el
 * suelo. En la página completa, donde el bloque convive con otros, sigue
 * siendo una sola tarjeta.
 */
const SISTER_GRID = "grid w-full grid-cols-[minmax(0,1fr)_3.5rem_3rem_1.5rem] items-center text-sm";

export function GroupPanel({
  group,
  peers,
  month,
  onSelect,
  cards = false,
}: {
  group: GroupAdjustment;
  peers: GroupPeer[];
  month: string;
  /** Dentro de la sheet las hermanas se abren en el sitio, sin cambiar de página. */
  onSelect?: (companyId: string) => void;
  cards?: boolean;
}) {
  const helps = group.adjustment > 0;
  const neutral = Math.abs(group.adjustment) < 0.5;
  const verdict = neutral
    ? "El grupo no mueve el score de forma apreciable este mes."
    : helps
      ? "El resto del grupo tiene capacidad y tira del score hacia arriba."
      : "El resto del grupo está peor y arrastra el score hacia abajo.";

  const figures = [
    {
      label: "Ajuste",
      value: (
        <span
          className={neutral ? undefined : helps ? "text-status-healthy-fg" : "text-status-risk-fg"}
        >
          {formatSigned(group.adjustment)}
        </span>
      ),
      hint: neutral ? "Sin movimiento" : helps ? "Tira del score" : "Arrastra el score",
    },
    { label: "Peso del grupo", value: formatPercent(group.weight, 0) },
    { label: "Su peso", value: formatPercent(group.share, 0) },
    {
      label: "Interdependencia",
      value: formatPercent(group.interdependence, 0),
      hint: `Aval ${group.support.toLocaleString("es-ES", { maximumFractionDigits: 1 })}× · media ${formatScore(group.peerScore)}`,
    },
  ];

  const sisters = (
    <div>
      <div className={`${SISTER_GRID} text-muted-foreground border-b py-2 text-xs font-medium`}>
        <span>Empresa</span>
        <span className="text-right">Peso</span>
        <span className="text-right">Score</span>
        <span className="sr-only">Abrir</span>
      </div>
      <ul className="divide-y">
        {peers.map((peer) => {
          const cells: ReactNode = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <StatusDot estado={peer.estado} />
                <span className="truncate font-mono font-medium">{peer.id}</span>
                <span className="sr-only">{ESTADO[peer.estado].label}</span>
              </span>
              <span className="text-right tabular-nums">{formatPercent(peer.share, 0)}</span>
              <span className="text-right font-medium tabular-nums">{formatScore(peer.score)}</span>
              <ChevronRight aria-hidden className="text-muted-foreground size-4 justify-self-end" />
            </>
          );
          const rowClass = `${SISTER_GRID} hover:bg-muted/40 focus-visible:ring-ring py-2.5 transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none`;

          return (
            <li key={peer.id}>
              {onSelect ? (
                <button type="button" className={rowClass} onClick={() => onSelect(peer.id)}>
                  {cells}
                </button>
              ) : (
                <Link href={`/cartera/${peer.id}?mes=${month}`} className={rowClass}>
                  {cells}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (cards) {
    return (
      <>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {figures.map((figure) => (
            <section
              key={figure.label}
              className="bg-card rounded-xl border px-4 py-3"
              aria-label={figure.label}
            >
              <dl>
                <Figure label={figure.label} value={figure.value} hint={figure.hint} />
              </dl>
            </section>
          ))}
        </div>
        <Panel
          title={peers.length === 1 ? "Su hermana" : "Sus hermanas"}
          bodyClassName="px-4 pt-0 pb-1"
        >
          {sisters}
        </Panel>
      </>
    );
  }

  return (
    <Panel title="Efecto del grupo" description={verdict} bodyClassName="flex flex-col gap-3">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {figures.map((figure) => (
          <Figure key={figure.label} label={figure.label} value={figure.value} hint={figure.hint} />
        ))}
      </dl>
      <div className="-mx-4 -mb-4 border-t px-4">{sisters}</div>
    </Panel>
  );
}
