"use client";

import { Pause, Play, Search } from "lucide-react";
import { useState, useTransition } from "react";

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
import { Skeleton } from "@/components/ui/skeleton";
import { CALENDAR } from "@/lib/features/portfolio/calendar";
import { formatMonthShort } from "@/lib/features/portfolio/format";
import {
  useCompanyFiles,
  useCompareState,
  usePeers,
  useSheetState,
} from "@/lib/features/portfolio/hooks";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";
import type { CompanyFileResponse } from "@/lib/features/portfolio/types";

export function ParesClient() {
  const [, startTransition] = useTransition();
  const [state, setState] = useCompareState(startTransition);
  const [, setSheet] = useSheetState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = state.empresas.slice(0, COMPARE_SLOTS);

  const { data: peers } = usePeers(state.mes, "partner");
  const fileQueries = useCompanyFiles(ids, state.mes);
  const { playing, toggle: togglePlayer } = useMonthPlayer(CALENDAR);

  const toggle = (companyId: string) =>
    void setState({
      empresas: ids.includes(companyId)
        ? ids.filter((id) => id !== companyId)
        : [...ids, companyId].slice(0, COMPARE_SLOTS),
    });
  const openCompany = (companyId: string) =>
    void setSheet({ empresa: companyId, grupo: "", pestana: "decision" });

  // Solo las fichas que ya han llegado entran en el gráfico y la tabla; el hueco
  // de la que falta se pinta como esqueleto en su slot, sin tocar el resto.
  const loaded = fileQueries
    .map((query) => query.data)
    .filter((file): file is CompanyFileResponse => file !== undefined);

  return (
    <div className="flex flex-col gap-4">
      <PageIntro
        title="Empresas parecidas"
        description="Cada punto es una empresa por sus 14 variables; la estela, sus últimos 12 meses. Gira el cubo y pulsa hasta tres para compararlas."
        aside={
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Search aria-hidden className="size-4" />
            Buscar empresa
          </Button>
        }
      />

      {peers ? (
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
      ) : (
        <Skeleton className="h-[32rem] rounded-xl" />
      )}

      {ids.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-3">
          {ids.map((companyId, index) => {
            const file = fileQueries[index]?.data;
            return file ? (
              <Slot
                key={companyId}
                file={file}
                color={SERIES[index]}
                onRemove={() => toggle(companyId)}
                onOpen={() => openCompany(companyId)}
              />
            ) : (
              <Skeleton key={companyId} className="h-40 rounded-xl" />
            );
          })}
          {ids.length < COMPARE_SLOTS ? (
            <EmptySlot index={ids.length} onAdd={() => setPickerOpen(true)} />
          ) : null}
        </div>
      ) : null}

      {loaded.length >= 2 ? (
        <>
          <CompareTrend files={loaded} month={state.mes} />
          <CompareTable files={loaded} />
        </>
      ) : null}

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
