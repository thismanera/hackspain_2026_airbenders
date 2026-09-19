"use client";

import { useSuspenseQueries } from "@tanstack/react-query";
import { Network, Plus, Scale, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { ActionBadge } from "@/components/grifo/action-badge";
import { CompanyPicker } from "@/components/grifo/company-picker";
import { Panel } from "@/components/grifo/panel";
import { PageIntro } from "@/components/grifo/stat-card";
import { StatusBadge } from "@/components/grifo/status-badge";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { TrendDelta } from "@/components/grifo/trend";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/core/utils";
import {
  formatApr,
  formatDays,
  formatEuros,
  formatMonthLong,
  formatMonthShort,
  formatMonthTick,
  formatPercent,
  formatScore,
  formatSigned,
} from "@/lib/features/portfolio/format";
import { useCompareState, useSheetState } from "@/lib/features/portfolio/hooks";
import { BLOCKS, type BlockId } from "@/lib/features/portfolio/indicators";
import { fetchCompanyFile, portfolioKeys } from "@/lib/features/portfolio/queries";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";
import { BANDA, NATURALEZA } from "@/lib/features/portfolio/vocabulary";

const SERIES = ["var(--foreground)", "var(--status-healthy)", "var(--status-watch)"];

function Slot({
  file,
  onRemove,
  onOpen,
}: {
  file: CompanyFileResponse;
  onRemove: () => void;
  onOpen: () => void;
}) {
  const { latest } = file;
  return (
    <div className="bg-card relative flex flex-col gap-3 rounded-xl border p-4">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onOpen}
          className="focus-visible:ring-ring flex flex-col items-start rounded-sm text-left leading-tight focus-visible:ring-2 focus-visible:outline-none"
        >
          <span className="font-mono text-sm font-medium">{file.company.id}</span>
          <span className="text-muted-foreground text-xs">
            {file.company.groupId}
            {file.company.groupSize > 1 ? ` · ${file.company.groupSize} empresas` : ""}
          </span>
        </button>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`Quitar ${file.company.id}`}
        >
          <X aria-hidden className="size-4" />
        </Button>
      </div>
      <div className="flex items-end justify-between gap-3">
        <p className="text-3xl leading-none font-semibold tracking-[-0.02em] tabular-nums">
          {formatScore(latest.score)}
        </p>
        <StatusBadge estado={latest.estado} />
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
        <TrendDelta trend3m={latest.trend3m} direction={latest.direction} />
        <ActionBadge action={latest.decision.action} />
      </div>
    </div>
  );
}

function EmptySlot({ onAdd, index }: { onAdd: () => void; index: number }) {
  return (
    <button
      type="button"
      onClick={onAdd}
      className="text-muted-foreground hover:border-foreground/30 hover:text-foreground focus-visible:ring-ring flex min-h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-sm transition-colors duration-150 focus-visible:ring-2 focus-visible:outline-none"
    >
      <span className="bg-secondary flex size-8 items-center justify-center rounded-lg">
        <Plus aria-hidden className="size-4" />
      </span>
      {index === 0 ? "Elegir la primera empresa" : "Añadir otra empresa"}
    </button>
  );
}

type RowSpec = {
  label: string;
  cell: (file: CompanyFileResponse) => ReactNode;
  /** Valor numérico para resaltar el mejor; `null` desactiva el resalte. */
  best?: (file: CompanyFileResponse) => number | null;
  higherIsBetter?: boolean;
};

const ROWS: RowSpec[] = [
  {
    label: "Score",
    cell: (f) => <span className="font-medium tabular-nums">{formatScore(f.latest.score)}</span>,
    best: (f) => f.latest.score,
    higherIsBetter: true,
  },
  {
    label: "Confianza",
    cell: (f) => <span className="tabular-nums">{formatPercent(f.latest.confidence, 0)}</span>,
  },
  {
    label: "Tendencia 3 m",
    cell: (f) => <TrendDelta trend3m={f.latest.trend3m} direction={f.latest.direction} />,
  },
  {
    label: "Naturaleza",
    cell: (f) => <span className="text-sm">{NATURALEZA[f.latest.nature].label}</span>,
  },
  {
    label: "Banda",
    cell: (f) => (
      <span className="text-sm">
        <span className="font-mono font-medium">{f.latest.decision.band}</span>
        <span className="text-muted-foreground">
          {" "}
          · {BANDA[f.latest.decision.band].description}
        </span>
      </span>
    ),
  },
  {
    label: "Acción",
    cell: (f) => <ActionBadge action={f.latest.decision.action} />,
  },
  {
    label: "Límite",
    cell: (f) => (
      <span className="tabular-nums">
        {f.latest.decision.eligible ? (
          formatEuros(f.latest.decision.limit)
        ) : (
          <span className="text-muted-foreground">Sin línea</span>
        )}
      </span>
    ),
    best: (f) => (f.latest.decision.eligible ? f.latest.decision.limit : null),
    higherIsBetter: true,
  },
  {
    label: "TAE",
    cell: (f) =>
      f.latest.decision.eligible ? (
        <span className="tabular-nums">{formatApr(f.latest.decision.apr)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
    best: (f) => (f.latest.decision.eligible ? f.latest.decision.apr : null),
    higherIsBetter: false,
  },
  {
    label: "Plazo máximo",
    cell: (f) =>
      f.latest.decision.eligible ? (
        <span className="tabular-nums">{formatDays(f.latest.decision.maxTenorDays)}</span>
      ) : (
        <span className="text-muted-foreground">—</span>
      ),
  },
  {
    label: "Puerta que falla",
    cell: (f) => {
      const failed = f.latest.decision.gates.find((gate) => !gate.passed);
      return failed ? (
        <span className="text-sm">{failed.label}</span>
      ) : (
        <span className="text-muted-foreground">Ninguna</span>
      );
    },
  },
  ...(Object.keys(BLOCKS) as BlockId[]).map((block): RowSpec => ({
    label: `Bloque ${block} · ${BLOCKS[block].label}`,
    cell: (f) => <span className="tabular-nums">{formatScore(f.latest.blocks[block])}</span>,
    best: (f) => f.latest.blocks[block],
    higherIsBetter: true,
  })),
  {
    label: "Ajuste de grupo",
    cell: (f) =>
      f.latest.group ? (
        <span className="tabular-nums">
          {formatSigned(f.latest.score - f.latest.standaloneScore)} pts
        </span>
      ) : (
        <span className="text-muted-foreground">Va sola</span>
      ),
  },
  {
    label: "Alertas activas",
    cell: (f) => <span className="tabular-nums">{f.latest.alerts.length}</span>,
    best: (f) => f.latest.alerts.length,
    higherIsBetter: false,
  },
];

function bestIndex(row: RowSpec, files: CompanyFileResponse[]): number | null {
  if (!row.best || files.length < 2) return null;
  const values = files.map((file) => row.best?.(file) ?? null);
  const valid = values.filter((value): value is number => value !== null);
  if (valid.length < 2) return null;
  const target = row.higherIsBetter ? Math.max(...valid) : Math.min(...valid);
  const ties = values.filter((value) => value === target).length;
  return ties === 1 ? values.indexOf(target) : null;
}

/** Cuatro frases, todas sacadas de los números de la tabla. */
function summarize(files: CompanyFileResponse[]): string[] {
  if (files.length < 2) return [];
  const byScore = [...files].sort((a, b) => b.latest.score - a.latest.score);
  const lines = [
    `${byScore[0].company.id} tiene el mejor score (${formatScore(byScore[0].latest.score)}) y ${byScore[byScore.length - 1].company.id} el peor (${formatScore(byScore[byScore.length - 1].latest.score)}).`,
  ];
  const eligible = files.filter((file) => file.latest.decision.eligible);
  if (eligible.length === 0) {
    lines.push("Ninguna tiene línea abierta este mes.");
  } else {
    const widest = [...eligible].sort(
      (a, b) => b.latest.decision.limit - a.latest.decision.limit,
    )[0];
    const cheapest = [...eligible].sort((a, b) => a.latest.decision.apr - b.latest.decision.apr)[0];
    lines.push(
      `${widest.company.id} tiene el límite más alto (${formatEuros(widest.latest.decision.limit)})` +
        (cheapest.company.id === widest.company.id
          ? ` y también el precio más bajo (${formatApr(cheapest.latest.decision.apr)}).`
          : `; ${cheapest.company.id} paga menos (${formatApr(cheapest.latest.decision.apr)}).`),
    );
    if (eligible.length < files.length) {
      lines.push(
        `${files
          .filter((file) => !file.latest.decision.eligible)
          .map((file) => file.company.id)
          .join(" y ")} sin línea.`,
      );
    }
  }
  const worsening = files.filter((file) => file.latest.direction === "deterioro");
  if (worsening.length > 0) {
    lines.push(
      `${worsening.map((file) => file.company.id).join(" y ")} ${worsening.length === 1 ? "se deteriora" : "se deterioran"} a tres meses.`,
    );
  }
  return lines;
}

export function CompararClient() {
  const [state, setState] = useCompareState();
  const [, setSheet] = useSheetState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = state.empresas.slice(0, COMPARE_SLOTS);

  const results = useSuspenseQueries({
    queries: ids.map((companyId) => ({
      queryKey: portfolioKeys.company(companyId, state.mes),
      queryFn: () => fetchCompanyFile(companyId, state.mes),
      staleTime: 60 * 60 * 1000,
    })),
  });
  const files = results.map((result) => result.data);

  const add = (companyId: string) => void setState({ empresas: [...ids, companyId] });
  const remove = (companyId: string) =>
    void setState({ empresas: ids.filter((id) => id !== companyId) });
  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });
  const openGroupFlow = (groupId: string) =>
    void setSheet({ empresa: "", grupo: groupId, pestana: "grupo" });

  const groupIds = new Set(files.map((file) => file.company.groupId));
  const sharedGroup = files.length >= 2 && groupIds.size === 1 ? files[0].company.groupId : null;
  const partialGroups =
    files.length >= 2 && !sharedGroup
      ? [...groupIds].filter(
          (groupId) => files.filter((file) => file.company.groupId === groupId).length > 1,
        )
      : [];

  const months = files.length ? files[0].months : [];
  const chartConfig = Object.fromEntries(
    files.map((file, index) => [file.company.id, { label: file.company.id, color: SERIES[index] }]),
  ) satisfies ChartConfig;
  const chartData = months.map((month, index) => {
    return Object.fromEntries([
      ["month", month],
      ...files.map((file) => {
        const entry = file.history[index];
        return [file.company.id, entry && entry.coverage.observedMonths > 0 ? entry.score : null];
      }),
    ]);
  });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        eyebrow="Comparar"
        title="Tres empresas, los mismos números"
        description={
          <>
            Score, decisión, límite y precio a cierre de {formatMonthLong(state.mes)}, lado a lado.
            Lo que se compara sale del mismo motor que la ficha; aquí no se calcula nada nuevo.
          </>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: COMPARE_SLOTS }, (_, index) => {
          const file = files[index];
          if (file) {
            return (
              <Slot
                key={file.company.id}
                file={file}
                onRemove={() => remove(file.company.id)}
                onOpen={() => openCompany(file.company.id)}
              />
            );
          }
          if (index === files.length) {
            return <EmptySlot key="add" index={index} onAdd={() => setPickerOpen(true)} />;
          }
          return (
            <div
              key={`hueco-${index}`}
              aria-hidden
              className="hidden min-h-40 rounded-xl border border-dashed opacity-40 md:block"
            />
          );
        })}
      </div>

      {sharedGroup ? (
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <Network aria-hidden className="text-muted-foreground size-4" />
            <span>
              {files.length === 2 ? "Las dos" : "Las tres"} son del mismo grupo{" "}
              <span className="font-mono font-medium">{sharedGroup}</span>: lo que le pasa a una
              ajusta el score de las otras.
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={() => openGroupFlow(sharedGroup)}>
            Ver el flujo del grupo
          </Button>
        </div>
      ) : partialGroups.length > 0 ? (
        <div className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <span className="flex items-center gap-2 text-sm">
            <Network aria-hidden className="text-muted-foreground size-4" />
            <span>
              {files
                .filter((file) => file.company.groupId === partialGroups[0])
                .map((file) => file.company.id)
                .join(" y ")}{" "}
              comparten grupo <span className="font-mono font-medium">{partialGroups[0]}</span>.
            </span>
          </span>
          <Button variant="outline" size="sm" onClick={() => openGroupFlow(partialGroups[0])}>
            Ver el flujo del grupo
          </Button>
        </div>
      ) : null}

      {files.length < 2 ? (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Scale aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Elige al menos dos empresas</EmptyTitle>
            <EmptyDescription>
              La comparación se guarda en la URL: puedes pasarle el enlace a quien tenga que
              decidir.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus aria-hidden className="size-4" />
            {files.length === 0 ? "Elegir empresa" : "Añadir la segunda"}
          </Button>
        </Empty>
      ) : (
        <div className="grid gap-4 lg:grid-cols-5">
          <Panel
            title="Lectura"
            description="Qué dice la tabla, en pocas frases."
            className="lg:col-span-2"
          >
            <ul className="flex flex-col gap-2 text-sm text-pretty">
              {summarize(files).map((line) => (
                <li key={line} className="flex gap-2">
                  <span
                    aria-hidden
                    className="bg-foreground/60 mt-2 size-1 shrink-0 rounded-full"
                  />
                  {line}
                </li>
              ))}
            </ul>
          </Panel>

          <Panel
            title="Score en el tiempo"
            description={`Desde que hay datos de cada una hasta ${formatMonthShort(state.mes)}.`}
            className="lg:col-span-3"
          >
            <ChartContainer config={chartConfig} className="aspect-auto h-52 w-full">
              <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="month"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  tickFormatter={formatMonthTick}
                />
                <YAxis
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tickLine={false}
                  axisLine={false}
                  width={28}
                />
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      labelFormatter={(value) => formatMonthShort(String(value))}
                      indicator="line"
                    />
                  }
                />
                {files.map((file) => (
                  <Line
                    key={file.company.id}
                    dataKey={file.company.id}
                    type="monotone"
                    stroke={`var(--color-${file.company.id})`}
                    strokeWidth={1.75}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ChartContainer>
            <ul className="mt-2 flex flex-wrap gap-4 text-xs">
              {files.map((file, index) => (
                <li key={file.company.id} className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="h-0.5 w-4 rounded-full"
                    style={{ background: SERIES[index] }}
                  />
                  <span className="font-mono">{file.company.id}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="bg-card overflow-hidden rounded-xl border lg:col-span-5">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th
                    scope="col"
                    className="text-muted-foreground w-[28%] px-4 py-2.5 text-left text-xs font-medium"
                  >
                    Dato
                  </th>
                  {files.map((file) => (
                    <th
                      key={file.company.id}
                      scope="col"
                      className="px-4 py-2.5 text-left font-mono text-xs font-medium"
                    >
                      {file.company.id}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {ROWS.map((row) => {
                  const best = bestIndex(row, files);
                  return (
                    <tr key={row.label}>
                      <th
                        scope="row"
                        className="text-muted-foreground px-4 py-2.5 text-left text-xs font-normal"
                      >
                        {row.label}
                      </th>
                      {files.map((file, index) => (
                        <td
                          key={file.company.id}
                          className={cn(
                            "px-4 py-2.5 align-middle",
                            best === index && "bg-status-healthy-surface/60",
                          )}
                        >
                          {row.cell(file)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-muted-foreground border-t px-4 py-2 text-xs">
              El fondo teal marca el mejor valor de la fila cuando hay uno solo.
            </p>
          </div>
        </div>
      )}

      <CompanyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        month={state.mes}
        title="Añadir a la comparación"
        chosen={ids}
        onPick={add}
      />
      <EntitySheet month={state.mes} />
    </div>
  );
}
