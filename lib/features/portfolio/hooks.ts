"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";

import { fetchCompanyFile, fetchPortfolio, portfolioKeys } from "./queries";
import { portfolioSearchParams, type PortfolioSearchState } from "./search-params";

// El score se recalcula una vez al mes: nada de refetch agresivo. Una hora de
// frescura y un día en caché cubren de sobra una sesión de trabajo.
const SCORING_CADENCE = {
  staleTime: 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
} as const;

export function usePortfolioFilters() {
  return useQueryStates(portfolioSearchParams);
}

export function usePortfolio(filters: PortfolioSearchState) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.list(filters),
    queryFn: () => fetchPortfolio(filters),
    ...SCORING_CADENCE,
  });
}

export function useCompanyFile(companyId: string, month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.company(companyId, month),
    queryFn: () => fetchCompanyFile(companyId, month),
    ...SCORING_CADENCE,
  });
}
