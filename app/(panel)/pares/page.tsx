import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { PORTFOLIO_PICKER_FILTERS } from "@/components/grifo/company-picker";
import { EngineUnavailable } from "@/components/grifo/engine-unavailable";
import { GlobalSearch } from "@/components/grifo/global-search";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { withEngine } from "@/lib/features/portfolio/prefetch";
import { portfolioKeys } from "@/lib/features/portfolio/queries";
import { getCompanyFile, getPortfolio } from "@/lib/features/portfolio/source";
import { loadCompareSearchParams } from "@/lib/features/portfolio/search-params";

import { ParesClient } from "./pares-client";

export const metadata: Metadata = {
  title: "Comparar · Embat Flow",
  description: "Hasta tres empresas lado a lado: score, decisión, límite y precio.",
};

export default async function ParesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const state = await loadCompareSearchParams(searchParams);
  const portfolioFilters = { ...PORTFOLIO_PICKER_FILTERS, mes: state.mes };
  const result = await withEngine(async () => {
    const [files, portfolio] = await Promise.all([
      Promise.all(
        state.empresas.map(
          async (companyId) => [companyId, await getCompanyFile(companyId, state.mes)] as const,
        ),
      ),
      getPortfolio({ month: state.mes }),
    ]);
    return { files, portfolio };
  });

  const queryClient = getQueryClient();
  if (result.status === "ok") {
    const { files, portfolio } = result.data;
    queryClient.setQueryData(portfolioKeys.list(portfolioFilters), portfolio);
    const valid = files.filter(([, file]) => file !== null);
    if (valid.length !== state.empresas.length) {
      const params = new URLSearchParams({ mes: state.mes });
      if (valid.length > 0) params.set("empresas", valid.map(([id]) => id).join(","));
      redirect(`/pares?${params}`);
    }
    for (const [companyId, file] of valid) {
      queryClient.setQueryData(portfolioKeys.company(companyId, state.mes), file);
    }
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: "/cartera" }, { label: "Comparar" }]}
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
          <Suspense fallback={null}>
            <ParesClient />
          </Suspense>
        )}
      </main>
    </HydrationBoundary>
  );
}

