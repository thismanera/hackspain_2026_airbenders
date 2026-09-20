"use client";

import { Bell, BellRing, Clock, TrendingDown, TrendingUp } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { ShowMore, useVisibleRows } from "@/components/grifo/show-more";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import { MoneyDelta } from "@/components/grifo/table-figures";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatMonthLong } from "@/lib/features/portfolio/format";
import { useAlerts, useAlertsState, useSheetState } from "@/lib/features/portfolio/hooks";
import type { AlertItem } from "@/lib/features/portfolio/types";

const DIRECTIONS = ["todas", "deterioro", "mejora"] as const;
type Direction = (typeof DIRECTIONS)[number];

function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

function AlertIdentity({
  alert,
  onOpen,
}: {
  alert: AlertItem;
  onOpen: (companyId: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 leading-tight">
      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <button
          type="button"
          onClick={() => onOpen(alert.company)}
          className="focus-visible:ring-ring rounded-sm font-mono text-sm font-medium after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
        >
          {alert.company}
        </button>
        {alert.severity === "critica" ? (
          <span className="bg-status-risk-surface text-status-risk-fg rounded-full px-1.5 py-px text-xs font-medium">
            Crítica
          </span>
        ) : null}
      </span>
      <span className="text-sm text-pretty">{alert.label}</span>
    </div>
  );
}

function AlertRow({ alert, onOpen }: { alert: AlertItem; onOpen: (companyId: string) => void }) {
  return (
    <TableRow className="hover:bg-muted/40 relative">
      <TableCell className="px-5 py-3 whitespace-normal">
        <AlertIdentity alert={alert} onOpen={onOpen} />
      </TableCell>
      <TableCell className="px-4 py-3 text-right">
        <MoneyDelta amount={alert.limit} previous={alert.previousLimit} />
      </TableCell>
      <TableCell className="px-5 py-3 text-right">
        <ActionBadge action={alert.action} />
      </TableCell>
    </TableRow>
  );
}

export function AlertasClient() {
  const [state, setState] = useAlertsState();
  const { data } = useAlerts(state.mes);
  const [, setSheet] = useSheetState();

  const filtered =
    state.direccion === "todas"
      ? data.items
      : data.items.filter((item) => item.direction === state.direccion);
  const {
    visible: items,
    hidden,
    showMore,
    showAll,
  } = useVisibleRows(filtered, `${data.month}|${state.direccion}`);
  const anticipated = data.items.filter((item) => item.leadMonths > 0);
  const avgLead = anticipated.length
    ? anticipated.reduce((sum, item) => sum + item.leadMonths, 0) / anticipated.length
    : null;

  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Qué hace la línea este mes"
        description={`${data.items.length} señales a cierre de ${formatMonthLong(data.month)}.`}
        aside={
          <ToggleGroup
            variant="outline"
            size="sm"
            spacing={0}
            value={[state.direccion]}
            onValueChange={(value: string[]) => {
              const next = value[0];
              if (next !== undefined && isDirection(next)) void setState({ direccion: next });
            }}
            aria-label="Dirección de las alertas"
          >
            <ToggleGroupItem value="todas">Todas</ToggleGroupItem>
            <ToggleGroupItem value="deterioro">Deterioro</ToggleGroupItem>
            <ToggleGroupItem value="mejora">Mejora</ToggleGroupItem>
          </ToggleGroup>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={TrendingDown}
          label="Deterioro"
          value={data.byDirection.deterioro}
          tone="watch"
        />
        <StatCard icon={TrendingUp} label="Mejora" value={data.byDirection.mejora} tone="healthy" />
        <StatCard
          icon={BellRing}
          label="Críticas"
          value={data.bySeverity.critica}
          tone={data.bySeverity.critica > 0 ? "risk" : "neutral"}
        />
        <StatCard
          icon={Clock}
          label="Anticipación media"
          value={avgLead === null ? "—" : avgLead.toFixed(1)}
          unit={avgLead === null ? undefined : "meses"}
        />
      </div>

      {filtered.length === 0 ? (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell aria-hidden />
            </EmptyMedia>
            <EmptyTitle>
              {state.direccion === "todas"
                ? "No hay alertas este mes"
                : state.direccion === "deterioro"
                  ? "No hay deterioro este mes"
                  : "No hay mejora este mes"}
            </EmptyTitle>
            <EmptyDescription>Prueba el otro filtro o cambia de mes.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <div className="bg-card hidden overflow-hidden rounded-xl border lg:block">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="px-5">Empresa</TableHead>
                  <TableHead className="px-4 text-right">Cambio</TableHead>
                  <TableHead className="px-5 text-right">Recomendación</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onOpen={openCompany} />
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="flex flex-col gap-2 lg:hidden">
            {items.map((alert) => (
              <li key={alert.id} className="bg-card relative rounded-xl border px-5 py-3">
                <AlertIdentity alert={alert} onOpen={openCompany} />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <MoneyDelta amount={alert.limit} previous={alert.previousLimit} />
                  <ActionBadge action={alert.action} />
                </div>
              </li>
            ))}
          </ul>

          <ShowMore hidden={hidden} onMore={showMore} onAll={showAll} noun="alertas" />
        </>
      )}

      <EntitySheet month={data.month} />
    </div>
  );
}
