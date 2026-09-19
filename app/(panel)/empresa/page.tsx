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
import { getBenchmark, getCompanyFile, getPeerMap } from "@/lib/features/portfolio/source";
import type {
  BenchmarkResponse,
  CompanyFileResponse,
  PeerMapResponse,
} from "@/lib/features/portfolio/types";
import { loadPymeSearchParams } from "@/lib/features/portfolio/search-params";

import { EmpresaClient } from "./empresa-client";

export const metadata: Metadata = {
  description: "Lo que ve la empresa: su score, cómo se compara y qué tiene preaprobado.",
};

export default async function EmpresaPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const state = await loadPymeSearchParams(searchParams);
  // Misma fuente que la ficha del partner: el score que ve la empresa y el que
  // ve el analista tienen que ser el mismo número.
  const result = await withEngine(
    async (): Promise<
      [CompanyFileResponse | null, BenchmarkResponse | null, PeerMapResponse | null]
    > =>
      state.empresa
        ? Promise.all([
            getCompanyFile(state.empresa, state.mes),
            getBenchmark(state.empresa, state.mes),
            getPeerMap({ month: state.mes, scope: "embat", company: state.empresa }),
          ])
        : [null, null, null],
  );
  if (result.status === "ok" && state.empresa && (!result.data[0] || !result.data[1])) {
    redirect(`/empresa?mes=${state.mes}`);
  }

  const queryClient = getQueryClient();
  if (result.status === "ok" && result.data[0] && result.data[1] && result.data[2]) {
    const [file, benchmark, peers] = result.data;
    queryClient.setQueryData(portfolioKeys.company(state.empresa, state.mes), file);
    queryClient.setQueryData(portfolioKeys.benchmark(state.empresa, state.mes), benchmark);
    queryClient.setQueryData(portfolioKeys.peers(state.mes, "embat", state.empresa), peers);
  }

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <PageHeader
        crumbs={[{ label: "Cartera", href: "/cartera" }, { label: "Mi score" }]}
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
            <EmpresaClient />
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
