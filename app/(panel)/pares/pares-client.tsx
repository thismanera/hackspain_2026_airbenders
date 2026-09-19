"use client";

import { useSuspenseQueries } from "@tanstack/react-query";
import { Orbit, Pause, Play, Plus } from "lucide-react";
import { useState } from "react";

import { CompanyPicker } from "@/components/grifo/company-picker";
import { CompareTable } from "@/components/grifo/peers/compare-table";
import { CompareTrend } from "@/components/grifo/peers/compare-trend";
import { EmptySlot, Slot } from "@/components/grifo/peers/compare-slots";
import { PeerSpace } from "@/components/grifo/peers/peer-space";
import { SERIES } from "@/components/grifo/peers/series";
import { EntitySheet } from "@/components/grifo/sheet/entity-sheet";
import { PageIntro } from "@/components/grifo/stat-card";
import { useMonthPlayer } from "@/components/grifo/use-month-player";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { CALENDAR } from "@/lib/features/portfolio/calendar";
import { formatMonthShort } from "@/lib/features/portfolio/format";
import { useCompareState, usePeers, useSheetState } from "@/lib/features/portfolio/hooks";
import { fetchCompanyFile, portfolioKeys } from "@/lib/features/portfolio/queries";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";

export function ParesClient() {
  const [state, setState] = useCompareState();
  const [, setSheet] = useSheetState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = state.empresas.slice(0, COMPARE_SLOTS);

  const { data: peers } = usePeers(state.mes, "partner");
  const results = useSuspenseQueries({
    queries: ids.map((companyId) => ({
      queryKey: portfolioKeys.company(companyId, state.mes),
      queryFn: () => fetchCompanyFile(companyId, state.mes),
      staleTime: 60 * 60 * 1000,
    })),
  });
  const files = results.map((result) => result.data);
  const { playing, toggle: togglePlayer } = useMonthPlayer(CALENDAR);

  const toggle = (companyId: string) =>
    void setState({
      empresas: ids.includes(companyId)
        ? ids.filter((id) => id !== companyId)
        : [...ids, companyId].slice(0, COMPARE_SLOTS),
    });
  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Empresas parecidas"
        description="Cada punto es una empresa por sus 14 variables; la estela, sus últimos 12 meses. Gira el cubo y pulsa hasta tres para compararlas."
      />

      <PeerSpace
        data={peers}
        scope="partner"
        selected={ids}
        onToggle={toggle}
        title={`El espacio de pares a cierre de ${formatMonthShort(state.mes)}`}
        description="Cerca en el cubo = parecidas en los números. Color: estado del mes."
        aside={
          <Button
            variant="outline"
            size="sm"
            onClick={togglePlayer}
            aria-pressed={playing}
            disabled={CALENDAR.length < 2}
          >
            {playing ? (
              <Pause aria-hidden className="size-3.5" />
            ) : (
              <Play aria-hidden className="size-3.5" />
            )}
            {playing ? "Pausar" : "Ver el año"}
          </Button>
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
                color={SERIES[index]}
                onRemove={() => toggle(file.company.id)}
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

      {files.length < 2 ? (
        <Empty className="bg-card rounded-xl border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Orbit aria-hidden />
            </EmptyMedia>
            <EmptyTitle>Elige al menos dos empresas</EmptyTitle>
            <EmptyDescription>
              Púlsalas en el cubo o búscalas por nombre. La comparación se guarda en la URL.
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setPickerOpen(true)}>
            <Plus aria-hidden className="size-4" />
            {files.length === 0 ? "Elegir empresa" : "Añadir la segunda"}
          </Button>
        </Empty>
      ) : (
        <div className="flex flex-col gap-4">
          <CompareTrend files={files} month={state.mes} />
          <CompareTable files={files} />
        </div>
      )}

      <CompanyPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        month={state.mes}
        title="Añadir a la comparación"
        chosen={ids}
        onPick={toggle}
      />
      <EntitySheet month={state.mes} />
    </div>
  );
}
