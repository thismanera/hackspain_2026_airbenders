import { ScoringUnavailableError } from "./dataset";

export type EngineResult<T> = { status: "ok"; data: T } | { status: "unavailable" };

/**
 * Carga en el servidor para el prefetch de una página. Sin ejecución compatible
 * del motor no se lanza: la página renderiza `EngineUnavailable` en vez de
 * caer en el error boundary genérico.
 */
export async function withEngine<T>(load: () => Promise<T>): Promise<EngineResult<T>> {
  try {
    return { status: "ok", data: await load() };
  } catch (error) {
    if (error instanceof ScoringUnavailableError) return { status: "unavailable" };
    throw error;
  }
}
