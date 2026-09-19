"use client";

import { useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";

import { fetchCompanyFile, fetchGroupFile, fetchPortfolio, portfolioKeys } from "./queries";
import {
  portfolioSearchParams,
  sheetSearchParams,
  type PortfolioSearchState,
} from "./search-params";

// El score se recalcula una vez al mes: nada de refetch agresivo. Una hora de
// frescura y un día en caché cubren de sobra una sesión de trabajo.
const SCORING_CADENCE = {
  staleTime: 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
} as const;

export function usePortfolioFilters() {
  return useQueryStates(portfolioSearchParams);
}

/**
 * Qué sheet está abierta y en qué pestaña. Vive en la URL: cerrar y volver
 * atrás deja la cartera exactamente donde estaba, y el enlace se puede pegar.
 * `history: "push"` para que el botón atrás del navegador cierre la sheet.
 */
export function useSheetState() {
  return useQueryStates(sheetSearchParams, { history: "push" });
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

export function useGroupFile(groupId: string, month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.group(groupId, month),
    queryFn: () => fetchGroupFile(groupId, month),
    ...SCORING_CADENCE,
  });
}
