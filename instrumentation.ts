/**
 * Calienta el dataset del motor al arrancar el servidor Node: la primera petición
 * no paga la traducción de las ~30k filas del run. No se espera al resultado y un
 * fallo aquí (sin DB, sin run) no impide arrancar; la página lo enseña después.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { loadDataset } = await import("@/lib/features/portfolio/load-dataset");
  void loadDataset().catch(() => undefined);
}
