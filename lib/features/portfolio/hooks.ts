"use client";

import {
  keepPreviousData,
  useQueries,
  useQuery,
  useSuspenseQueries,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import type { TransitionStartFunction } from "react";

import {
  fetchAlerts,
  fetchBacktest,
  fetchBenchmark,
  fetchCompanyFile,
  fetchGroupFile,
  fetchGroups,
  fetchPeers,
  fetchPortfolio,
  fetchReading,
  portfolioKeys,
} from "./queries";
import type { ReadingKind } from "./reading";
import {
  alertsSearchParams,
  companySearchParams,
  compareSearchParams,
  monthSearchParams,
  portfolioSearchParams,
  pymeSearchParams,
  sheetSearchParams,
  type PortfolioSearchState,
} from "./search-params";
import type { Scope } from "./types";

// El score se recalcula una vez al mes: nada de refetch agresivo. Una hora de
// frescura y un día en caché cubren de sobra una sesión de trabajo.
const SCORING_CADENCE = {
  staleTime: 60 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
} as const;

/**
 * Filtros de la cartera. Con `startTransition`, cambiar un filtro no suspende la
 * tabla que ya está en pantalla mientras llega la cartera filtrada: React
 * conserva la vista anterior en vez de enseñar el esqueleto.
 */
export function usePortfolioFilters(startTransition?: TransitionStartFunction) {
  return useQueryStates(portfolioSearchParams, startTransition ? { startTransition } : undefined);
}

/**
 * Qué sheet está abierta y en qué pestaña. Vive en la URL: cerrar y volver
 * atrás deja la cartera exactamente donde estaba, y el enlace se puede pegar.
 * `history: "push"` para que el botón atrás del navegador cierre la sheet.
 */
export function useSheetState() {
  return useQueryStates(sheetSearchParams, { history: "push" });
}

/** Pestaña de la ficha completa: vive en la URL para que "Abrir ficha" aterrice donde estaba. */
export function useCompanyPageState() {
  return useQueryStates(companySearchParams);
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

/**
 * La misma ficha de grupo, pero sin suspender: la usa la tarjeta de score de la
 * vista de empresa, que se pinta con la nota propia mucho antes de saber la del
 * holding y no debe quedarse en blanco esperándola. Comparte clave con
 * `useGroupFile`, así que si la ficha ya está en caché no hay segunda petición.
 */
export function useGroupScore(groupId: string | null, month: string) {
  return useQuery({
    queryKey: portfolioKeys.group(groupId ?? "", month),
    queryFn: () => fetchGroupFile(groupId ?? "", month),
    enabled: groupId !== null && groupId !== "",
    ...SCORING_CADENCE,
  });
}

export function useMonth() {
  return useQueryStates(monthSearchParams);
}

export function useAlertsState() {
  return useQueryStates(alertsSearchParams);
}

/** Empresa y mes de la vista de empresa. Con `startTransition`, cambiar de empresa no vacía la vista. */
export function usePymeState(startTransition?: TransitionStartFunction) {
  return useQueryStates(pymeSearchParams, startTransition ? { startTransition } : undefined);
}

/**
 * Empresas comparadas y mes. Con `startTransition`, añadir una empresa no
 * suspende lo que ya está en pantalla mientras llega su ficha.
 */
export function useCompareState(startTransition?: TransitionStartFunction) {
  return useQueryStates(compareSearchParams, startTransition ? { startTransition } : undefined);
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

/**
 * El cubo de pares. Con `companyId`, la vista de empresa: solo ella lleva nombre.
 * No suspende: al cambiar de mes conserva el cubo anterior hasta que llega el
 * nuevo. Si suspendiera, cualquier actualización urgente durante la carga (el
 * giro automático) obligaría a React a enseñar el fallback y la página
 * parpadearía.
 */
export function usePeers(month: string, scope: Scope, companyId?: string) {
  return useQuery({
    queryKey: portfolioKeys.peers(month, scope, companyId),
    queryFn: () => fetchPeers(month, scope, companyId),
    placeholderData: keepPreviousData,
    ...SCORING_CADENCE,
  });
}

/** Fichas de las empresas comparadas, sin suspender: cada una llega cuando llega. */
export function useCompanyFiles(companyIds: string[], month: string) {
  return useQueries({
    queries: companyIds.map((companyId) => ({
      queryKey: portfolioKeys.company(companyId, month),
      queryFn: () => fetchCompanyFile(companyId, month),
      placeholderData: keepPreviousData,
      ...SCORING_CADENCE,
    })),
  });
}

/**
 * Ficha y benchmark de una empresa a la vez (`/empresa`). Dos `useSuspenseQuery` seguidos
 * van en cascada (el segundo no arranca hasta que el primero resuelve);
 * `useSuspenseQueries` los lanza en paralelo.
 */
export function useCompanyFileWithBenchmark(companyId: string, month: string) {
  return useSuspenseQueries({
    queries: [
      {
        queryKey: portfolioKeys.company(companyId, month),
        queryFn: () => fetchCompanyFile(companyId, month),
        ...SCORING_CADENCE,
      },
      {
        queryKey: portfolioKeys.benchmark(companyId, month),
        queryFn: () => fetchBenchmark(companyId, month),
        ...SCORING_CADENCE,
      },
    ],
  });
}

/**
 * Lectura declarada. No usa Suspense: la plantilla ya está en el cliente y
 * la lectura materializada (analista o plantilla), cuando llega, solo la sustituye.
 */
export function useReading(companyId: string, month: string, kind: ReadingKind) {
  return useQuery({
    queryKey: portfolioKeys.reading(companyId, month, kind),
    queryFn: () => fetchReading(companyId, month, kind),
    ...SCORING_CADENCE,
    retry: false,
  });
}
