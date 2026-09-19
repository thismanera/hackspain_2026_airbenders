"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Qué lado del producto está mirando esta pestaña: la empresa o el partner. */
export const VIEW_MODE_KEY = "embat-flow-view";

export type ViewMode = "empresa" | "partner";

/** Empresa de demo a la que aterriza "vista de empresa" (elegible, en mejora). */
export const DEMO_EMPRESA_ID = "COMP_1048";

/**
 * Las rutas del lado del partner. En vista de empresa no se puede llegar a
 * ninguna: la regla 1 de PRODUCT §7 dice que el partner solo ve lo que se le ha
 * pedido, y una empresa paseándose por la cartera entera es exactamente lo
 * contrario de lo que el producto promete.
 */
const PARTNER_ROUTES = ["/cartera", "/grupos", "/alertas", "/pares", "/backtest"] as const;

export function isPartnerRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  return PARTNER_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/** Dónde vive "casa" en cada vista: la cartera para el partner, su ficha para la empresa. */
export function homeHref(view: ViewMode): string {
  return view === "empresa" ? "/empresa" : "/cartera";
}

export function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "partner";
  return window.sessionStorage.getItem(VIEW_MODE_KEY) === "empresa" ? "empresa" : "partner";
}

export function writeViewMode(mode: ViewMode): void {
  window.sessionStorage.setItem(VIEW_MODE_KEY, mode);
  for (const listener of listeners) listener();
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** En servidor no hay sessionStorage: se arranca en partner y se corrige al hidratar. */
function serverSnapshot(): ViewMode {
  return "partner";
}

/**
 * El modo de vista como estado suscribible. Lo leen la barra lateral, el
 * buscador global y el guard de rutas, y tienen que coincidir los tres: si el
 * menú dice «Empresa» pero el buscador lleva a la cartera, el usuario acaba en
 * la vista del banco sin haberlo pedido.
 */
export function useViewMode(): ViewMode {
  return useSyncExternalStore(subscribe, readViewMode, serverSnapshot);
}

export function useSetViewMode(): (mode: ViewMode) => void {
  return useCallback((mode: ViewMode) => writeViewMode(mode), []);
}
