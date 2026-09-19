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
 * Las cuatro cifras van en una sola fila; las hermanas, en su card. El
 * titular TellMe ya dice si el grupo tira o arrastra: aquí solo el número.
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
    },
    { label: "Peso del grupo", value: formatPercent(group.weight, 0) },
    { label: "Su peso", value: formatPercent(group.share, 0) },
    { label: "Interdependencia", value: formatPercent(group.interdependence, 0) },
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

  const row = (
    <section aria-label="Cifras del grupo" className="bg-card rounded-xl border px-4 py-3">
      <dl className="grid grid-cols-4 gap-x-3">
        {figures.map((figure) => (
          <Figure key={figure.label} label={figure.label} value={figure.value} />
        ))}
      </dl>
    </section>
  );

  if (cards) {
    return (
      <>
        {row}
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
    <>
      {row}
      <Panel
        title={peers.length === 1 ? "Su hermana" : "Sus hermanas"}
        bodyClassName="px-4 pt-0 pb-1"
      >
        {sisters}
      </Panel>
    </>
  );
}
