import { gzipSync } from "node:zlib";

import { ScoringUnavailableError } from "./dataset";
import { SCORING_UNAVAILABLE } from "./queries";

/** Por debajo no compensa comprimir: cabe en un par de paquetes TCP. */
const GZIP_MIN_BYTES = 4 * 1024;

/** Coincide con el TTL con el que el servidor relee qué ejecución es la vigente. */
const CACHE_CONTROL = "private, max-age=60, stale-while-revalidate=300";

/**
 * JSON comprimido a mano: `next start` solo gzipea el HTML y los estáticos, no
 * las Route Handlers, y la cartera entera pasa del megabyte. Detrás de un CDN
 * que ya comprime, `Content-Encoding` presente evita que lo haga dos veces.
 */
function json<T>(data: T, request: Request | undefined): Response {
  const body = JSON.stringify(data);
  const headers = new Headers({
    "Content-Type": "application/json",
    "Cache-Control": CACHE_CONTROL,
    Vary: "Accept-Encoding",
  });
  const acceptsGzip = request?.headers.get("accept-encoding")?.includes("gzip") ?? false;
  if (!acceptsGzip || body.length < GZIP_MIN_BYTES) return new Response(body, { headers });
  headers.set("Content-Encoding", "gzip");
  return new Response(new Uint8Array(gzipSync(body)), { headers });
}

/**
 * Respuesta común de las rutas del panel: `null` es 404, un motor sin ejecución
 * compatible es 503 con código estable para que el cliente lo distinga de un
 * fallo genérico, y todo lo demás se propaga.
 */
export async function scoringResponse<T>(
  load: () => Promise<T | null>,
  notFound: string,
  request?: Request,
): Promise<Response> {
  try {
    const data = await load();
    if (data === null) return Response.json({ error: notFound }, { status: 404 });
    return json(data, request);
  } catch (error) {
    if (error instanceof ScoringUnavailableError) {
      return Response.json({ error: error.message, code: SCORING_UNAVAILABLE }, { status: 503 });
    }
    throw error;
  }
}
