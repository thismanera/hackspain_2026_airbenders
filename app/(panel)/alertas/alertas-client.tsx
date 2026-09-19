"use client";

import { Bell, BellRing, ChevronRight, Clock, TrendingDown, TrendingUp } from "lucide-react";

import { ActionBadge } from "@/components/grifo/action-badge";
import { PageIntro, StatCard } from "@/components/grifo/stat-card";
import { StatusBadge } from "@/components/grifo/status-badge";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/core/utils";
import {
  formatEuros,
  formatMonthLong,
  formatMonthShort,
  formatScore,
} from "@/lib/features/portfolio/format";
import { useAlerts, useAlertsState, useSheetState } from "@/lib/features/portfolio/hooks";
import { indicator } from "@/lib/features/portfolio/indicators";
import type { AlertItem } from "@/lib/features/portfolio/types";

const DIRECTIONS = ["todas", "deterioro", "mejora"] as const;
type Direction = (typeof DIRECTIONS)[number];

function isDirection(value: string): value is Direction {
  return (DIRECTIONS as readonly string[]).includes(value);
}

function LeadCell({ alert }: { alert: AlertItem }) {
  if (alert.leadMonths === 0) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums">
        {formatMonthShort(alert.confirmedMonth)}, sin aviso previo
      </span>
    );
  }
  return (
    <span className="flex flex-col text-xs leading-tight tabular-nums">
      <span className="inline-flex items-center gap-1 font-medium">
        <Clock aria-hidden className="size-3" />
        {alert.leadMonths} {alert.leadMonths === 1 ? "mes" : "meses"} antes
      </span>
      <span className="text-muted-foreground">
        {formatMonthShort(alert.onsetMonth)} → {formatMonthShort(alert.confirmedMonth)}
      </span>
    </span>
  );
}

function LimitChange({ alert }: { alert: AlertItem }) {
  if (alert.limit === alert.previousLimit) {
    return (
      <span className="text-muted-foreground text-xs tabular-nums">{formatEuros(alert.limit)}</span>
    );
  }
  return (
    <span className="flex flex-col items-end text-xs leading-tight tabular-nums">
      <span className="font-medium">{formatEuros(alert.limit)}</span>
      <span className="text-muted-foreground">antes {formatEuros(alert.previousLimit)}</span>
    </span>
  );
}

function AlertRow({ alert, onOpen }: { alert: AlertItem; onOpen: (companyId: string) => void }) {
  const deterioro = alert.direction === "deterioro";
  const Icon = deterioro ? TrendingDown : TrendingUp;
  const ind = alert.indicator ? indicator(alert.indicator) : undefined;

  return (
    <li className="hover:bg-muted/40 relative flex flex-col gap-3 px-4 py-3 transition-colors duration-150 sm:flex-row sm:items-center">
      <span
        aria-hidden
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          deterioro
            ? alert.severity === "critica"
              ? "bg-status-risk-surface text-status-risk-fg"
              : "bg-status-watch-surface text-status-watch-fg"
            : "bg-status-healthy-surface text-status-healthy-fg",
        )}
      >
        <Icon className="size-4" strokeWidth={2} />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5 leading-tight">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <button
            type="button"
            onClick={() => onOpen(alert.company)}
            className="focus-visible:ring-ring rounded-sm font-mono text-sm font-medium after:absolute after:inset-0 focus-visible:ring-2 focus-visible:outline-none"
          >
            {alert.company}
          </button>
          <span className="text-muted-foreground font-mono text-xs">{alert.groupId}</span>
          {alert.severity === "critica" ? (
            <span className="bg-status-risk-surface text-status-risk-fg rounded-full px-1.5 py-px text-xs font-medium">
              Crítica
            </span>
          ) : null}
        </span>
        <span className="text-sm text-pretty">{alert.label}</span>
        {ind ? <span className="text-muted-foreground text-xs">{ind.label}</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:w-[46%] sm:grid-cols-[1.4fr_1fr_1fr_1fr] sm:items-center">
        <LeadCell alert={alert} />
        <span className="flex items-center gap-2 sm:justify-end">
          <span className="text-sm font-medium tabular-nums">{formatScore(alert.score)}</span>
          <StatusBadge estado={alert.estado} />
        </span>
        <span className="sm:justify-self-end">
          <ActionBadge action={alert.action} />
        </span>
        <span className="justify-self-end">
          <LimitChange alert={alert} />
        </span>
      </div>
      <ChevronRight aria-hidden className="text-muted-foreground hidden size-4 shrink-0 sm:block" />
    </li>
  );
}

export function AlertasClient() {
  const [state, setState] = useAlertsState();
  const { data } = useAlerts(state.mes);
  const [, setSheet] = useSheetState();

  const items =
    state.direccion === "todas"
      ? data.items
      : data.items.filter((item) => item.direction === state.direccion);
  const anticipated = data.items.filter((item) => item.leadMonths > 0);
  const avgLead = anticipated.length
    ? anticipated.reduce((sum, item) => sum + item.leadMonths, 0) / anticipated.length
    : null;

  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Lo que cambia, con fecha de cuándo se vio venir"
        description={
          <>
            {data.items.length} señales a cierre de {formatMonthLong(data.month)}, deterioro y
            mejora con la misma vara.
          </>
        }
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
          hint={`${data.bySeverity.critica} críticas · ${data.bySeverity.aviso} avisos`}
        />
        <StatCard
          icon={TrendingUp}
          label="Mejora"
          value={data.byDirection.mejora}
          tone="healthy"
          hint="Subidas de banda y líneas que se abren o amplían"
        />
        <StatCard
          icon={BellRing}
          label="Críticas"
          value={data.bySeverity.critica}
          tone={data.bySeverity.critica > 0 ? "risk" : "neutral"}
          hint="Impago, concentración o liquidez por debajo del umbral"
        />
        <StatCard
          icon={Clock}
          label="Anticipación media"
          value={avgLead === null ? "—" : avgLead.toFixed(1)}
          unit={avgLead === null ? undefined : "meses"}
          hint={
            anticipated.length
              ? `${anticipated.length} de ${data.items.length} señales ya se veían meses antes`
              : "Ninguna señal con recorrido previo este mes"
          }
        />
      </div>

      {items.length === 0 ? (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Bell aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Sin señales de {state.direccion} este mes</EmptyTitle>
            <EmptyDescription>Cambia el mes o mira la otra dirección.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="bg-card divide-y overflow-hidden rounded-xl border">
          {items.map((alert) => (
            <AlertRow key={alert.id} alert={alert} onOpen={openCompany} />
          ))}
        </ul>
      )}

      <EntitySheet month={data.month} />
    </div>
  );
}
