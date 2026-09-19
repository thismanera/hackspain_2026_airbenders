import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { ExportButton } from "@/components/grifo/export-button";
import { GlobalSearch } from "@/components/grifo/global-search";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { fetchPortfolio, portfolioKeys } from "@/lib/features/portfolio/queries";
import { loadPortfolioSearchParams } from "@/lib/features/portfolio/search-params";

import { CarteraClient } from "./cartera-client";

export const metadata: Metadata = {
  title: "Cartera · Embat Flow",
  description: "Estado de crédito de la cartera, empresa a empresa, mes a mes.",
};

export default async function CarteraPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const filters = await loadPortfolioSearchParams(searchParams);

  const queryClient = getQueryClient();
  void queryClient.prefetchQuery({
    queryKey: portfolioKeys.list(filters),
    queryFn: () =>
      fetchPortfolio(filters, process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera" }]}
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            <GlobalSearch />
            <MonthSelect />
            <ExportButton />
          </Suspense>
        }
      />

      <main className="flex flex-col gap-4 p-4 md:p-6">
        <Suspense fallback={<CarteraSkeleton />}>
          <CarteraClient />
        </Suspense>
      </main>
    </HydrationBoundary>
  );
}

/**
 * El esqueleto tiene la forma de lo que va a llegar (banda de resumen, barra de
 * filtros, filas de tabla) para que la página no dé un salto al hidratar.
 */
function CarteraSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-36 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 rounded-xl lg:col-span-2" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-8 w-36" />
      </div>
      <div className="bg-card overflow-hidden rounded-xl border">
        <Skeleton className="h-10 rounded-none" />
        {Array.from({ length: 10 }, (_, index) => (
          <div key={index} className="flex items-center gap-4 border-t px-4 py-3">
            <Skeleton className="h-8 flex-1" />
            <Skeleton className="h-5 w-20" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-5 w-28" />
          </div>
        ))}
      </div>
    </div>
  );
}
