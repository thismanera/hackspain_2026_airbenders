"use client";

import { useSuspenseQueries } from "@tanstack/react-query";
import { Pause, Play, Search } from "lucide-react";
import { Suspense, useState, useTransition } from "react";

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
import { useCompareState, usePeers, useSheetState } from "@/lib/features/portfolio/hooks";
import { fetchCompanyFile, portfolioKeys } from "@/lib/features/portfolio/queries";
import { COMPARE_SLOTS } from "@/lib/features/portfolio/search-params";

/**
 * Lo que depende de las fichas de las empresas elegidas. Vive en su propio
 * Suspense para que pedir una ficha nueva no apague el cubo.
 */
function Comparison({
  ids,
  month,
  onToggle,
  onOpen,
  onAdd,
}: {
  ids: string[];
  month: string;
  onToggle: (companyId: string) => void;
  onOpen: (companyId: string) => void;
  onAdd: () => void;
}) {
  const results = useSuspenseQueries({
    queries: ids.map((companyId) => ({
      queryKey: portfolioKeys.company(companyId, month),
      queryFn: () => fetchCompanyFile(companyId, month),
      staleTime: 60 * 60 * 1000,
    })),
  });
  const files = results.map((result) => result.data);

  return (
    <>
      <div className="grid gap-3 md:grid-cols-3">
        {files.map((file, index) => (
          <Slot
            key={file.company.id}
            file={file}
            color={SERIES[index]}
            onRemove={() => onToggle(file.company.id)}
            onOpen={() => onOpen(file.company.id)}
          />
        ))}
        {files.length < COMPARE_SLOTS ? <EmptySlot index={files.length} onAdd={onAdd} /> : null}
      </div>
      {files.length >= 2 ? (
        <>
          <CompareTrend files={files} month={month} />
          <CompareTable files={files} />
        </>
      ) : null}
    </>
  );
}

function ComparisonSkeleton({ count }: { count: number }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: Math.min(COMPARE_SLOTS, count + 1) }, (_, index) => (
        <Skeleton key={index} className="h-40 rounded-xl" />
      ))}
    </div>
  );
}

export function ParesClient() {
  const [, startTransition] = useTransition();
  const [state, setState] = useCompareState(startTransition);
  const [, setSheet] = useSheetState();
  const [pickerOpen, setPickerOpen] = useState(false);
  const ids = state.empresas.slice(0, COMPARE_SLOTS);

  const { data: peers } = usePeers(state.mes, "partner");
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
        aside={
          <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
            <Search aria-hidden className="size-4" />
            Buscar empresa
          </Button>
        }
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

      {ids.length > 0 ? (
        <Suspense fallback={<ComparisonSkeleton count={ids.length} />}>
          <Comparison
            ids={ids}
            month={state.mes}
            onToggle={toggle}
            onOpen={openCompany}
            onAdd={() => setPickerOpen(true)}
          />
        </Suspense>
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
