import type { Percentiles } from "@/lib/features/scoring/types";

/** Percentiles fijos de scoring-engine §12 para que los fixtures sean calculables a mano. Solo tests. */
export const FIXTURE_PERCENTILES: Percentiles = {
  A1: { p5: -0.1, p95: 0.3 },
  A2: { p5: 0, p95: 0.67 },
  A3: { p5: 0.5, p95: 4 },
  A4: { p5: 0, p95: 0.5 },
  A5: { p5: 0, p95: 0.6 },
  B1: { p5: 0.5, p95: 1 },
  B2: { p5: 0, p95: 2 },
  B3: { p5: -10, p95: 60 },
  C1: { p5: 0.2, p95: 0.9 },
  C2: { p5: 0.2, p95: 0.9 },
  C3: { p5: -5, p95: 60 },
  C4: { p5: 0, p95: 0.6 },
  C5: { p5: 0.05, p95: 0.8 },
  C6: { p5: 0, p95: 0.1 },
};
