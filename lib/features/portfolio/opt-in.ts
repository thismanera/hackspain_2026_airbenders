"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Opt-in de PRODUCT §3.1 en modo demostración: la empresa pide y, a partir de
 * ese momento, el partner puede ver score, límite y alertas. No hay backend
 * detrás (decisión 32): la solicitud vive en `sessionStorage` de esta pestaña,
 * lo justo para que sobreviva a cambiar de mes o de vista sin fingir que se ha
 * guardado en ningún sitio.
 */
const KEY_PREFIX = "embat-flow-opt-in:";
const listeners = new Set<() => void>();

function keyFor(companyId: string): string {
  return `${KEY_PREFIX}${companyId}`;
}

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/** Mes en el que la empresa pidió, o `null` si sigue en privado. */
export function readOptIn(companyId: string): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(keyFor(companyId));
}

function serverSnapshot(): null {
  return null;
}

export function useOptIn(companyId: string) {
  const requestedMonth = useSyncExternalStore(
    subscribe,
    () => readOptIn(companyId),
    serverSnapshot,
  );

  const request = useCallback(
    (month: string) => {
      window.sessionStorage.setItem(keyFor(companyId), month);
      emit();
    },
    [companyId],
  );

  const withdraw = useCallback(() => {
    window.sessionStorage.removeItem(keyFor(companyId));
    emit();
  }, [companyId]);

  return { requestedMonth, request, withdraw };
}
