import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { EngineUnavailable } from "@/components/grifo/engine-unavailable";
import { GlobalSearch } from "@/components/grifo/global-search";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { withEngine } from "@/lib/features/portfolio/prefetch";
import { portfolioKeys } from "@/lib/features/portfolio/queries";
import { getAlerts } from "@/lib/features/portfolio/source";
import { loadAlertsSearchParams } from "@/lib/features/portfolio/search-params";

import { AlertasClient } from "./alertas-client";

export const metadata: Metadata = {
  description: "Señales de deterioro y de mejora, fechadas desde que se vieron venir.",
};

export default async function AlertasPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const state = await loadAlertsSearchParams(searchParams);

  const result = await withEngine(() => getAlerts(state.mes));
  const queryClient = getQueryClient();
  if (result.status === "ok") {
    queryClient.setQueryData(portfolioKeys.alerts(state.mes), result.data);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: "/cartera" }, { label: "Alertas" }]}
        actions={
          <Suspense fallback={<Skeleton className="h-8 w-56" />}>
            <GlobalSearch />
            <MonthSelect />
          </Suspense>
        }
      />
      <main className="flex flex-col gap-4 p-4 md:p-6">
        {result.status === "unavailable" ? (
          <EngineUnavailable />
        ) : (
          <Suspense fallback={<PageSkeleton />}>
            <AlertasClient />
          </Suspense>
        )}
      </main>
    </HydrationBoundary>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-16 w-2/3" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}
