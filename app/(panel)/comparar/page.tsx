import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { SearchParams } from "nuqs/server";
import { Suspense } from "react";

import { GlobalSearch } from "@/components/grifo/global-search";
import { MonthSelect } from "@/components/grifo/month-select";
import { PageHeader } from "@/components/grifo/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { getQueryClient } from "@/lib/core/react-query";
import { portfolioKeys } from "@/lib/features/portfolio/queries";
import { getCompanyFile } from "@/lib/features/portfolio/source";
import { loadCompareSearchParams } from "@/lib/features/portfolio/search-params";

import { CompararClient } from "./comparar-client";

export const metadata: Metadata = {
  description: "Hasta tres empresas lado a lado: score, decisión, límite y precio.",
};

export default async function CompararPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const state = await loadCompareSearchParams(searchParams);
  const files = new Map(
    state.empresas.map((companyId) => [companyId, getCompanyFile(companyId, state.mes)]),
  );
  const valid = state.empresas.filter((companyId) => files.get(companyId) !== null);
  if (valid.length !== state.empresas.length) {
    const params = new URLSearchParams({ mes: state.mes });
    if (valid.length > 0) params.set("empresas", valid.join(","));
    redirect(`/comparar?${params}`);
  }

  const queryClient = getQueryClient();
  for (const companyId of files.keys()) {
    const file = files.get(companyId);
    if (file) queryClient.setQueryData(portfolioKeys.company(companyId, state.mes), file);
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
        <Suspense fallback={<PageSkeleton />}>
          <CompararClient />
        </Suspense>
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
