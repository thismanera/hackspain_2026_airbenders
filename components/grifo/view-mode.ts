/** Qué lado del producto está mirando esta pestaña: la empresa o el partner. */
export const VIEW_MODE_KEY = "embat-flow-view";

export type ViewMode = "empresa" | "partner";

/** Empresa de demo a la que aterriza "vista de empresa" (elegible, en mejora). */
export const DEMO_EMPRESA_ID = "COMP_0357";

export function readViewMode(): ViewMode {
  if (typeof window === "undefined") return "partner";
  return window.sessionStorage.getItem(VIEW_MODE_KEY) === "empresa" ? "empresa" : "partner";
}
