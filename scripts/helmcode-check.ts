/**
 * Smoke test de la API key de Helmcode: `pnpm helmcode:check`.
 * Lee HELMCODE_API_KEY de .env (nunca la imprime) y hace una petición real.
 */
import "dotenv/config";

import { HelmcodeError, ask, listHelmcodeModels } from "@/lib/integrations/helmcode";

async function main(): Promise<number> {
  try {
    const models = await listHelmcodeModels();
    console.log(`OK: key válida. ${models.length} modelos disponibles:`);
    for (const id of models) console.log(`  - ${id}`);

    const model = process.env.HELMCODE_MODEL ?? "deepseek-v4-flash";
    console.log(`\nProbando chat con ${model} ...`);
    const result = await ask("Responde solo: hola desde Helmcode", undefined, { maxTokens: 64 });
    console.log(`Respuesta: ${result.content.trim()}`);
    if (result.usage) console.log(`Tokens: ${result.usage.totalTokens}`);
    return 0;
  } catch (error) {
    if (error instanceof HelmcodeError) {
      const hint =
        error.status === 401
          ? "Key inválida o revocada."
          : error.status === 402
            ? "Sin plan/créditos para ese modelo."
            : error.status === 429
              ? "Rate limit: espera y reintenta."
              : "";
      console.error(`${error.message} ${hint}`.trim());
      return 1;
    }
    throw error;
  }
}

process.exitCode = await main();
