import { ScoringUnavailableError } from "./dataset";
import { SCORING_UNAVAILABLE } from "./queries";

/**
 * Respuesta común de las rutas del panel: `null` es 404, un motor sin ejecución
 * compatible es 503 con código estable para que el cliente lo distinga de un
 * fallo genérico, y todo lo demás se propaga.
 */
export async function scoringResponse<T>(
  load: () => Promise<T | null>,
  notFound: string,
): Promise<Response> {
  try {
    const data = await load();
    if (data === null) return Response.json({ error: notFound }, { status: 404 });
    return Response.json(data);
  } catch (error) {
    if (error instanceof ScoringUnavailableError) {
      return Response.json({ error: error.message, code: SCORING_UNAVAILABLE }, { status: 503 });
    }
    throw error;
  }
}
