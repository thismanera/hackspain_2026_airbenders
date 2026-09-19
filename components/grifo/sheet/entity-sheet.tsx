"use client";

import { SearchX } from "lucide-react";
import { Component, Suspense, type ReactNode } from "react";

import { CompanySheet } from "@/components/grifo/sheet/company-sheet";
import { GroupSheet } from "@/components/grifo/group/group-sheet";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { useSheetState } from "@/lib/features/portfolio/hooks";
import type { SheetTab } from "@/lib/features/portfolio/search-params";

class SheetErrorBoundary extends Component<
  { children: ReactNode; onClose: () => void; resetKey: string },
  { error: Error | null; resetKey: string }
> {
  state: { error: Error | null; resetKey: string } = { error: null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error: Error | null; resetKey: string },
  ) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col p-5">
        <SheetTitle className="sr-only">No encontrado</SheetTitle>
        <SheetDescription className="sr-only">{this.state.error.message}</SheetDescription>
        <Empty className="flex-1">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchX aria-hidden />
            </EmptyMedia>
            <EmptyTitle>{this.state.error.message}</EmptyTitle>
            <EmptyDescription>
              Comprueba el identificador o vuelve a la cartera para elegir otra empresa.
            </EmptyDescription>
          </EmptyHeader>
          <Button variant="outline" size="sm" onClick={this.props.onClose}>
            Cerrar
          </Button>
        </Empty>
      </div>
    );
  }
}

/** Con la forma del contenido que viene: cabecera, pestañas y tres paneles. */
function SheetSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy>
      <SheetTitle className="sr-only">Cargando ficha</SheetTitle>
      <SheetDescription className="sr-only">Recuperando los datos del mes.</SheetDescription>
      <div className="flex flex-col gap-3 border-b px-5 pt-5 pb-3">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-3 w-64" />
        <div className="mt-2 flex gap-4">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-12" />
        </div>
      </div>
      <div className="flex flex-col gap-4 px-5 py-4">
        <Skeleton className="h-36 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-56 rounded-xl" />
      </div>
    </div>
  );
}

/**
 * La ficha encima de la cartera. Empresa y grupo comparten la misma hoja: pasar
 * de una hermana a otra o de la empresa a su grupo cambia el contenido sin
 * cerrar nada, y la URL siempre dice qué hay abierto.
 */
export function EntitySheet({ month }: { month: string }) {
  const [state, setState] = useSheetState();
  const open = state.empresa !== "" || state.grupo !== "";

  const close = () => void setState({ empresa: "", grupo: "", pestana: "decision" });
  const openCompany = (companyId: string) =>
    void setState({ empresa: companyId, grupo: "", pestana: "decision" });
  const openGroup = (groupId: string) =>
    void setState({ empresa: "", grupo: groupId, pestana: "decision" });
  const setTab = (tab: SheetTab) => void setState({ pestana: tab }, { history: "replace" });

  const resetKey = `${state.empresa}|${state.grupo}|${month}`;

  return (
    <Sheet open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <SheetContent side="right" className="w-full gap-0 p-0 data-[side=right]:sm:max-w-3xl">
        <SheetErrorBoundary onClose={close} resetKey={resetKey}>
          <Suspense fallback={<SheetSkeleton />}>
            {state.grupo !== "" ? (
              <GroupSheet
                groupId={state.grupo}
                month={month}
                tab={state.pestana}
                onTabChange={setTab}
                onOpenCompany={openCompany}
              />
            ) : state.empresa !== "" ? (
              <CompanySheet
                companyId={state.empresa}
                month={month}
                tab={state.pestana}
                onTabChange={setTab}
                onOpenCompany={openCompany}
                onOpenGroup={openGroup}
              />
            ) : null}
          </Suspense>
        </SheetErrorBoundary>
      </SheetContent>
    </Sheet>
  );
}
