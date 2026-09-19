import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
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
import { getCompanyFile, getPeerMap } from "@/lib/features/portfolio/source";
import { loadCompareSearchParams } from "@/lib/features/portfolio/search-params";

import { ParesClient } from "./pares-client";

export const metadata: Metadata = {
  title: "Pares · Embat Flow",
  description: "Empresas parecidas y sus trayectorias; hasta tres lado a lado.",
};

export default async function ParesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const state = await loadCompareSearchParams(searchParams);
  const result = await withEngine(() =>
    Promise.all([
      getPeerMap({ month: state.mes, scope: "partner" }),
      Promise.all(
        state.empresas.map(
          async (companyId) => [companyId, await getCompanyFile(companyId, state.mes)] as const,
        ),
      ),
    ]),
  );

  const queryClient = getQueryClient();
  if (result.status === "ok") {
    const [peers, files] = result.data;
    const valid = files.filter(([, file]) => file !== null);
    if (valid.length !== state.empresas.length) {
      const params = new URLSearchParams({ mes: state.mes });
      if (valid.length > 0) params.set("empresas", valid.map(([id]) => id).join(","));
      redirect(`/pares?${params}`);
    }
    queryClient.setQueryData(portfolioKeys.peers(state.mes, "partner"), peers);
    for (const [companyId, file] of valid) {
      queryClient.setQueryData(portfolioKeys.company(companyId, state.mes), file);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: "/cartera" }, { label: "Pares" }]}
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
            <ParesClient />
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
      <Skeleton className="h-[32rem] rounded-xl" />
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-40 rounded-xl" />
        ))}
      </div>
    </div>
  );
}
