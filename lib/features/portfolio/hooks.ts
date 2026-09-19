"use client";

import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";

import {
  fetchAlerts,
  fetchBacktest,
  fetchBenchmark,
  fetchCompanyFile,
  fetchGroupFile,
  fetchGroups,
  fetchPortfolio,
  fetchReading,
  portfolioKeys,
} from "./queries";
import type { ReadingKind } from "./reading";
import {
  alertsSearchParams,
  compareSearchParams,
  monthSearchParams,
  portfolioSearchParams,
  pymeSearchParams,
  sheetSearchParams,
  type PortfolioSearchState,
} from "./search-params";
import { fetchScoringCompany, scoringKeys } from "@/lib/features/scoring/queries";

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

export function useScoringCompany(companyId: string) {
  return useQuery({
    queryKey: scoringKeys.company(companyId),
    queryFn: () => fetchScoringCompany(companyId),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    retry: false,
  });
}

export function useMonth() {
  return useQueryStates(monthSearchParams);
}

export function useAlertsState() {
  return useQueryStates(alertsSearchParams);
}

export function usePymeState() {
  return useQueryStates(pymeSearchParams);
}

export function useCompareState() {
  return useQueryStates(compareSearchParams);
}

export function useGroups(month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.groups(month),
    queryFn: () => fetchGroups(month),
    ...SCORING_CADENCE,
  });
}

export function useAlerts(month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.alerts(month),
    queryFn: () => fetchAlerts(month),
    ...SCORING_CADENCE,
  });
}

export function useBacktest(month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.backtest(month),
    queryFn: () => fetchBacktest(month),
    ...SCORING_CADENCE,
  });
}

export function useBenchmark(companyId: string, month: string) {
  return useSuspenseQuery({
    queryKey: portfolioKeys.benchmark(companyId, month),
    queryFn: () => fetchBenchmark(companyId, month),
    ...SCORING_CADENCE,
  });
}

/**
 * Lectura declarada. No usa Suspense: la plantilla ya está en el cliente y
 * Helmcode, si responde, solo la sustituye.
 */
export function useReading(companyId: string, month: string, kind: ReadingKind) {
  return useQuery({
    queryKey: portfolioKeys.reading(companyId, month, kind),
    queryFn: () => fetchReading(companyId, month, kind),
    ...SCORING_CADENCE,
    retry: false,
  });
}
