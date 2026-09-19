import Link from "next/link";

import { CompanyAvatar } from "@/components/grifo/company-avatar";
import { Panel } from "@/components/grifo/panel";
import { StatusDot } from "@/components/grifo/status-badge";
import { cn } from "@/lib/core/utils";
import { formatPercent, formatScore, formatSigned } from "@/lib/features/portfolio/format";
import type { GroupAdjustment, GroupPeer } from "@/lib/features/portfolio/types";

/**
 * Bloque D de SOURCE §1.7. La asimetría (decisión #16) es lo que hay que dejar
 * claro: el grupo solo avala si tiene con qué, pero arrastra siempre.
 */
const PEER_ROW =
  "hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center justify-between gap-3 px-4 py-2 text-left transition-colors duration-150 focus-visible:ring-2 focus-visible:-outline-offset-2 focus-visible:outline-none";

export function GroupPanel({
  group,
  peers,
  month,
  onSelect,
}: {
  group: GroupAdjustment;
  peers: GroupPeer[];
  month: string;
  /** Dentro de la sheet las hermanas se abren en el sitio, sin cambiar de página. */
  onSelect?: (companyId: string) => void;
}) {
  const helps = group.adjustment > 0;
  const neutral = Math.abs(group.adjustment) < 0.5;

  return (
    <Panel
      title="Efecto del grupo"
      description={
        neutral
          ? "El grupo no mueve el score de forma apreciable este mes."
          : helps
            ? "El resto del grupo tiene capacidad y tira del score hacia arriba."
            : "El resto del grupo está peor y arrastra el score hacia abajo."
      }
      bodyClassName="p-0"
    >
      <dl className="grid grid-cols-3 gap-4 px-4 py-3">
        <div>
          <dt className="text-muted-foreground text-xs">Ajuste</dt>
          <dd
            className={cn(
              "mt-0.5 text-lg font-semibold tabular-nums",
              neutral
                ? ""
                : helps
                  ? "text-status-healthy-fg"
                  : "text-status-risk-fg",
            )}
          >
            {formatSigned(group.adjustment)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Peso del grupo</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatPercent(group.weight, 0)}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground text-xs">Su peso dentro</dt>
          <dd className="mt-0.5 text-lg font-semibold tabular-nums">
            {formatPercent(group.share, 0)}
          </dd>
        </div>
      </dl>

      <p className="text-muted-foreground border-t px-4 py-2.5 text-xs text-pretty">
        Interdependencia {formatPercent(group.interdependence, 0)} y capacidad de aval{" "}
        {group.support.toLocaleString("es-ES", { maximumFractionDigits: 1 })}× sobre una nota media
        del resto del grupo de {formatScore(group.peerScore)}.
      </p>

      <ul className="divide-y border-t">
        {peers.map((peer) => {
          const content = (
            <>
              <span className="flex min-w-0 items-center gap-2">
                <CompanyAvatar companyId={peer.id} size="sm" className="shrink-0" />
                <StatusDot estado={peer.estado} />
                <span className="truncate font-mono text-sm">{peer.id}</span>
              </span>
              <span className="text-muted-foreground shrink-0 text-sm tabular-nums">
                {formatScore(peer.score)}
              </span>
            </>
          );
          return (
            <li key={peer.id}>
              {onSelect ? (
                <button type="button" className={PEER_ROW} onClick={() => onSelect(peer.id)}>
                  {content}
                </button>
              ) : (
                <Link href={`/cartera/${peer.id}?mes=${month}`} className={PEER_ROW}>
                  {content}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}
