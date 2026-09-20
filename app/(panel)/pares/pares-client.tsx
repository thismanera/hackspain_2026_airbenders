"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Network, Plus, Scale } from "lucide-react";
import { useState, useTransition } from "react";

import { CompanyPicker, PORTFOLIO_PICKER_FILTERS } from "@/components/grifo/company-picker";
import { CompareTable } from "@/components/grifo/peers/compare-table";
import { CompareTrend } from "@/components/grifo/peers/compare-trend";
import { EmptySlot, Slot } from "@/components/grifo/peers/compare-slots";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { PageIntro } from "@/components/grifo/stat-card";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import {
  formatApr,
  formatEuros,
  formatMonthLong,
  formatScore,
} from "@/lib/features/portfolio/format";
import { useCompanyFiles, useCompareState, useSheetState } from "@/lib/features/portfolio/hooks";
import { fetchCompanyFile, fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

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

export function ParesClient() {
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();
  const [state, setState] = useCompareState(startTransition);
  const [, setSheet] = useSheetState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = state.empresas.slice(0, COMPARE_SLOTS);
  const portfolioFilters = { ...PORTFOLIO_PICKER_FILTERS, mes: state.mes };

  // Precalienta la lista del picker en segundo plano (misma key que el SSR).
  useQuery({
    queryKey: portfolioKeys.list(portfolioFilters),
    queryFn: () => fetchPortfolio(portfolioFilters),
    staleTime: 60 * 60 * 1000,
  });

  const fileQueries = useCompanyFiles(ids, state.mes);
  const loaded = fileQueries
    .map((query) => query.data)
    .filter((file): file is CompanyFileResponse => file !== undefined);

  const add = (companyId: string) => {
    const next = ids.includes(companyId)
      ? ids.filter((id) => id !== companyId)
      : [...ids, companyId].slice(0, COMPARE_SLOTS);
    if (!ids.includes(companyId)) {
      void queryClient.prefetchQuery({
        queryKey: portfolioKeys.company(companyId, state.mes),
        queryFn: () => fetchCompanyFile(companyId, state.mes),
        staleTime: 60 * 60 * 1000,
      });
    }
    void setState({ empresas: next });
  };
  const remove = (companyId: string) =>
    void setState({ empresas: ids.filter((id) => id !== companyId) });
  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });
  const openGroupFlow = (groupId: string) =>
    void setSheet({ empresa: "", grupo: groupId, pestana: "grupo" });

  const groupIds = new Set(loaded.map((file) => file.company.groupId));
  const sharedGroup = loaded.length >= 2 && groupIds.size === 1 ? loaded[0].company.groupId : null;
  const partialGroups =
    loaded.length >= 2 && !sharedGroup
      ? [...groupIds].filter(
          (groupId) => loaded.filter((file) => file.company.groupId === groupId).length > 1,
        )
      : [];

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Comparar empresas"
        description={
          <>Score, decisión, límite y precio a cierre de {formatMonthLong(state.mes)}.</>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: COMPARE_SLOTS }, (_, index) => {
          const companyId = ids[index];
          if (companyId) {
            const file = fileQueries[index]?.data;
            if (file) {
              return (
                <Slot
                  key={companyId}
                  file={file}
                  onRemove={() => remove(companyId)}
                  onOpen={() => openCompany(companyId)}
                />
              );
            }
            return <Skeleton key={companyId} className="h-40 rounded-xl" />;
          }
          if (index === ids.length) {
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
              {loaded.length === 2 ? "Las dos" : "Las tres"} son del mismo grupo{" "}
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
              {loaded
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

      {loaded.length < 2 ? (
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
            {loaded.length === 0 ? "Elegir empresa" : "Añadir la segunda"}
          </Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <ul className="bg-card flex flex-col gap-1.5 rounded-[14px] border px-4 py-3 text-sm text-pretty">
            {summarize(loaded).map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden className="bg-foreground/60 mt-2 size-1 shrink-0 rounded-full" />
                {line}
              </li>
            ))}
          </ul>

          <CompareTrend files={loaded} month={state.mes} />
          <CompareTable files={loaded} />
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
