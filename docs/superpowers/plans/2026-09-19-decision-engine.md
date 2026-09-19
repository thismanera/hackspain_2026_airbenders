# Decision Engine (SOURCE §3 · decision-engine.md) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the decision engine specified in `docs/decision-engine.md` (SOURCE §3, decisions 11, 12, 17-23, 37) as a pure, deterministic TypeScript module on top of Eric's scoring engine from commit `fd422db` ("Update database configuration and add scoring engine features (#17)"), with fixtures, property tests, a batch script, Postgres persistence, backtest metrics and read-only API routes.

**Architecture:** A new feature folder `lib/features/decision/` holds the engine (pure functions, no I/O), a versioned parameter table, Spanish text templates, a zod output contract, an adapter from Eric's `ScoreResultDTO` to the engine's input row, a month-by-month orchestrator with group step, and §14 backtest metrics. Eric's scoring engine (`lib/features/scoring/`) is extended, not rewritten: `Flow` gains per-category obligation amounts and `Result` gains the ▶ fields the decision engine consumes (flow averages, deficit streak, obligation streak). Eric's legacy limit/action fields (`band`, `price`, `action`, `recommendedLimit`, `appliedLimit`) stay in place and are marked deprecated; the decision engine becomes the only source of truth for limits and actions. The forecast engine does not exist yet, so the forecast input is optional and defaults to "disconnected" (`banda_pred_3m = banda`), exactly as decision-engine §1 prescribes.

**Tech Stack:** TypeScript 7 (strict), Node 20 `node:test` + `node:assert/strict` via `tsx` (`pnpm test`), zod 4, Prisma 7 (Postgres, multi-file schema), Next.js 16 route handlers, pnpm 10.

---

## Spec basis and known deviations

The plan follows the **forecast-aware** version of the specs on branch `docs/forecast-engine` (commit `47db563`): `docs/SOURCE.md` (four parts: score, forecast, decision, product) and `docs/decision-engine.md` with `banda_pred_3m`, `prima_prevision_pp`, `reducir_prev_meses`, `meses_pred_peor_seguidos`. On `main` the same files lack the forecast fields. The engine below works under both: with no forecast row, every forecast-dependent branch collapses to the non-forecast spec (property test 7 guarantees this).

Deviations the engineer must know (all decided here, not open questions):

1. **Eric's scoring is not SOURCE §1.** `lib/features/scoring/engine.ts` is `scoring-engine-v0.2-legacy-2`: 12 indicators (`margin … creditUse`), no B block, no group adjustment (`aval_grupo`). The decision engine consumes it through `adapter.ts`. Rewriting scoring to SOURCE §1 (14 variables, blocks A/B/C/D) is a **separate plan**; this one only adds the ▶ fields decision needs.
2. **`racha_B2` (obligation streak)** does not exist in Eric's engine. Task 9 adds a minimal version (SOURCE §1.3 rule: category in `{tax, social_security, salary, debt_repayment}` present ≥ 3 of last 6 months → recurrent; streak = consecutive months with 0 paid). No B1/B3, no `debt_schedule_config`.
3. **Group consolidated flows** are the plain sum of members. Eric pairs mirror transfers only inside a company, so intragroup mirrors are not removed. Declared limitation; the group ceiling is therefore generous.
4. **`cobros_op_media3m` of the group** is not in the spec contract but `limite()` needs it for `lim_op`. Taken as Σ members' `receipts3m`.
5. **Spec fixture `prevision_peor`** says "score 72 estable (A)"; per the band table 72 is B. The fixture uses score 80 (A). Everything else as specified.
6. **Cross-default loophole** (§9 `caidas = cerrar and D1 ≥ 0,3`): a sibling closed *only* by the `grupo` gate would itself count as fallen and escape the cross-default the next month. `groupStep` counts as fallen only closures whose failed gates are not exactly `["grupo"]`.
7. **Menu cap:** the menu is computed with `min(L, L_vigente)` so `cantidad_max ≤ L` (spec invariant) and never exceeds the live limit after hysteresis or group ceiling.
8. **Months with no history** (Eric emits all 24 months per company, score 50 / conf 0 when empty) produce `cerrar` rows with motivo `historia`, as §8 says ("aunque Lp fuese 0: la fila registra el motivo").
9. **Eric's legacy §8 fields stay** in `Result`, the DB columns and CSV export. Removing them and dropping DB columns is a follow-up once the UI reads `company_month_decisions`.

## Field-name mapping (spec → code)

Eric's code uses English field names with Spanish enum values; the decision engine follows that convention.

| Spec (decision-engine §1/§10) | Code (`lib/features/decision/model.ts`) |
| --- | --- |
| `company_id`, `mes`, `group_id` | `company`, `month`, `group` |
| `score`, `confianza`, `direccion`, `naturaleza` | `score`, `confidence`, `direction`, `nature` |
| `racha_B2`, `racha_deficit` | `obligationStreak`, `deficitStreak` |
| `C4`, `C3_dias` | `overdueShare`, `receivableDays` |
| `cobros_op_media3m`, `cobros_op_media6m`, `pagos_op_media6m`, `servicio_deuda_media6m` | `receipts3m`, `receipts6m`, `payments6m`, `debtService6m` |
| `D1` | `groupWeight` |
| `cobros_op_grupo_media6m`, `pagos_op_grupo_media6m`, `servicio_deuda_grupo_media6m` | `groupReceipts6m`, `groupPayments6m`, `groupDebtService6m` |
| `banda_pred_3m`, `score_pred_3m`, `direccion_pred`, `prob_deterioro_6m`, `metodo` | `ForecastInput.band3m`, `score3m`, `direction`, `deteriorationProb`, `method` |
| `elegible`, `motivo`, `puertas_fallidas` | `eligible`, `reason`, `failedGates` |
| `banda`, `banda_efectiva` | `band`, `effectiveBand` |
| `capacidad_cuota_adv`, `limite_cap`, `limite_op`, `L`, `L_vigente` | `adverseCapacity`, `capacityLimit`, `operatingLimit`, `limit`, `appliedLimit` |
| `T_max`, `plazo_natural_anticipo` | `maxTerm`, `naturalTerm` |
| `menu[].plazo / cantidad_max / tae / coste_max / desglose_tae` | `menu[].term / maxAmount / rate / maxCost / breakdown` |
| `accion`, `motivo_accion`, `motivo_grupo`, `banda_pred_3m_usada` | `action`, `actionReason`, `groupReason`, `forecastBandUsed` |
| `estado.L_prev / meses_elegible_seguidos / meses_reduccion_seguidos / meses_pred_peor_seguidos / cerrado_desde / cross_default_activo` | `state.previousLimit / eligibleMonths / reductionMonths / worseForecastMonths / closedSince / crossDefault` |

## File structure

| File | Responsibility |
| --- | --- |
| `lib/features/decision/model.ts` | Types (`ScoreInput`, `ForecastInput`, `State`, `Decision`, `MenuOption`), band helpers, rounding, euro formatting |
| `lib/features/decision/parameters.ts` | `DECISION_PARAMETERS` (§2, every number) + `parameterVersion()` sha256 |
| `lib/features/decision/templates.ts` | Spanish text: gate reasons (§3), action reasons (§11) |
| `lib/features/decision/engine.ts` | Pure functions: bands, capacity, limit, eligibility, term, rate, cost, menu, natural term, action, next state, `decide()` |
| `lib/features/decision/group.ts` | §9 group step: cross-default, group ceiling |
| `lib/features/decision/run.ts` | §12 orchestrator: month loop, state carry-over |
| `lib/features/decision/contracts.ts` | zod `decisionResultSchema` (§10) |
| `lib/features/decision/fixtures.ts` | §13 fixture rows (hand-written inputs) |
| `lib/features/decision/adapter.ts` | Eric `ScoreResultDTO` + group totals → `ScoreInput` |
| `lib/features/decision/backtest.ts` | §14 metrics |
| `lib/features/decision/api.ts` | Route handler logic (list, history, run detail, CSV export) |
| `lib/features/decision/*.test.ts` | Tests per module |
| `lib/features/scoring/model.ts`, `engine.ts`, `contracts.ts`, `backtest.ts` | Eric's files: add `obligations` to `Flow`; add `flows`, `deficitStreak`, `obligationStreak` to `Result`; export `eventAt` |
| `prisma/schema/decision.prisma` | `DecisionRun`, `CompanyMonthDecision` |
| `scripts/decision.ts` | `run | backtest | import` commands |
| `scripts/setup-db.mjs`, `package.json`, `README.md` | Wire the new commands |
| `app/api/decision/**/route.ts` | Read-only routes |

---

### Task 0: Environment and baseline

**Files:** none created.

- [ ] **Step 1: Install pnpm and dependencies**

`pnpm` is not on PATH in this environment and `node_modules` is missing. `package.json` pins `pnpm@10.28.1`.

Run:
```bash
corepack enable && corepack prepare pnpm@10.28.1 --activate && pnpm install --frozen-lockfile
```
Expected: `Done in …s`, `node_modules/` present. If `corepack` is missing: `npm install -g pnpm@10.28.1`.

- [ ] **Step 2: Generate the Prisma client (needed by typecheck)**

Run: `pnpm exec prisma generate`
Expected: `Generated Prisma Client … to ./generated/prisma`.

- [ ] **Step 3: Baseline tests and typecheck**

Run: `pnpm test && pnpm run typecheck`
Expected: 5 tests pass (`lib/core/utils.test.ts`, `lib/features/scoring/engine.test.ts`), `tsc` exits 0. If either fails on a clean checkout of `main`, stop and report before continuing.

- [ ] **Step 4: Branch**

Run: `git checkout -b feat/decision-engine origin/main`
Expected: `Switched to a new branch 'feat/decision-engine'`.

---

### Task 1: Model types and helpers

**Files:**
- Create: `lib/features/decision/model.ts`
- Test: `lib/features/decision/model.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/features/decision/model.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  bandRank,
  euros,
  initialState,
  isWorse,
  lowerBand,
  roundDown,
  worseBand,
} from "@/lib/features/decision/model";

test("band ordering helpers", () => {
  assert.equal(bandRank("A"), 3);
  assert.equal(bandRank("D"), 0);
  assert.equal(lowerBand("A"), "B");
  assert.equal(lowerBand("C"), "D");
  assert.equal(lowerBand("D"), "D");
  assert.equal(worseBand("A", "C"), "C");
  assert.equal(worseBand("B", "B"), "B");
  assert.equal(isWorse("C", "A"), true);
  assert.equal(isWorse("A", "A"), false);
});

test("roundDown floors to the step and absorbs float dust", () => {
  assert.equal(roundDown(117_600, 1000), 117_000);
  assert.equal(roundDown(9_999.9999999, 1000), 10_000);
  assert.equal(roundDown(-5, 1000), 0);
  assert.equal(roundDown(999, 1000), 0);
});

test("euros formats with dot thousands and no decimals", () => {
  assert.equal(euros(120_000), "120.000 €");
  assert.equal(euros(0), "0 €");
  assert.equal(euros(36_923.4), "36.923 €");
});

test("initial state is a fresh company with no history", () => {
  assert.deepEqual(initialState(), {
    previousLimit: 0,
    previousAction: null,
    eligibleMonths: 0,
    reductionMonths: 0,
    worseForecastMonths: 0,
    closedSince: null,
    crossDefault: false,
    crossDefaultSource: null,
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/model'`.

- [ ] **Step 3: Write the model**

```ts
// lib/features/decision/model.ts
export const BANDS = ["A", "B", "C", "D"] as const;
export type Band = (typeof BANDS)[number];
export const ACTIONS = ["abrir", "ampliar", "mantener", "reducir", "cerrar"] as const;
export type Action = (typeof ACTIONS)[number];
export const GATES = ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"] as const;
export type Gate = (typeof GATES)[number];
export type Direction = "mejora" | "estable" | "deterioro";
export type Nature = "temporal" | "estructural" | "sin_cambio";
export type ReductionKind = "estructural" | "confirmada" | "prevision";
export type ForecastMethod = "v1_proyeccion" | "v2_modelo" | "desconectado";

/** decision-engine §1: the score row, only the fields the engine uses. */
export type ScoreInput = {
  company: string;
  month: string;
  group: string;
  score: number;
  confidence: number;
  direction: Direction;
  nature: Nature;
  obligationStreak: number;
  deficitStreak: number;
  overdueShare: number | null;
  receivableDays: number | null;
  receipts3m: number;
  receipts6m: number;
  payments6m: number;
  debtService6m: number;
  groupWeight: number;
  groupReceipts6m: number;
  groupPayments6m: number;
  groupDebtService6m: number;
  /** "margin +3.2": top |delta_contrib| of the score row, for motivo_accion. */
  topDelta: string | null;
};

/** forecast-engine §8, the fields decision reads. Absent forecast == "desconectado". */
export type ForecastInput = {
  band3m: Band;
  score3m: number;
  direction: Direction;
  deteriorationProb: number | null;
  method: ForecastMethod;
};

/** decision-engine §8: state persisted between months. */
export type State = {
  previousLimit: number;
  previousAction: Action | null;
  eligibleMonths: number;
  reductionMonths: number;
  worseForecastMonths: number;
  closedSince: string | null;
  crossDefault: boolean;
  crossDefaultSource: string | null;
};

export type RateBreakdown = {
  base: number;
  termPremium: number;
  confidencePremium: number;
  trendAdjustment: number;
  forecastPremium: number;
};
export type MenuOption = {
  term: number;
  maxAmount: number;
  rate: number;
  maxCost: number;
  breakdown: RateBreakdown;
};

/** decision-engine §10: one row of company_month_decision. */
export type Decision = {
  company: string;
  month: string;
  parameterVersion: string;
  eligible: boolean;
  reason: string | null;
  failedGates: Gate[];
  band: Band;
  effectiveBand: Band;
  adverseCapacity: number;
  capacityLimit: number;
  operatingLimit: number;
  limit: number;
  appliedLimit: number;
  maxTerm: number;
  menu: MenuOption[];
  naturalTerm: number;
  action: Action;
  actionReason: string;
  reductionKind: ReductionKind | null;
  groupReason: string | null;
  forecastBandUsed: Band | null;
  state: State;
};

export type CrossDefault = { active: boolean; source: string | null };

export function initialState(): State {
  return {
    previousLimit: 0,
    previousAction: null,
    eligibleMonths: 0,
    reductionMonths: 0,
    worseForecastMonths: 0,
    closedSince: null,
    crossDefault: false,
    crossDefaultSource: null,
  };
}
export function bandRank(band: Band): number {
  return { A: 3, B: 2, C: 1, D: 0 }[band];
}
export function lowerBand(band: Band): Band {
  return band === "A" ? "B" : band === "B" ? "C" : "D";
}
export function worseBand(a: Band, b: Band): Band {
  return bandRank(a) <= bandRank(b) ? a : b;
}
export function isWorse(a: Band, b: Band): boolean {
  return bandRank(a) < bandRank(b);
}
export function roundDown(value: number, step: number): number {
  return Math.max(0, Math.floor((value + 1e-6) / step) * step);
}
export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
export function euros(value: number): string {
  return `${Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".")} €`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/model.ts lib/features/decision/model.test.ts
git commit -m "feat(decision): model types and band helpers"
```

---

### Task 2: Parameters and version hash

**Files:**
- Create: `lib/features/decision/parameters.ts`
- Test: `lib/features/decision/parameters.test.ts`

- [ ] **Step 1: Write the failing test (property 6 of §13)**

```ts
// lib/features/decision/parameters.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_PARAMETERS, parameterVersion } from "@/lib/features/decision/parameters";

test("parameter version is a sha256 that changes when any number changes", () => {
  const base = parameterVersion(DECISION_PARAMETERS);
  assert.equal(base.length, 64);
  assert.equal(parameterVersion(DECISION_PARAMETERS), base);
  const tweaked = {
    ...DECISION_PARAMETERS,
    review: { ...DECISION_PARAMETERS.review, hysteresis: 0.3 },
  };
  assert.notEqual(parameterVersion(tweaked), base);
});

test("spec values from decision-engine §2", () => {
  const P = DECISION_PARAMETERS;
  assert.deepEqual(P.bands.thresholds, { A: 75, B: 60, C: 45 });
  assert.deepEqual(P.bands.factor, { A: 1, B: 0.7, C: 0.4, D: 0 });
  assert.deepEqual(P.term.menu, [30, 60, 90, 120, 180]);
  assert.equal(P.term.maxDays.C.estructural, 0);
  assert.equal(P.review.rounding, 1000);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/parameters'`.

- [ ] **Step 3: Write the parameters**

```ts
// lib/features/decision/parameters.ts
import { createHash } from "node:crypto";
import type { Band } from "@/lib/features/decision/model";

export type TermTable = Record<Band, { base: number; temporal: number; estructural: number }>;
export type DecisionParameters = {
  name: string;
  eligibility: {
    minConfidence: number;
    minScore: number;
    maxObligationStreak: number;
    maxDeficitStreak: number;
    maxOverdueShare: number;
  };
  capacity: {
    stressReceipts: number;
    stressPayments: number;
    coverageRatio: number;
    capacityMonths: number;
    advanceRate: number;
    advanceMonths: number;
    confidenceTarget: number;
  };
  bands: {
    thresholds: { A: number; B: number; C: number };
    factor: Record<Band, number>;
    baseRate: Record<Band, number>;
  };
  term: { maxDays: TermTable; menu: number[]; defaultNaturalTerm: number };
  pricing: {
    termPremiumPer30d: number;
    lowConfidence: number;
    confidencePremium: number;
    improvementAdjustment: number;
    deteriorationAdjustment: number;
    forecastPremium: number;
    dayBasis: number;
  };
  review: {
    expandRatio: number;
    reduceRatio: number;
    reduceMonths: number;
    hysteresis: number;
    reopenMonths: number;
    forecastReduceMonths: number;
    rounding: number;
  };
  group: { crossDefaultWeight: number };
};

/** decision-engine §2. Every number of the algorithm lives here. */
export const DECISION_PARAMETERS: DecisionParameters = {
  name: "decision-engine-v1.0",
  eligibility: {
    minConfidence: 0.5,
    minScore: 45,
    maxObligationStreak: 1,
    maxDeficitStreak: 2,
    maxOverdueShare: 0.4,
  },
  capacity: {
    stressReceipts: 0.8,
    stressPayments: 1.1,
    coverageRatio: 1.3,
    capacityMonths: 12,
    advanceRate: 0.8,
    advanceMonths: 3,
    confidenceTarget: 0.6,
  },
  bands: {
    thresholds: { A: 75, B: 60, C: 45 },
    factor: { A: 1, B: 0.7, C: 0.4, D: 0 },
    baseRate: { A: 0.05, B: 0.07, C: 0.1, D: 0 },
  },
  term: {
    maxDays: {
      A: { base: 180, temporal: 120, estructural: 60 },
      B: { base: 120, temporal: 90, estructural: 30 },
      C: { base: 60, temporal: 30, estructural: 0 },
      D: { base: 0, temporal: 0, estructural: 0 },
    },
    menu: [30, 60, 90, 120, 180],
    defaultNaturalTerm: 60,
  },
  pricing: {
    termPremiumPer30d: 0.005,
    lowConfidence: 0.7,
    confidencePremium: 0.01,
    improvementAdjustment: -0.005,
    deteriorationAdjustment: 0.01,
    forecastPremium: 0.005,
    dayBasis: 360,
  },
  review: {
    expandRatio: 1.15,
    reduceRatio: 0.85,
    reduceMonths: 2,
    hysteresis: 0.25,
    reopenMonths: 2,
    forecastReduceMonths: 2,
    rounding: 1000,
  },
  group: { crossDefaultWeight: 0.3 },
};

const versions = new WeakMap<DecisionParameters, string>();
export function parameterVersion(parameters: DecisionParameters): string {
  const cached = versions.get(parameters);
  if (cached) return cached;
  const version = createHash("sha256").update(JSON.stringify(parameters)).digest("hex");
  versions.set(parameters, version);
  return version;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/parameters.ts lib/features/decision/parameters.test.ts
git commit -m "feat(decision): versioned parameter table"
```

---

### Task 3: Bands, adverse capacity and limit (§4)

**Files:**
- Create: `lib/features/decision/engine.ts`
- Create: `lib/features/decision/fixtures.ts` (the `sana` row; Task 8 extends this file)
- Test: `lib/features/decision/engine.test.ts`

- [ ] **Step 1: Write the shared fixture row**

The `sana` profile of §13 (score 82, conf 0,9, cap 10 k/mes, cobros 100 k/mes) is the base of every test. `receipts6m = 98 750` and `payments6m = 60 000` are chosen so that `(0,8·98 750 − 1,1·60 000)/1,3 = 13 000/1,3 = 10 000` exactly.

```ts
// lib/features/decision/fixtures.ts
import type { ScoreInput } from "@/lib/features/decision/model";

/** §13 `sana`: score 82, conf 0,9, cap 10 k/mes, cobros 100 k/mes → A, L 120 k, T 180. */
export function sanaRow(month: string, overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    company: "sana",
    month,
    group: "sana",
    score: 82,
    confidence: 0.9,
    direction: "estable",
    nature: "sin_cambio",
    obligationStreak: 0,
    deficitStreak: 0,
    overdueShare: 0.1,
    receivableDays: 45,
    receipts3m: 100_000,
    receipts6m: 98_750,
    payments6m: 60_000,
    debtService6m: 0,
    groupWeight: 1,
    groupReceipts6m: 98_750,
    groupPayments6m: 60_000,
    groupDebtService6m: 0,
    topDelta: "margin +1.0",
    ...overrides,
  };
}
```

- [ ] **Step 2: Write the failing test**

```ts
// lib/features/decision/engine.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import {
  adverseCapacity,
  bandOf,
  effectiveBand,
  limitOf,
} from "@/lib/features/decision/engine";
import { sanaRow } from "@/lib/features/decision/fixtures";
import type { ScoreInput } from "@/lib/features/decision/model";
import { DECISION_PARAMETERS as P } from "@/lib/features/decision/parameters";

function row(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return sanaRow("2025-06", { company: "c", group: "c", ...overrides });
}

test("bands follow the thresholds 75/60/45", () => {
  assert.equal(bandOf(75, P), "A");
  assert.equal(bandOf(74.9, P), "B");
  assert.equal(bandOf(60, P), "B");
  assert.equal(bandOf(59, P), "C");
  assert.equal(bandOf(44.9, P), "D");
});

test("structural deterioration and cross-default each lower one band", () => {
  assert.equal(effectiveBand(row(), P), "A");
  assert.equal(effectiveBand(row({ direction: "deterioro", nature: "temporal" }), P), "A");
  assert.equal(effectiveBand(row({ direction: "deterioro", nature: "estructural" }), P), "B");
  assert.equal(effectiveBand(row(), P, true), "B");
  assert.equal(
    effectiveBand(row({ direction: "deterioro", nature: "estructural" }), P, true),
    "C",
  );
});

test("adverse capacity: (0,8·cobros − 1,1·pagos)/1,3 − servicio, floored at 0", () => {
  assert.equal(adverseCapacity(row(), P), 10_000);
  assert.equal(adverseCapacity(row({ debtService6m: 4_000 }), P), 6_000);
  assert.equal(adverseCapacity(row({ payments6m: 90_000 }), P), 0);
});

test("limit = min(cap·12, 0,8·cobros3m·3) · factor_banda · min(1, conf/0,6), rounded down to 1000", () => {
  const sana = limitOf(row(), "A", P);
  assert.deepEqual(sana, {
    adverseCapacity: 10_000,
    capacityLimit: 120_000,
    operatingLimit: 240_000,
    limit: 120_000,
  });
  assert.equal(limitOf(row(), "B", P).limit, 84_000);
  assert.equal(limitOf(row(), "C", P).limit, 48_000);
  assert.equal(limitOf(row(), "D", P).limit, 0);
  assert.equal(limitOf(row({ confidence: 0.3 }), "A", P).limit, 60_000);
  assert.equal(limitOf(row({ receipts3m: 40_000 }), "B", P).limit, 67_000);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/engine'`.

- [ ] **Step 4: Write the first slice of the engine**

```ts
// lib/features/decision/engine.ts
import {
  lowerBand,
  roundDown,
  type Band,
  type ScoreInput,
} from "@/lib/features/decision/model";
import type { DecisionParameters } from "@/lib/features/decision/parameters";

export function bandOf(score: number, P: DecisionParameters): Band {
  if (score >= P.bands.thresholds.A) return "A";
  if (score >= P.bands.thresholds.B) return "B";
  if (score >= P.bands.thresholds.C) return "C";
  return "D";
}
export function isStructuralDeterioration(row: ScoreInput): boolean {
  return row.direction === "deterioro" && row.nature === "estructural";
}
/** §4 banda_efectiva, plus the §9 cross-default step down. */
export function effectiveBand(row: ScoreInput, P: DecisionParameters, crossDefault = false): Band {
  let band = bandOf(row.score, P);
  if (isStructuralDeterioration(row)) band = lowerBand(band);
  if (crossDefault) band = lowerBand(band);
  return band;
}
/** §4 capacidad_cuota_adv, rounded to cents so 13000/1.3 is exactly 10000. */
export function adverseCapacity(row: ScoreInput, P: DecisionParameters): number {
  const cash = P.capacity.stressReceipts * row.receipts6m - P.capacity.stressPayments * row.payments6m;
  return Math.max(0, Math.round((cash / P.capacity.coverageRatio - row.debtService6m) * 100) / 100);
}
export type Limits = {
  adverseCapacity: number;
  capacityLimit: number;
  operatingLimit: number;
  limit: number;
};
/** §4 limite(): the band is passed in so callers can price alternative bands (§8 L_pred, §9). */
export function limitOf(row: ScoreInput, band: Band, P: DecisionParameters): Limits {
  const cap = adverseCapacity(row, P);
  const capacityLimit = cap * P.capacity.capacityMonths;
  const operatingLimit = P.capacity.advanceRate * row.receipts3m * P.capacity.advanceMonths;
  const gross =
    Math.min(capacityLimit, operatingLimit) *
    P.bands.factor[band] *
    Math.min(1, row.confidence / P.capacity.confidenceTarget);
  return {
    adverseCapacity: cap,
    capacityLimit,
    operatingLimit,
    limit: roundDown(gross, P.review.rounding),
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS. Check `limitOf(row({ confidence: 0.3 }), "A")`: factor 0.5 → 60 000; `receipts3m 40 000` band B: `min(120k, 96k)·0,7 = 67 200 → 67 000`.

- [ ] **Step 6: Commit**

```bash
git add lib/features/decision/engine.ts lib/features/decision/fixtures.ts lib/features/decision/engine.test.ts
git commit -m "feat(decision): bands, adverse capacity and limit"
```

---

### Task 4: Eligibility gates and their texts (§3)

**Files:**
- Create: `lib/features/decision/templates.ts`
- Modify: `lib/features/decision/engine.ts`
- Test: `lib/features/decision/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/features/decision/engine.test.ts` (extend the import from `@/lib/features/decision/engine` with `eligibility`, and import `initialState` from `@/lib/features/decision/model`):

```ts
test("eligibility: all six gates, first failure is the reason, all failures listed", () => {
  const ok = eligibility(row(), initialState(), P);
  assert.deepEqual(ok, { eligible: true, reason: null, failedGates: [] });

  const short = eligibility(row({ confidence: 0.3 }), initialState(), P);
  assert.equal(short.eligible, false);
  assert.equal(short.reason, "Historial insuficiente: confianza 0,30 < 0,5");
  assert.deepEqual(short.failedGates, ["historia"]);

  assert.equal(
    eligibility(row({ score: 40 }), initialState(), P).reason,
    "Score 40 por debajo de 45",
  );
  assert.equal(
    eligibility(row({ obligationStreak: 2 }), initialState(), P).reason,
    "2 meses seguidos sin pagar obligaciones",
  );
  assert.equal(
    eligibility(row({ deficitStreak: 3 }), initialState(), P).reason,
    "3 meses seguidos en déficit",
  );
  assert.equal(
    eligibility(row({ payments6m: 90_000 }), initialState(), P).reason,
    "Caja estresada no cubre cuotas actuales",
  );
  assert.equal(
    eligibility(row({ overdueShare: 0.55 }), initialState(), P).reason,
    "55 % de facturas vencidas sin cobrar",
  );
  assert.equal(eligibility(row({ overdueShare: null }), initialState(), P).eligible, true);
  assert.equal(
    eligibility(
      row(),
      { ...initialState(), crossDefault: true, crossDefaultSource: "g1 (50 % del grupo)" },
      P,
    ).reason,
    "Cierre de g1 (50 % del grupo)",
  );

  const many = eligibility(row({ score: 40, obligationStreak: 2, confidence: 0.2 }), initialState(), P);
  assert.deepEqual(many.failedGates, ["historia", "estado", "fiabilidad"]);
  assert.equal(many.reason, "Historial insuficiente: confianza 0,20 < 0,5");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `eligibility is not a function` (or missing export).

- [ ] **Step 3: Write the templates and the gate function**

```ts
// lib/features/decision/templates.ts
import {
  euros,
  type Action,
  type Band,
  type Gate,
  type ReductionKind,
  type ScoreInput,
  type State,
} from "@/lib/features/decision/model";
import type { DecisionParameters } from "@/lib/features/decision/parameters";

function decimal(value: number, digits = 2): string {
  return value.toFixed(digits).replace(".", ",");
}

/** decision-engine §3 motivo templates. */
export function gateReason(gate: Gate, row: ScoreInput, prev: State, P: DecisionParameters): string {
  switch (gate) {
    case "historia":
      return `Historial insuficiente: confianza ${decimal(row.confidence)} < ${decimal(P.eligibility.minConfidence, 1)}`;
    case "estado":
      return `Score ${Math.round(row.score)} por debajo de ${P.eligibility.minScore}`;
    case "fiabilidad":
      return `${row.obligationStreak} meses seguidos sin pagar obligaciones`;
    case "caja":
      return row.deficitStreak > P.eligibility.maxDeficitStreak
        ? `${row.deficitStreak} meses seguidos en déficit`
        : "Caja estresada no cubre cuotas actuales";
    case "clientes":
      return `${Math.round((row.overdueShare ?? 0) * 100)} % de facturas vencidas sin cobrar`;
    case "grupo":
      return `Cierre de ${prev.crossDefaultSource ?? "empresa del grupo"}`;
  }
}

export type ActionContext = {
  action: Action;
  appliedLimit: number;
  previousLimit: number;
  maxTerm: number;
  band: Band;
  reductionKind: ReductionKind | null;
  reopenIn: number | null;
  pendingCut: boolean;
  forecastBand: Band | null;
  reason: string | null;
};

/** decision-engine §11 motivo_accion templates. */
export function actionReason(row: ScoreInput, ctx: ActionContext): string {
  const top = row.topDelta ?? "sin desglose";
  switch (ctx.action) {
    case "cerrar":
      return ctx.reason ?? "No elegible";
    case "abrir":
      return `Elegible: score ${Math.round(row.score)} (banda ${ctx.band}), límite ${euros(ctx.appliedLimit)} hasta ${ctx.maxTerm} d`;
    case "ampliar":
      return `Límite sube de ${euros(ctx.previousLimit)} a ${euros(ctx.appliedLimit)}: ${top}`;
    case "reducir": {
      const why =
        ctx.reductionKind === "estructural"
          ? "deterioro estructural"
          : ctx.reductionKind === "prevision"
            ? `previsión: banda ${ctx.forecastBand} en 3 meses`
            : "2 meses por debajo";
      return `Límite baja de ${euros(ctx.previousLimit)} a ${euros(ctx.appliedLimit)}: ${why}, ${top}`;
    }
    case "mantener":
      if (ctx.reopenIn !== null) return `Reapertura en ${ctx.reopenIn} meses`;
      if (ctx.pendingCut) return "Pendiente confirmar bajada";
      return `Sin cambios: score ${Math.round(row.score)}, límite ${euros(ctx.previousLimit)}`;
  }
}
```

Append to `lib/features/decision/engine.ts` (add `Gate`, `State` to the model import and `import { gateReason } from "@/lib/features/decision/templates";`):

```ts
export type Eligibility = { eligible: boolean; reason: string | null; failedGates: Gate[] };
/** §3: fixed order, first failing gate is the reason, all failures are listed. */
export function eligibility(row: ScoreInput, prev: State, P: DecisionParameters): Eligibility {
  const cap = adverseCapacity(row, P);
  const gates: [Gate, boolean][] = [
    ["historia", row.confidence >= P.eligibility.minConfidence],
    ["estado", row.score >= P.eligibility.minScore],
    ["fiabilidad", row.obligationStreak <= P.eligibility.maxObligationStreak],
    ["caja", row.deficitStreak <= P.eligibility.maxDeficitStreak && cap > 0],
    ["clientes", row.overdueShare === null || row.overdueShare <= P.eligibility.maxOverdueShare],
    ["grupo", !prev.crossDefault],
  ];
  const failedGates = gates.filter(([, ok]) => !ok).map(([gate]) => gate);
  return {
    eligible: failedGates.length === 0,
    reason: failedGates.length ? gateReason(failedGates[0], row, prev, P) : null,
    failedGates,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/templates.ts lib/features/decision/engine.ts lib/features/decision/engine.test.ts
git commit -m "feat(decision): eligibility gates and reason templates"
```

---

### Task 5: Term, rate, cost, menu, natural term (§5-§7)

**Files:**
- Modify: `lib/features/decision/engine.ts`
- Test: `lib/features/decision/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/features/decision/engine.test.ts` (extend the engine import with `costOf`, `maxTerm`, `menuOf`, `naturalTerm`, `rateOf`, `validateRequest`):

```ts
test("T_max: worst of current and forecast band, cut by deterioration", () => {
  assert.equal(maxTerm(row(), null, P), 180);
  assert.equal(maxTerm(row({ score: 70 }), null, P), 120);
  assert.equal(maxTerm(row({ score: 50 }), null, P), 60);
  assert.equal(maxTerm(row({ direction: "deterioro", nature: "temporal" }), null, P), 120);
  assert.equal(maxTerm(row({ direction: "deterioro", nature: "estructural" }), null, P), 60);
  assert.equal(maxTerm(row({ score: 50, direction: "deterioro", nature: "estructural" }), null, P), 0);
  assert.equal(maxTerm(row(), "C", P), 60);
  assert.equal(maxTerm(row({ score: 50 }), "A", P), 60);
});

test("rate: base + 0,5 pp per 30 d over 30 + 1 pp low confidence ± trend + 0,5 pp worse forecast", () => {
  assert.equal(rateOf(row(), 30, "A", null, P).rate, 0.05);
  assert.equal(rateOf(row(), 60, "A", null, P).rate, 0.055);
  assert.equal(rateOf(row(), 180, "A", null, P).rate, 0.075);
  assert.equal(rateOf(row({ confidence: 0.65 }), 30, "B", null, P).rate, 0.08);
  assert.equal(rateOf(row({ direction: "mejora" }), 30, "B", null, P).rate, 0.065);
  assert.equal(rateOf(row({ direction: "deterioro" }), 30, "C", null, P).rate, 0.11);
  const forecast = rateOf(row(), 30, "A", "C", P);
  assert.equal(forecast.rate, 0.055);
  assert.deepEqual(forecast.breakdown, {
    base: 0.05,
    termPremium: 0,
    confidencePremium: 0,
    trendAdjustment: 0,
    forecastPremium: 0.005,
  });
  assert.equal(rateOf(row(), 30, "A", "A", P).rate, 0.05);
  assert.equal(costOf(10_000, 0.05, 30, P), 41.67);
});

test("menu: one option per term ≤ T_max, cantidad_max = min(L, cap·meses), monotone", () => {
  const menu = menuOf(row(), 120_000, 180, 10_000, "A", null, P);
  assert.deepEqual(
    menu.map((o) => [o.term, o.maxAmount, o.rate]),
    [
      [30, 10_000, 0.05],
      [60, 20_000, 0.055],
      [90, 30_000, 0.06],
      [120, 40_000, 0.065],
      [180, 60_000, 0.075],
    ],
  );
  assert.equal(menu[0].maxCost, 41.67);
  assert.deepEqual(
    menuOf(row(), 25_000, 90, 10_000, "A", null, P).map((o) => o.maxAmount),
    [10_000, 20_000, 25_000],
  );
  assert.deepEqual(menuOf(row(), 120_000, 0, 10_000, "A", null, P), []);
  assert.deepEqual(menuOf(row(), 120_000, 180, 0, "A", null, P), []);
  assert.deepEqual(menuOf(row(), 120_000, 180, 500, "A", null, P).map((o) => o.maxAmount), [1000, 1000, 2000, 3000]);
});

test("natural term rounds C3 up to a menu term, 60 d without data", () => {
  assert.equal(naturalTerm(row({ receivableDays: 45 }), P), 60);
  assert.equal(naturalTerm(row({ receivableDays: 60 }), P), 60);
  assert.equal(naturalTerm(row({ receivableDays: 61 }), P), 90);
  assert.equal(naturalTerm(row({ receivableDays: -3 }), P), 30);
  assert.equal(naturalTerm(row({ receivableDays: 400 }), P), 180);
  assert.equal(naturalTerm(row({ receivableDays: null }), P), 60);
});

test("validateRequest: first option with term ≥ requested must cover the amount", () => {
  const menu = menuOf(row(), 120_000, 180, 10_000, "A", null, P);
  assert.equal(validateRequest(15_000, 45, menu), true);
  assert.equal(validateRequest(25_000, 45, menu), false);
  assert.equal(validateRequest(1_000, 200, menu), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `maxTerm is not a function`.

- [ ] **Step 3: Implement §5-§7**

Append to `lib/features/decision/engine.ts` (add `isWorse`, `worseBand`, `MenuOption`, `RateBreakdown` to the model import):

```ts
/** §5: band without the structural cut (the cut is in the table), worsened by the forecast. */
export function maxTerm(row: ScoreInput, forecastBand: Band | null, P: DecisionParameters): number {
  const current = bandOf(row.score, P);
  const table = P.term.maxDays[worseBand(current, forecastBand ?? current)];
  if (row.direction !== "deterioro") return table.base;
  return row.nature === "estructural" ? table.estructural : table.temporal;
}
export function rateOf(
  row: ScoreInput,
  termDays: number,
  band: Band,
  forecastBand: Band | null,
  P: DecisionParameters,
): { rate: number; breakdown: RateBreakdown } {
  const breakdown: RateBreakdown = {
    base: P.bands.baseRate[band],
    termPremium: P.pricing.termPremiumPer30d * Math.max(0, Math.ceil((termDays - 30) / 30)),
    confidencePremium: row.confidence < P.pricing.lowConfidence ? P.pricing.confidencePremium : 0,
    trendAdjustment:
      row.direction === "mejora"
        ? P.pricing.improvementAdjustment
        : row.direction === "deterioro"
          ? P.pricing.deteriorationAdjustment
          : 0,
    forecastPremium: forecastBand !== null && isWorse(forecastBand, band) ? P.pricing.forecastPremium : 0,
  };
  const total =
    breakdown.base +
    breakdown.termPremium +
    breakdown.confidencePremium +
    breakdown.trendAdjustment +
    breakdown.forecastPremium;
  return { rate: Math.round(total * 1e4) / 1e4, breakdown };
}
export function costOf(amount: number, rate: number, termDays: number, P: DecisionParameters): number {
  return Math.round(((amount * rate * termDays) / P.pricing.dayBasis) * 100) / 100;
}
/** §7 región factible: cantidad ≤ L and cantidad ≤ cap · meses, plazo ≤ T_max. */
export function menuOf(
  row: ScoreInput,
  limit: number,
  maxTermDays: number,
  capacity: number,
  band: Band,
  forecastBand: Band | null,
  P: DecisionParameters,
): MenuOption[] {
  const options: MenuOption[] = [];
  for (const term of P.term.menu) {
    if (term > maxTermDays) break;
    const maxAmount = roundDown(Math.min(limit, capacity * (term / 30)), P.review.rounding);
    if (maxAmount <= 0) continue;
    const { rate, breakdown } = rateOf(row, term, band, forecastBand, P);
    options.push({ term, maxAmount, rate, maxCost: costOf(maxAmount, rate, term, P), breakdown });
  }
  return options;
}
/** §6 plazo natural: C3 rounded up to a menu term; 60 d without invoices. */
export function naturalTerm(row: ScoreInput, P: DecisionParameters): number {
  const days =
    row.receivableDays === null ? P.term.defaultNaturalTerm : Math.max(1, Math.ceil(row.receivableDays));
  return P.term.menu.find((term) => term >= days) ?? P.term.menu[P.term.menu.length - 1];
}
export function validateRequest(amount: number, termDays: number, menu: MenuOption[]): boolean {
  const option = menu.find((o) => o.term >= termDays);
  return option !== undefined && amount <= option.maxAmount;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS. Sanity on the last menu case: `cap 500 → 30 d: 500 → roundDown 0 → skipped; 60 d: 1000; 90 d: 1500 → 1000; 120 d: 2000; 180 d: 3000` — four options `[1000, 1000, 2000, 3000]`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/engine.ts lib/features/decision/engine.test.ts
git commit -m "feat(decision): term, rate, cost, menu and natural term"
```

---

### Task 6: Action, next state and `decide()` (§8, §10, §11)

**Files:**
- Modify: `lib/features/decision/engine.ts`
- Test: `lib/features/decision/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/features/decision/engine.test.ts` (extend the engine import with `actionOf`, `decide`; import `type State` from model):

```ts
function state(overrides: Partial<State> = {}): State {
  return { ...initialState(), ...overrides };
}
const limitFor = (band: "A" | "B" | "C" | "D") => limitOf(row(), band, P).limit;

test("action: cerrar when not eligible, abrir from zero, reopen waits two eligible months", () => {
  assert.deepEqual(actionOf(row(), false, 120_000, "A", null, state(), P, limitFor), {
    action: "cerrar",
    appliedLimit: 0,
    reductionKind: null,
    reopenIn: null,
    pendingCut: false,
  });
  assert.equal(actionOf(row(), true, 120_000, "A", null, state(), P, limitFor).action, "abrir");
  const waiting = actionOf(
    row(),
    true,
    120_000,
    "A",
    null,
    state({ closedSince: "2025-01", eligibleMonths: 0 }),
    P,
    limitFor,
  );
  assert.deepEqual(waiting, {
    action: "mantener",
    appliedLimit: 0,
    reductionKind: null,
    reopenIn: 1,
    pendingCut: false,
  });
  assert.equal(
    actionOf(row(), true, 120_000, "A", null, state({ closedSince: "2025-01", eligibleMonths: 1 }), P, limitFor)
      .action,
    "abrir",
  );
});

test("action: hysteresis ±25 %, 2-month confirmation, structural cut immediate", () => {
  const prev = state({ previousLimit: 84_000 });
  const up = actionOf(row(), true, 117_000, "B", null, prev, P, limitFor);
  assert.deepEqual([up.action, up.appliedLimit], ["ampliar", 105_000]);
  const small = actionOf(row(), true, 90_000, "B", null, prev, P, limitFor);
  assert.deepEqual([small.action, small.appliedLimit], ["mantener", 84_000]);
  const firstCut = actionOf(row(), true, 67_000, "B", null, prev, P, limitFor);
  assert.deepEqual([firstCut.action, firstCut.appliedLimit, firstCut.pendingCut], ["mantener", 84_000, true]);
  const secondCut = actionOf(
    row(),
    true,
    50_000,
    "B",
    null,
    state({ previousLimit: 84_000, reductionMonths: 1 }),
    P,
    limitFor,
  );
  assert.deepEqual([secondCut.action, secondCut.appliedLimit, secondCut.reductionKind], ["reducir", 63_000, "confirmada"]);
  const structural = actionOf(
    row({ direction: "deterioro", nature: "estructural" }),
    true,
    48_000,
    "C",
    null,
    prev,
    P,
    limitFor,
  );
  assert.deepEqual([structural.action, structural.appliedLimit, structural.reductionKind], ["reducir", 48_000, "estructural"]);
  assert.equal(
    actionOf(row({ direction: "deterioro", nature: "temporal" }), true, 117_000, "B", null, prev, P, limitFor).action,
    "mantener",
  );
});

test("action: forecast blocks ampliar and forces a preventive cut after two months", () => {
  const prev = state({ previousLimit: 120_000 });
  assert.equal(actionOf(row(), true, 150_000, "A", "C", prev, P, limitFor).action, "mantener");
  const first = actionOf(row(), true, 120_000, "A", "C", prev, P, limitFor);
  assert.equal(first.action, "mantener");
  const second = actionOf(row(), true, 120_000, "A", "C", state({ previousLimit: 120_000, worseForecastMonths: 1 }), P, limitFor);
  assert.deepEqual([second.action, second.appliedLimit, second.reductionKind], ["reducir", 90_000, "prevision"]);
});

test("decide(): sana row opens at 120 k with the full menu; ineligible rows keep the limits for the ficha", () => {
  const open = decide(row(), null, null, P);
  assert.equal(open.eligible, true);
  assert.equal(open.action, "abrir");
  assert.equal(open.appliedLimit, 120_000);
  assert.equal(open.maxTerm, 180);
  assert.equal(open.menu.length, 5);
  assert.equal(open.naturalTerm, 60);
  assert.equal(open.forecastBandUsed, null);
  assert.equal(open.actionReason, "Elegible: score 82 (banda A), límite 120.000 € hasta 180 d");
  assert.deepEqual(open.state, {
    previousLimit: 120_000,
    previousAction: "abrir",
    eligibleMonths: 1,
    reductionMonths: 0,
    worseForecastMonths: 0,
    closedSince: null,
    crossDefault: false,
    crossDefaultSource: null,
  });

  const short = decide(row({ confidence: 0.3 }), null, null, P);
  assert.equal(short.eligible, false);
  assert.equal(short.action, "cerrar");
  assert.equal(short.limit, 0);
  assert.equal(short.appliedLimit, 0);
  assert.equal(short.capacityLimit, 120_000);
  assert.deepEqual(short.menu, []);
  assert.equal(short.state.closedSince, "2025-06");

  const structuralC = decide(row({ score: 58, direction: "deterioro", nature: "estructural" }), null, null, P);
  assert.equal(structuralC.eligible, false);
  assert.equal(structuralC.reason, "Deterioro estructural en banda C");
  assert.equal(structuralC.maxTerm, 0);

  // cash = 48 000 − 47 960 = 40 → cap 30,77 €/mes → every term rounds down to 0
  const noMenu = decide(row({ receipts6m: 60_000, payments6m: 43_600 }), null, null, P);
  assert.equal(noMenu.eligible, false);
  assert.equal(noMenu.reason, "Capacidad de cuota insuficiente para cualquier plazo");

  const disconnected = decide(
    row(),
    { band3m: "C", score3m: 50, direction: "deterioro", deteriorationProb: null, method: "desconectado" },
    null,
    P,
  );
  assert.equal(disconnected.forecastBandUsed, null);
  assert.equal(disconnected.maxTerm, 180);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `actionOf is not a function`.

- [ ] **Step 3: Implement action, state and decide()**

Append to `lib/features/decision/engine.ts` (extend the model import with `initialState`, `CrossDefault`, `Decision`, `ForecastInput`, `ReductionKind`; import `parameterVersion` from parameters and `actionReason` from templates):

```ts
export type ActionResult = {
  action: Action;
  appliedLimit: number;
  reductionKind: ReductionKind | null;
  reopenIn: number | null;
  pendingCut: boolean;
};
/** §8 accion(). `limitFor(band)` prices the limit under another band (preventive cut). */
export function actionOf(
  row: ScoreInput,
  eligible: boolean,
  limit: number,
  effective: Band,
  forecastBand: Band | null,
  prev: State,
  P: DecisionParameters,
  limitFor: (band: Band) => number,
): ActionResult {
  const none = { reductionKind: null, reopenIn: null, pendingCut: false };
  const Lp = prev.previousLimit;
  const R = P.review;
  if (!eligible) return { action: "cerrar", appliedLimit: 0, ...none };
  if (Lp === 0) {
    if (prev.closedSince !== null && prev.eligibleMonths + 1 < R.reopenMonths)
      return { ...none, action: "mantener", appliedLimit: 0, reopenIn: R.reopenMonths - (prev.eligibleMonths + 1) };
    return { action: "abrir", appliedLimit: limit, ...none };
  }
  const floor = roundDown(Lp * (1 - R.hysteresis), R.rounding);
  const ceiling = roundDown(Lp * (1 + R.hysteresis), R.rounding);
  const bounded = Math.min(ceiling, Math.max(floor, limit));
  if (isStructuralDeterioration(row) && limit < Lp)
    return { ...none, action: "reducir", appliedLimit: limit, reductionKind: "estructural" };
  const compared = forecastBand ?? effective;
  if (isWorse(compared, effective) && prev.worseForecastMonths + 1 >= R.forecastReduceMonths) {
    const predicted = limitFor(compared);
    if (predicted < Lp)
      return { ...none, action: "reducir", appliedLimit: Math.max(predicted, floor), reductionKind: "prevision" };
  }
  if (limit > R.expandRatio * Lp && row.direction !== "deterioro" && !isWorse(compared, effective))
    return { action: "ampliar", appliedLimit: bounded, ...none };
  if (limit < R.reduceRatio * Lp) {
    if (prev.reductionMonths + 1 >= R.reduceMonths)
      return { ...none, action: "reducir", appliedLimit: bounded, reductionKind: "confirmada" };
    return { ...none, action: "mantener", appliedLimit: Lp, pendingCut: true };
  }
  return { action: "mantener", appliedLimit: Lp, ...none };
}
/** §8 "Actualización del estado tras decidir". */
export function nextState(
  month: string,
  eligible: boolean,
  limit: number,
  act: ActionResult,
  effective: Band,
  forecastBand: Band | null,
  prev: State,
  crossDefault: CrossDefault,
  P: DecisionParameters,
): State {
  return {
    previousLimit: act.appliedLimit,
    previousAction: act.action,
    eligibleMonths: eligible ? prev.eligibleMonths + 1 : 0,
    reductionMonths: limit < P.review.reduceRatio * prev.previousLimit ? prev.reductionMonths + 1 : 0,
    worseForecastMonths:
      forecastBand !== null && isWorse(forecastBand, effective) ? prev.worseForecastMonths + 1 : 0,
    closedSince: act.action === "cerrar" ? month : act.action === "abrir" ? null : prev.closedSince,
    crossDefault: crossDefault.active,
    crossDefaultSource: crossDefault.source,
  };
}
/** §0-§8 for one company-month. Pure: same input → same output. */
export function decide(
  row: ScoreInput,
  forecast: ForecastInput | null,
  previous: State | null,
  P: DecisionParameters,
  crossDefault: CrossDefault = { active: false, source: null },
): Decision {
  const prev = previous ?? initialState();
  const forecastBand = forecast && forecast.method !== "desconectado" ? forecast.band3m : null;
  const band = bandOf(row.score, P);
  const effective = effectiveBand(row, P, crossDefault.active);
  const limits = limitOf(row, effective, P);
  const gate = eligibility(row, prev, P);
  let eligible = gate.eligible;
  let reason = gate.reason;
  let limit = eligible ? limits.limit : 0;
  const term = eligible ? maxTerm(row, forecastBand, P) : 0;
  if (eligible && term === 0) {
    eligible = false;
    limit = 0;
    reason = isStructuralDeterioration(row)
      ? `Deterioro estructural en banda ${band}`
      : `Sin plazo disponible en banda ${worseBand(band, forecastBand ?? band)}`;
  }
  if (eligible && menuOf(row, limit, term, limits.adverseCapacity, effective, forecastBand, P).length === 0) {
    eligible = false;
    limit = 0;
    reason = "Capacidad de cuota insuficiente para cualquier plazo";
  }
  const act = actionOf(row, eligible, limit, effective, forecastBand, prev, P, (b) => limitOf(row, b, P).limit);
  const menuLimit = Math.min(limit, act.appliedLimit);
  const menu =
    eligible && menuLimit > 0
      ? menuOf(row, menuLimit, term, limits.adverseCapacity, effective, forecastBand, P)
      : [];
  return {
    company: row.company,
    month: row.month,
    parameterVersion: parameterVersion(P),
    eligible,
    reason,
    failedGates: gate.failedGates,
    band,
    effectiveBand: effective,
    adverseCapacity: limits.adverseCapacity,
    capacityLimit: limits.capacityLimit,
    operatingLimit: limits.operatingLimit,
    limit,
    appliedLimit: act.appliedLimit,
    maxTerm: term,
    menu,
    naturalTerm: naturalTerm(row, P),
    action: act.action,
    actionReason: actionReason(row, {
      action: act.action,
      appliedLimit: act.appliedLimit,
      previousLimit: prev.previousLimit,
      maxTerm: term,
      band: effective,
      reductionKind: act.reductionKind,
      reopenIn: act.reopenIn,
      pendingCut: act.pendingCut,
      forecastBand,
      reason,
    }),
    reductionKind: act.reductionKind,
    groupReason: null,
    forecastBandUsed: forecastBand,
    state: nextState(row.month, eligible, limit, act, effective, forecastBand, prev, crossDefault, P),
  };
}
```

Also add `Action` to the model type import at the top of `engine.ts`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS. Hand check of `secondCut`: `bounded = max(63 000, min(105 000, 50 000)) = 63 000` (floor of 84 000 · 0,75 = 63 000). Preventive: `predicted = limitOf(row, "C") = 48 000 < 120 000 → max(48 000, 90 000) = 90 000`. `noMenu`: `cash = 0,8·60 000 − 1,1·43 600 = 40 → cap = 30,77`; `30,77 · 6 = 184,6 < 1 000` even at 180 d → empty menu → not eligible.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/engine.ts lib/features/decision/engine.test.ts
git commit -m "feat(decision): action, state carry-over and decide()"
```

---

### Task 7: Output contract (zod, §10)

**Files:**
- Create: `lib/features/decision/contracts.ts`
- Test: `lib/features/decision/contracts.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/features/decision/contracts.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { decisionResultSchema } from "@/lib/features/decision/contracts";
import { decide } from "@/lib/features/decision/engine";
import { sanaRow } from "@/lib/features/decision/fixtures";
import { DECISION_PARAMETERS as P } from "@/lib/features/decision/parameters";

test("decide() output satisfies the company_month_decision contract", () => {
  const decision = decide(sanaRow("2025-06"), null, null, P);
  assert.deepEqual(decisionResultSchema.parse(decision), decision);
  assert.throws(() => decisionResultSchema.parse({ ...decision, appliedLimit: -1 }));
  assert.throws(() => decisionResultSchema.parse({ ...decision, action: "pausar" }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/contracts'`.

- [ ] **Step 3: Write the contract**

```ts
// lib/features/decision/contracts.ts
import { z } from "zod";
import { ACTIONS, BANDS, GATES } from "@/lib/features/decision/model";

const finite = z.number().finite();
const money = finite.nonnegative();
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const band = z.enum(BANDS);
const action = z.enum(ACTIONS);
const breakdown = z.object({
  base: finite,
  termPremium: finite,
  confidencePremium: finite,
  trendAdjustment: finite,
  forecastPremium: finite,
});
const menuOption = z.object({
  term: z.number().int().positive(),
  maxAmount: money,
  rate: finite.min(0).max(1),
  maxCost: money,
  breakdown,
});
const state = z.object({
  previousLimit: money,
  previousAction: action.nullable(),
  eligibleMonths: z.number().int().min(0),
  reductionMonths: z.number().int().min(0),
  worseForecastMonths: z.number().int().min(0),
  closedSince: month.nullable(),
  crossDefault: z.boolean(),
  crossDefaultSource: z.string().nullable(),
});
/** decision-engine §10 company_month_decision. */
export const decisionResultSchema = z.object({
  company: z.string().min(1),
  month,
  parameterVersion: z.string().length(64),
  eligible: z.boolean(),
  reason: z.string().nullable(),
  failedGates: z.array(z.enum(GATES)),
  band,
  effectiveBand: band,
  adverseCapacity: money,
  capacityLimit: money,
  operatingLimit: money,
  limit: money,
  appliedLimit: money,
  maxTerm: z.number().int().min(0),
  menu: z.array(menuOption),
  naturalTerm: z.number().int().positive(),
  action,
  actionReason: z.string(),
  reductionKind: z.enum(["estructural", "confirmada", "prevision"]).nullable(),
  groupReason: z.string().nullable(),
  forecastBandUsed: band.nullable(),
  state,
});
export type DecisionResultDTO = z.infer<typeof decisionResultSchema>;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/contracts.ts lib/features/decision/contracts.test.ts
git commit -m "feat(decision): zod contract for company_month_decision"
```

---

### Task 8: Group step, orchestrator, fixtures and property tests (§9, §12, §13)

**Files:**
- Create: `lib/features/decision/group.ts`, `lib/features/decision/run.ts`
- Modify: `lib/features/decision/fixtures.ts` (keep `sanaRow` from Task 3, append the rest)
- Test: `lib/features/decision/run.test.ts`

- [ ] **Step 1: Extend the fixtures (hand-written inputs and expectations, per §13)**

Append to `lib/features/decision/fixtures.ts` (and widen its import to `import type { ForecastInput, ScoreInput } from "@/lib/features/decision/model";`):

```ts
export const MONTHS = ["2025-01", "2025-02", "2025-03", "2025-04", "2025-05", "2025-06"];

export function series(company: string, perMonth: Partial<ScoreInput>[]): ScoreInput[] {
  return perMonth.map((overrides, i) => sanaRow(MONTHS[i], { company, group: company, ...overrides }));
}
export function forecast(band3m: ForecastInput["band3m"]): ForecastInput {
  return { band3m, score3m: 55, direction: "deterioro", deteriorationProb: null, method: "v1_proyeccion" };
}

export const FIXTURES = {
  sana: series("sana", [{}, {}, {}, {}, {}, {}]),
  mejora: series("mejora", [
    { score: 62 },
    { score: 64 },
    { score: 66 },
    { score: 68, direction: "mejora", nature: "temporal", receipts6m: 105_250, receipts3m: 120_000 },
    { score: 71, direction: "mejora", nature: "temporal", receipts6m: 105_250, receipts3m: 120_000 },
    { score: 74, direction: "mejora", nature: "temporal", receipts6m: 105_250, receipts3m: 120_000 },
  ]),
  deterioro_estructural: series("deterioro_estructural", [
    { score: 70 },
    { score: 68 },
    { score: 66 },
    { score: 62, direction: "deterioro", nature: "estructural" },
    { score: 58, direction: "deterioro", nature: "estructural" },
    { score: 58, direction: "deterioro", nature: "estructural" },
  ]),
  bache_temporal: series("bache_temporal", [
    { score: 72 },
    { score: 72 },
    { score: 72 },
    { score: 64, direction: "deterioro", nature: "temporal", receipts3m: 40_000 },
    { score: 72 },
    { score: 72 },
  ]),
  historial_corto: series("historial_corto", [
    { confidence: 0.3 },
    { confidence: 0.3 },
    { confidence: 0.3 },
    { confidence: 0.3 },
    { confidence: 0.3 },
    { confidence: 0.3 },
  ]),
  /** Spec says "score 72 (A)"; 72 is B by the band table, so the fixture uses 80. */
  prevision_peor: series("prevision_peor", [
    { score: 80 },
    { score: 80 },
    { score: 80 },
    { score: 80 },
    { score: 80 },
    { score: 80 },
  ]),
};
export const PREVISION_PEOR_FORECASTS = new Map(
  MONTHS.slice(1).map((month) => [`prevision_peor|${month}`, forecast("C")] as const),
);

const groupFlows = { groupReceipts6m: 296_250, groupPayments6m: 180_000, groupDebtService6m: 0 };
function member(company: string, groupWeight: number, scores: number[]): ScoreInput[] {
  return scores.map((score, i) =>
    sanaRow(MONTHS[i], { company, group: "G", groupWeight, score, ...groupFlows }),
  );
}
/** §13 `grupo_caida`: g1 (D1 0,5) falls to score 40 in month 3. */
export const GRUPO_CAIDA: ScoreInput[] = [
  ...member("g1", 0.5, [80, 80, 40, 40, 40, 40]),
  ...member("g2", 0.3, [80, 80, 80, 80, 80, 80]),
  ...member("g3", 0.2, [80, 80, 80, 80, 80, 80]),
];
```

- [ ] **Step 2: Write the failing tests**

```ts
// lib/features/decision/run.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { bandOf } from "@/lib/features/decision/engine";
import { FIXTURES, GRUPO_CAIDA, MONTHS, PREVISION_PEOR_FORECASTS, sanaRow, series } from "@/lib/features/decision/fixtures";
import { groupLimit, groupStep } from "@/lib/features/decision/group";
import type { Decision, ScoreInput } from "@/lib/features/decision/model";
import { DECISION_PARAMETERS as P } from "@/lib/features/decision/parameters";
import { forecastKey, run } from "@/lib/features/decision/run";

function at(decisions: Decision[], company: string, month: string): Decision {
  const found = decisions.find((d) => d.company === company && d.month === month);
  assert.ok(found, `${company} ${month}`);
  return found;
}
function pick(d: Decision) {
  return { action: d.action, applied: d.appliedLimit, limit: d.limit, band: d.effectiveBand, term: d.maxTerm };
}

test("fixture sana: abrir at 120 k, then mantener", () => {
  const out = run(FIXTURES.sana, new Map(), P);
  assert.deepEqual(pick(at(out, "sana", "2025-01")), { action: "abrir", applied: 120_000, limit: 120_000, band: "A", term: 180 });
  for (const m of MONTHS.slice(1)) {
    const d = at(out, "sana", m);
    assert.equal(d.action, "mantener");
    assert.equal(d.appliedLimit, 120_000);
    assert.equal(d.actionReason, "Sin cambios: score 82, límite 120.000 €");
    assert.deepEqual(d.menu.map((o) => [o.term, o.maxAmount, o.rate]), [
      [30, 10_000, 0.05],
      [60, 20_000, 0.055],
      [90, 30_000, 0.06],
      [120, 40_000, 0.065],
      [180, 60_000, 0.075],
    ]);
  }
});

test("fixture mejora: ampliar when L > 1,15·Lp, bounded by +25 %, TAE −0,5 pp", () => {
  const out = run(FIXTURES.mejora, new Map(), P);
  assert.deepEqual(pick(at(out, "mejora", "2025-01")), { action: "abrir", applied: 84_000, limit: 84_000, band: "B", term: 120 });
  assert.equal(at(out, "mejora", "2025-03").action, "mantener");
  const m4 = at(out, "mejora", "2025-04");
  assert.deepEqual(pick(m4), { action: "ampliar", applied: 105_000, limit: 117_000, band: "B", term: 120 });
  assert.equal(m4.menu[0].rate, 0.065);
  assert.equal(m4.actionReason, "Límite sube de 84.000 € a 105.000 €: margin +1.0");
  assert.deepEqual(pick(at(out, "mejora", "2025-05")), { action: "mantener", applied: 105_000, limit: 117_000, band: "B", term: 120 });
  assert.equal(at(out, "mejora", "2025-06").appliedLimit, 105_000);
});

test("fixture deterioro_estructural: band drop + immediate cut, then T_max 0 → cerrar", () => {
  const out = run(FIXTURES.deterioro_estructural, new Map(), P);
  assert.deepEqual(pick(at(out, "deterioro_estructural", "2025-01")), { action: "abrir", applied: 84_000, limit: 84_000, band: "B", term: 120 });
  const m4 = at(out, "deterioro_estructural", "2025-04");
  assert.deepEqual(pick(m4), { action: "reducir", applied: 48_000, limit: 48_000, band: "C", term: 30 });
  assert.equal(m4.reductionKind, "estructural");
  assert.deepEqual(m4.menu.map((o) => [o.term, o.maxAmount, o.rate]), [[30, 10_000, 0.11]]);
  const m5 = at(out, "deterioro_estructural", "2025-05");
  assert.equal(m5.eligible, false);
  assert.equal(m5.reason, "Deterioro estructural en banda C");
  assert.deepEqual(pick(m5), { action: "cerrar", applied: 0, limit: 0, band: "D", term: 0 });
  assert.equal(at(out, "deterioro_estructural", "2025-06").action, "cerrar");
});

test("fixture bache_temporal: one bad month never reduces", () => {
  const out = run(FIXTURES.bache_temporal, new Map(), P);
  const m4 = at(out, "bache_temporal", "2025-04");
  assert.deepEqual(pick(m4), { action: "mantener", applied: 84_000, limit: 67_000, band: "B", term: 90 });
  assert.equal(m4.actionReason, "Pendiente confirmar bajada");
  assert.equal(m4.state.reductionMonths, 1);
  assert.equal(m4.menu[0].rate, 0.08);
  const m5 = at(out, "bache_temporal", "2025-05");
  assert.deepEqual(pick(m5), { action: "mantener", applied: 84_000, limit: 84_000, band: "B", term: 120 });
  assert.equal(m5.state.reductionMonths, 0);
  assert.ok(out.filter((d) => d.company === "bache_temporal").every((d) => d.action !== "reducir"));
});

test("fixture historial_corto: never eligible, limits still computed", () => {
  const out = run(FIXTURES.historial_corto, new Map(), P);
  for (const d of out) {
    assert.equal(d.eligible, false);
    assert.equal(d.reason, "Historial insuficiente: confianza 0,30 < 0,5");
    assert.deepEqual(d.failedGates, ["historia"]);
    assert.equal(d.action, "cerrar");
    assert.equal(d.appliedLimit, 0);
    assert.equal(d.capacityLimit, 120_000);
  }
});

test("fixture prevision_peor: forecast shortens term, adds 0,5 pp, cuts after 2 months, never expands", () => {
  const out = run(FIXTURES.prevision_peor, PREVISION_PEOR_FORECASTS, P);
  assert.deepEqual(pick(at(out, "prevision_peor", "2025-01")), { action: "abrir", applied: 120_000, limit: 120_000, band: "A", term: 180 });
  const m2 = at(out, "prevision_peor", "2025-02");
  assert.deepEqual(pick(m2), { action: "mantener", applied: 120_000, limit: 120_000, band: "A", term: 60 });
  assert.equal(m2.forecastBandUsed, "C");
  assert.equal(m2.state.worseForecastMonths, 1);
  assert.deepEqual(m2.menu.map((o) => [o.term, o.rate]), [[30, 0.055], [60, 0.06]]);
  const m3 = at(out, "prevision_peor", "2025-03");
  assert.deepEqual(pick(m3), { action: "reducir", applied: 90_000, limit: 120_000, band: "A", term: 60 });
  assert.equal(m3.reductionKind, "prevision");
  assert.equal(m3.actionReason, "Límite baja de 120.000 € a 90.000 €: previsión: banda C en 3 meses, margin +1.0");
  assert.equal(at(out, "prevision_peor", "2025-04").appliedLimit, 67_000);
  assert.equal(at(out, "prevision_peor", "2025-05").appliedLimit, 50_000);
  assert.equal(at(out, "prevision_peor", "2025-06").appliedLimit, 48_000);
  assert.ok(out.every((d) => d.action !== "ampliar"));
});

test("fixture grupo_caida: cross-default lowers siblings a band, closes them next month", () => {
  const out = run(GRUPO_CAIDA, new Map(), P);
  for (const c of ["g1", "g2", "g3"]) {
    assert.deepEqual(pick(at(out, c, "2025-01")), { action: "abrir", applied: 120_000, limit: 120_000, band: "A", term: 180 });
    assert.equal(at(out, c, "2025-01").groupReason, null);
    assert.equal(at(out, c, "2025-02").action, "mantener");
  }
  const g1 = at(out, "g1", "2025-03");
  assert.equal(g1.action, "cerrar");
  assert.equal(g1.reason, "Score 40 por debajo de 45");
  for (const c of ["g2", "g3"]) {
    const m3 = at(out, c, "2025-03");
    assert.deepEqual(pick(m3), { action: "mantener", applied: 120_000, limit: 84_000, band: "B", term: 180 });
    assert.equal(m3.actionReason, "Pendiente confirmar bajada");
    assert.equal(m3.state.crossDefault, true);
    assert.equal(m3.state.crossDefaultSource, "g1 (50 % del grupo)");
    const m4 = at(out, c, "2025-04");
    assert.equal(m4.action, "cerrar");
    assert.deepEqual(m4.failedGates, ["grupo"]);
    assert.equal(m4.reason, "Cierre de g1 (50 % del grupo)");
    assert.equal(at(out, c, "2025-05").action, "cerrar");
    assert.equal(at(out, c, "2025-06").action, "cerrar");
  }
});

test("group ceiling: Σ L_vigente ≤ L over consolidated flows", () => {
  // b has negative adverse cash (cap 0 → gate caja → cerrar) and D1 0,2, so no cross-default;
  // the group's consolidated cap is (158 000 − 154 000)/1,3 = 3 076,92 → 36 923 → 36 000.
  const a = sanaRow("2025-01", { company: "a", group: "G", groupWeight: 0.8, groupReceipts6m: 197_500, groupPayments6m: 140_000 });
  const b = sanaRow("2025-01", { company: "b", group: "G", groupWeight: 0.2, payments6m: 80_000, groupReceipts6m: 197_500, groupPayments6m: 140_000 });
  assert.equal(groupLimit([a, b], P), 36_000);
  const [da, db] = groupStep(
    [
      { row: a, forecast: null, prev: null },
      { row: b, forecast: null, prev: null },
    ],
    P,
  );
  assert.equal(db.action, "cerrar");
  assert.equal(da.action, "abrir");
  assert.equal(da.appliedLimit, 36_000);
  assert.equal(da.state.previousLimit, 36_000);
  assert.equal(da.groupReason, "Techo de grupo: 36.000 €");
});

// ---- property tests (§13) over the fixtures plus a seeded synthetic portfolio ----

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(1_664_525, s) + 1_013_904_223) >>> 0;
    return s / 2 ** 32;
  };
}
function synthetic(seed: number): ScoreInput[] {
  const rnd = lcg(seed);
  const months = Array.from({ length: 12 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`);
  const rows: ScoreInput[] = [];
  for (let g = 0; g < 8; g++) {
    const size = 1 + Math.floor(rnd() * 4);
    const weights = Array.from({ length: size }, () => 0.2 + rnd());
    const total = weights.reduce((x, y) => x + y, 0);
    // group-level flows are shared by every member of the group-month (as the adapter guarantees)
    const groupReceipts = 100_000 * size;
    for (let c = 0; c < size; c++) {
      let score = 30 + rnd() * 60;
      for (const month of months) {
        score = Math.max(0, Math.min(100, score + (rnd() - 0.5) * 16));
        const direction = rnd() < 0.2 ? "deterioro" : rnd() < 0.25 ? "mejora" : "estable";
        const receipts = 50_000 + rnd() * 100_000;
        rows.push(
          sanaRow(month, {
            company: `g${g}c${c}`,
            group: `g${g}`,
            score,
            confidence: 0.2 + rnd() * 0.8,
            direction,
            nature: direction === "estable" ? "sin_cambio" : rnd() < 0.5 ? "estructural" : "temporal",
            obligationStreak: rnd() < 0.1 ? 2 : 0,
            deficitStreak: Math.floor(rnd() * 4),
            overdueShare: rnd() < 0.2 ? null : rnd() * 0.6,
            receipts3m: receipts * (0.8 + rnd() * 0.4),
            receipts6m: receipts,
            payments6m: receipts * (0.4 + rnd() * 0.5),
            debtService6m: rnd() * 5_000,
            groupWeight: weights[c] / total,
            groupReceipts6m: groupReceipts,
            groupPayments6m: groupReceipts * 0.6,
            groupDebtService6m: 2_000 * size,
          }),
        );
      }
    }
  }
  return rows;
}
const ALL_ROWS = [...Object.values(FIXTURES).flat(), ...GRUPO_CAIDA, ...synthetic(42)];
const ALL = run(ALL_ROWS, PREVISION_PEOR_FORECASTS, P);

test("property 1: not eligible ⇒ L_vigente = 0", () => {
  for (const d of ALL) if (!d.eligible) assert.equal(d.appliedLimit, 0, `${d.company} ${d.month}`);
});
test("property 2: cantidad_max and tae never decrease with the term; all ≤ L", () => {
  for (const d of ALL)
    for (let i = 1; i < d.menu.length; i++) {
      assert.ok(d.menu[i].maxAmount >= d.menu[i - 1].maxAmount, `${d.company} ${d.month}`);
      assert.ok(d.menu[i].rate >= d.menu[i - 1].rate, `${d.company} ${d.month}`);
      assert.ok(d.menu[i].maxAmount <= d.limit);
    }
});
test("property 3: |L_vigente − L_prev| ≤ 25 % except cerrar, structural cut and group ceiling", () => {
  const prev = new Map<string, number>();
  for (const d of ALL) {
    const Lp = prev.get(d.company) ?? 0;
    const exempt = d.action === "cerrar" || d.reductionKind === "estructural" || d.groupReason !== null || Lp === 0;
    if (!exempt)
      assert.ok(
        Math.abs(d.appliedLimit - Lp) <= 0.25 * Lp + P.review.rounding,
        `${d.company} ${d.month}: ${Lp} → ${d.appliedLimit}`,
      );
    prev.set(d.company, d.appliedLimit);
  }
});
test("property 4: Σ L_vigente of a group-month ≤ L_grupo", () => {
  const byGroupMonth = new Map<string, { rows: ScoreInput[]; total: number }>();
  for (const d of ALL) {
    const row = ALL_ROWS.find((r) => r.company === d.company && r.month === d.month)!;
    const key = `${row.group}|${d.month}`;
    const entry = byGroupMonth.get(key) ?? { rows: [], total: 0 };
    entry.rows.push(row);
    entry.total += d.appliedLimit;
    byGroupMonth.set(key, entry);
  }
  for (const [key, { rows, total }] of byGroupMonth)
    assert.ok(total <= groupLimit(rows, P) + 1e-6, `${key}: ${total} > ${groupLimit(rows, P)}`);
});
test("property 5: same input twice → identical output", () => {
  assert.deepEqual(run(ALL_ROWS, PREVISION_PEOR_FORECASTS, P), ALL);
});
test("property 7: forecast band equal to the current band changes nothing", () => {
  const rows = synthetic(7);
  const same = new Map(rows.map((r) => [forecastKey(r.company, r.month), { band3m: bandOf(r.score, P), score3m: r.score, direction: "estable" as const, deteriorationProb: null, method: "v1_proyeccion" as const }]));
  const strip = (d: Decision) => ({ ...d, forecastBandUsed: null });
  assert.deepEqual(run(rows, same, P).map(strip), run(rows, new Map(), P).map(strip));
});
test("run() covers every input row exactly once, sorted by company then month", () => {
  assert.equal(ALL.length, ALL_ROWS.length);
  for (let i = 1; i < ALL.length; i++)
    assert.ok(`${ALL[i - 1].company}|${ALL[i - 1].month}` < `${ALL[i].company}|${ALL[i].month}`);
  assert.equal(series("x", [{}]).length, 1);
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/group'`.

- [ ] **Step 4: Write the group step**

```ts
// lib/features/decision/group.ts
import { bandOf, decide, limitOf } from "@/lib/features/decision/engine";
import {
  euros,
  roundDown,
  sum,
  type Decision,
  type ForecastInput,
  type ScoreInput,
  type State,
} from "@/lib/features/decision/model";
import type { DecisionParameters } from "@/lib/features/decision/parameters";

export type Member = { row: ScoreInput; forecast: ForecastInput | null; prev: State | null };

/** §9 techo: L over the consolidated group flows, score weighted by cobros_op_media6m. */
export function groupLimit(rows: ScoreInput[], P: DecisionParameters): number {
  const weight = sum(rows.map((r) => r.receipts6m));
  const mean = (pick: (r: ScoreInput) => number) =>
    weight > 0 ? sum(rows.map((r) => pick(r) * r.receipts6m)) / weight : sum(rows.map(pick)) / rows.length;
  const consolidated: ScoreInput = {
    ...rows[0],
    company: `grupo:${rows[0].group}`,
    score: mean((r) => r.score),
    confidence: mean((r) => r.confidence),
    direction: "estable",
    nature: "sin_cambio",
    receipts3m: sum(rows.map((r) => r.receipts3m)),
    receipts6m: rows[0].groupReceipts6m,
    payments6m: rows[0].groupPayments6m,
    debtService6m: rows[0].groupDebtService6m,
  };
  return limitOf(consolidated, bandOf(consolidated.score, P), P).limit;
}

/** A genuine fall: closed for a reason other than the group gate alone. */
function fallen(decision: Decision, row: ScoreInput, P: DecisionParameters): boolean {
  if (decision.action !== "cerrar" || row.groupWeight < P.group.crossDefaultWeight) return false;
  return !(decision.failedGates.length === 1 && decision.failedGates[0] === "grupo");
}

/** §9: decide every member, apply cross-default this month, then the group ceiling. */
export function groupStep(members: Member[], P: DecisionParameters): Decision[] {
  let decisions = members.map((m) => decide(m.row, m.forecast, m.prev, P));
  const falls = members.filter((m, i) => fallen(decisions[i], m.row, P));
  if (falls.length) {
    const first = falls[0].row;
    const source = `${first.company} (${Math.round(first.groupWeight * 100)} % del grupo)`;
    decisions = members.map((m, i) =>
      falls.includes(m) ? decisions[i] : decide(m.row, m.forecast, m.prev, P, { active: true, source }),
    );
  }
  const ceiling = groupLimit(members.map((m) => m.row), P);
  const total = sum(decisions.map((d) => d.appliedLimit));
  if (total > ceiling) {
    decisions = decisions.map((d) => {
      const appliedLimit = roundDown((d.appliedLimit * ceiling) / total, P.review.rounding);
      return {
        ...d,
        appliedLimit,
        groupReason: `Techo de grupo: ${euros(ceiling)}`,
        state: { ...d.state, previousLimit: appliedLimit },
      };
    });
  }
  return decisions;
}
```

- [ ] **Step 5: Write the orchestrator**

```ts
// lib/features/decision/run.ts
import { groupStep, type Member } from "@/lib/features/decision/group";
import type { Decision, ForecastInput, ScoreInput, State } from "@/lib/features/decision/model";
import { DECISION_PARAMETERS, type DecisionParameters } from "@/lib/features/decision/parameters";

export function forecastKey(company: string, month: string): string {
  return `${company}|${month}`;
}
/** §12: months in order, state carried per company, group step per group. */
export function run(
  rows: ScoreInput[],
  forecasts: Map<string, ForecastInput> = new Map(),
  P: DecisionParameters = DECISION_PARAMETERS,
): Decision[] {
  const byMonth = new Map<string, ScoreInput[]>();
  for (const row of rows) {
    const list = byMonth.get(row.month) ?? [];
    list.push(row);
    byMonth.set(row.month, list);
  }
  const states = new Map<string, State>();
  const out: Decision[] = [];
  for (const month of [...byMonth.keys()].sort()) {
    const groups = new Map<string, ScoreInput[]>();
    for (const row of byMonth.get(month)!.sort((a, b) => a.company.localeCompare(b.company))) {
      const list = groups.get(row.group) ?? [];
      list.push(row);
      groups.set(row.group, list);
    }
    for (const members of groups.values()) {
      const input: Member[] = members.map((row) => ({
        row,
        forecast: forecasts.get(forecastKey(row.company, month)) ?? null,
        prev: states.get(row.company) ?? null,
      }));
      for (const decision of groupStep(input, P)) {
        states.set(decision.company, decision.state);
        out.push(decision);
      }
    }
  }
  return out.sort((a, b) => a.company.localeCompare(b.company) || a.month.localeCompare(b.month));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `pnpm test`
Expected: PASS for all fixture and property tests. A failing property test names the offending `company month` in its message; fix the engine, never loosen the property.

- [ ] **Step 7: Commit**

```bash
git add lib/features/decision/group.ts lib/features/decision/run.ts lib/features/decision/fixtures.ts lib/features/decision/run.test.ts
git commit -m "feat(decision): group step, month orchestrator, fixtures and property tests"
```

---

### Task 9: Extend Eric's scoring output with the ▶ fields

**Files:**
- Modify: `lib/features/scoring/model.ts` (`Flow`, `emptyFlow`, `monthlyFlows`, `Result`, `MODEL_SPEC.name`)
- Modify: `lib/features/scoring/engine.ts` (`scoreCompany`)
- Modify: `lib/features/scoring/contracts.ts` (`scoreResultSchema`)
- Modify: `lib/features/scoring/backtest.ts` (export `eventAt`)
- Test: `lib/features/scoring/engine.test.ts`

- [ ] **Step 1: Add failing tests**

Append to `lib/features/scoring/engine.test.ts`:

```ts
test("obligation categories are tracked per month", () => {
  const products = new Map<string, Product>([["cash", { company: "c", type: "checking", currency: "EUR" }]]);
  const make = (id: string, amount: number, category: string): Tx => ({
    id,
    company: "c",
    product: "cash",
    date: "2025-01-10",
    month: "2025-01",
    amount,
    category,
    counterparty: "x",
  });
  const f = monthlyFlows(
    "c",
    [make("1", -50, "tax"), make("2", -30, "salary"), make("3", -70, "debt_repayment"), make("4", -20, "payment")],
    products,
  ).get("2025-01")!;
  assert.deepEqual(f.obligations, { tax: 50, social_security: 0, salary: 30, debt_repayment: 70 });
  assert.equal(f.spent, 100);
  assert.equal(f.debt, 70);
});

test("obligation streak, deficit streak and flow averages reach the result row", () => {
  const flows = new Map<string, ReturnType<typeof emptyFlow>>();
  const list = months().slice(0, 8);
  list.forEach((m, i) => {
    const f = emptyFlow("c", m);
    f.observed = true;
    f.received = 100;
    f.spent = i >= 6 ? 130 : 60;
    f.classified = f.received + f.spent;
    f.obligations.tax = i < 6 ? 10 : 0;
    flows.set(m, f);
  });
  const params = fit([], ["a", "b"], "fixture");
  const rows = scoreCompany("c", flows, [], params);
  const last = rows[7];
  assert.equal(last.obligationStreak, 2);
  assert.equal(last.deficitStreak, 2);
  assert.equal(rows[5].obligationStreak, 0);
  assert.equal(rows[5].deficitStreak, 0);
  assert.equal(rows[5].flows.receipts6m, 100);
  assert.equal(rows[5].flows.receipts3m, 100);
  assert.equal(rows[5].flows.payments6m, 60);
  assert.equal(rows[0].flows.receipts6m, 100 / 6);
  assert.equal(rows[11].flows.receipts12m, 800);
  assert.equal(rows[8].deficitStreak, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `f.obligations` undefined / property does not exist on type `Flow` (typecheck) — `pnpm run typecheck` also fails.

- [ ] **Step 3: Extend `Flow` and `monthlyFlows` in `lib/features/scoring/model.ts`**

Add after the `INDICATORS` block:

```ts
export const OBLIGATIONS = ["tax", "social_security", "salary", "debt_repayment"] as const;
export type Obligation = (typeof OBLIGATIONS)[number];
export function isObligation(category: string): category is Obligation {
  return (OBLIGATIONS as readonly string[]).includes(category);
}
```

In `type Flow` add `obligations: Record<Obligation, number>;` after `collectedRefund`. In `emptyFlow` add `obligations: { tax: 0, social_security: 0, salary: 0, debt_repayment: 0 },`.

In `type Result` add, after `coverage`:

```ts
  flows: {
    receipts3m: number;
    receipts6m: number;
    payments6m: number;
    debtService6m: number;
    receipts12m: number;
  };
  deficitStreak: number;
  obligationStreak: number;
```

In `monthlyFlows`, inside the `PAYMENTS` branch after `if (t.category === "collection_refund") f.collectedRefund += a;` add:

```ts
      if (isObligation(t.category)) f.obligations[t.category] += a;
```

and change the `debt_repayment` branch to:

```ts
    } else if (t.category === "debt_repayment" && t.amount < 0) {
      f.debt += a;
      f.obligations.debt_repayment += a;
    } else if (t.category === "interest_charge" && t.amount < 0) f.interest += a;
```

Change `MODEL_SPEC.name` to `"scoring-engine-v0.2-legacy-3"` (output contract changed → new parameter version → new run id).

- [ ] **Step 4: Compute the new fields in `lib/features/scoring/engine.ts`**

Add two helpers above `export function scoreCompany` (import `OBLIGATIONS` from the model):

```ts
/** SOURCE §1.3 racha B2, minimal: a category is recurrent if paid ≥ 3 of the last 6 months. */
function obligationStreak(recent: Flow[]): number {
  let worst = 0;
  for (const k of OBLIGATIONS) {
    const paid = recent.map((f) => f.obligations[k]);
    if (paid.filter((x) => x > 0).length < 3) continue;
    let streak = 0;
    for (let i = paid.length - 1; i >= 0 && paid[i] === 0; i--) streak++;
    worst = Math.max(worst, streak);
  }
  return worst;
}
function deficitStreak(history: Flow[]): number {
  let streak = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const f = history[i];
    if (f.observed && f.received < f.spent) streak++;
    else break;
  }
  return streak;
}
```

Inside the `for (let t …)` loop, after `const current3 = …;` add:

```ts
    const year12 = raws.slice(Math.max(0, t - 11), t + 1).map((r) => r.flow);
    const flowSummary = {
      receipts3m: sum(current3.map((f) => f.received)) / 3,
      receipts6m: avg("received"),
      payments6m: avg("spent"),
      debtService6m: avg("debt") + avg("interest"),
      receipts12m: sum(year12.map((f) => f.received)),
    };
```

and in `results.push({ … })` add after `coverage: { … },`:

```ts
      flows: flowSummary,
      deficitStreak: deficitStreak(raws.slice(0, t + 1).map((r) => r.flow)),
      obligationStreak: obligationStreak(recent),
```

- [ ] **Step 5: Extend the zod contract in `lib/features/scoring/contracts.ts`**

After `coverage: z.object({ … }),` add:

```ts
  flows: z.object({
    receipts3m: finite.nonnegative(),
    receipts6m: finite.nonnegative(),
    payments6m: finite.nonnegative(),
    debtService6m: finite.nonnegative(),
    receipts12m: finite.nonnegative(),
  }),
  deficitStreak: z.number().int().min(0),
  obligationStreak: z.number().int().min(0),
```

- [ ] **Step 6: Export `eventAt` from `lib/features/scoring/backtest.ts`**

Change the signature to accept any row with `monthlyDeficit` and export it:

```ts
export function eventAt(rows: Pick<Result, "monthlyDeficit">[], index: number, kind: Kind): boolean {
```

(and `export type Kind = …`).

- [ ] **Step 7: Run tests and typecheck**

Run: `pnpm test && pnpm run typecheck`
Expected: PASS. The existing scoring tests are untouched: the `operational flows` test asserts `spent 30` with no obligation categories, so it still passes.

- [ ] **Step 8: Commit**

```bash
git add lib/features/scoring/model.ts lib/features/scoring/engine.ts lib/features/scoring/contracts.ts lib/features/scoring/backtest.ts lib/features/scoring/engine.test.ts
git commit -m "feat(scoring): emit flow averages, deficit and obligation streaks for decision"
```

---

### Task 10: Adapter from Eric's score rows to `ScoreInput`

**Files:**
- Create: `lib/features/decision/adapter.ts`
- Test: `lib/features/decision/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/features/decision/adapter.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { groupTotals, toScoreInput, totalsKey } from "@/lib/features/decision/adapter";
import { fit, scoreCompany } from "@/lib/features/scoring/engine";
import { emptyFlow, months } from "@/lib/features/scoring/model";

function scored(company: string, received: number) {
  const flows = new Map<string, ReturnType<typeof emptyFlow>>();
  for (const m of months().slice(0, 12)) {
    const f = emptyFlow(company, m);
    f.observed = true;
    f.received = received;
    f.spent = received * 0.6;
    f.classified = f.received + f.spent;
    flows.set(m, f);
  }
  return scoreCompany(company, flows, [], fit([], ["g"], "fixture"));
}

test("adapter maps Eric's result row and group totals to the decision input", () => {
  const rows = [...scored("a", 100), ...scored("b", 300)];
  const groupOf = new Map([
    ["a", "G"],
    ["b", "G"],
  ]);
  const totals = groupTotals(rows, groupOf);
  const month = months()[11];
  const t = totals.get(totalsKey("G", month))!;
  assert.equal(t.receipts12m, 4800);
  assert.equal(t.receipts6m, 400);
  assert.equal(t.payments6m, 240);
  const a = rows.find((r) => r.company === "a" && r.month === month)!;
  const input = toScoreInput(a, "G", t);
  assert.equal(input.group, "G");
  assert.equal(input.groupWeight, 0.25);
  assert.equal(input.receipts6m, 100);
  assert.equal(input.groupReceipts6m, 400);
  assert.equal(input.overdueShare, null);
  assert.equal(input.receivableDays, null);
  assert.equal(input.direction, a.direction);
  assert.ok(input.topDelta === null || /^[a-zA-Z]+ [+-]\d+\.\d$/.test(input.topDelta));
  const naive = toScoreInput(a, "G", t, true);
  assert.equal(naive.direction, "estable");
  assert.equal(naive.nature, "sin_cambio");
  assert.equal(toScoreInput(a, "G", { receipts12m: 0, receipts6m: 0, payments6m: 0, debtService6m: 0 }).groupWeight, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/adapter'`.

- [ ] **Step 3: Write the adapter**

```ts
// lib/features/decision/adapter.ts
import type { ScoreInput } from "@/lib/features/decision/model";
import type { ScoreResultDTO } from "@/lib/features/scoring/contracts";

export type GroupTotals = {
  receipts12m: number;
  receipts6m: number;
  payments6m: number;
  debtService6m: number;
};
export function totalsKey(group: string, month: string): string {
  return `${group}|${month}`;
}
/** Consolidated group flows = Σ members (intragroup mirrors are not removed; declared limitation). */
export function groupTotals(rows: ScoreResultDTO[], groupOf: Map<string, string>): Map<string, GroupTotals> {
  const totals = new Map<string, GroupTotals>();
  for (const row of rows) {
    const key = totalsKey(groupOf.get(row.company) ?? row.company, row.month);
    const t = totals.get(key) ?? { receipts12m: 0, receipts6m: 0, payments6m: 0, debtService6m: 0 };
    t.receipts12m += row.flows.receipts12m;
    t.receipts6m += row.flows.receipts6m;
    t.payments6m += row.flows.payments6m;
    t.debtService6m += row.flows.debtService6m;
    totals.set(key, t);
  }
  return totals;
}
/** "indicator ±x.y" of the largest |delta| in the score row, for motivo_accion. */
export function topDelta(row: ScoreResultDTO): string | null {
  const top = [...row.deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  return top ? `${top.indicator} ${top.delta >= 0 ? "+" : ""}${top.delta.toFixed(1)}` : null;
}
/** Eric's `Result` → decision-engine §1 row. `naive` strips direction/nature for the §14 baseline. */
export function toScoreInput(
  row: ScoreResultDTO,
  group: string,
  totals: GroupTotals,
  naive = false,
): ScoreInput {
  const raw = (indicator: string) => row.contributions.find((c) => c.indicator === indicator)?.raw ?? null;
  return {
    company: row.company,
    month: row.month,
    group,
    score: row.score,
    confidence: row.confidence,
    direction: naive ? "estable" : row.direction,
    nature: naive ? "sin_cambio" : row.nature,
    obligationStreak: row.obligationStreak,
    deficitStreak: row.deficitStreak,
    overdueShare: raw("overdue"),
    receivableDays: raw("receivableDelay"),
    receipts3m: row.flows.receipts3m,
    receipts6m: row.flows.receipts6m,
    payments6m: row.flows.payments6m,
    debtService6m: row.flows.debtService6m,
    groupWeight: totals.receipts12m > 0 ? row.flows.receipts12m / totals.receipts12m : 1,
    groupReceipts6m: totals.receipts6m,
    groupPayments6m: totals.payments6m,
    groupDebtService6m: totals.debtService6m,
    topDelta: topDelta(row),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS. (`receipts12m` at month index 11 = 12 · 100 + 12 · 300 = 4 800; `receipts6m` = 100 + 300.)

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision/adapter.ts lib/features/decision/adapter.test.ts
git commit -m "feat(decision): adapter from scoring rows to decision input"
```

---

### Task 11: Batch script `decision:run`

**Files:**
- Create: `scripts/decision.ts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Write the script (run command only; backtest/import added in Tasks 12-13)**

```ts
// scripts/decision.ts
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { groupTotals, toScoreInput, totalsKey } from "../lib/features/decision/adapter";
import { decisionResultSchema } from "../lib/features/decision/contracts";
import type { Decision } from "../lib/features/decision/model";
import { DECISION_PARAMETERS, parameterVersion } from "../lib/features/decision/parameters";
import { run } from "../lib/features/decision/run";
import { scoreResultSchema, type ScoreResultDTO } from "../lib/features/scoring/contracts";
import type { Meta } from "../lib/features/scoring/ingest";
import type { Parameters } from "../lib/features/scoring/model";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-v02"));
const command = process.argv[2];
const version = parameterVersion(DECISION_PARAMETERS);

type ScoreManifest = { runId: string; fingerprint: string; parameterVersion: string; rows: number };
async function scoringRun() {
  const meta = JSON.parse(await readFile(path.join(dir, "ingest.json"), "utf8")) as Meta;
  const params = JSON.parse(
    await readFile(process.env.SCORING_PARAMS ?? path.join(dir, "parameters.json"), "utf8"),
  ) as Parameters;
  const scoreDir = path.join(dir, "runs", params.version, meta.fingerprint);
  const manifest = JSON.parse(await readFile(path.join(scoreDir, "manifest.json"), "utf8")) as ScoreManifest;
  const decisionDir = path.join(scoreDir, "decision", version);
  await mkdir(decisionDir, { recursive: true });
  return { meta, params, scoreDir, manifest, decisionDir };
}
async function* lines<T>(file: string): AsyncGenerator<T> {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity }))
    if (line) yield JSON.parse(line) as T;
}
async function loadScores(scoreDir: string): Promise<ScoreResultDTO[]> {
  const rows: ScoreResultDTO[] = [];
  for await (const row of lines<ScoreResultDTO>(path.join(scoreDir, "scores.jsonl")))
    rows.push(scoreResultSchema.parse(row));
  return rows;
}
export function decideAll(scores: ScoreResultDTO[], meta: Meta, naive = false): Decision[] {
  const groupOf = new Map(meta.companies.map((c) => [c.id, c.groupId]));
  const totals = groupTotals(scores, groupOf);
  const inputs = scores.map((row) => {
    const group = groupOf.get(row.company) ?? row.company;
    return toScoreInput(row, group, totals.get(totalsKey(group, row.month))!, naive);
  });
  return run(inputs, new Map(), DECISION_PARAMETERS);
}
async function doRun() {
  const { meta, manifest, scoreDir, decisionDir } = await scoringRun();
  const decisions = decideAll(await loadScores(scoreDir), meta);
  const output = createWriteStream(path.join(decisionDir, "decisions.jsonl"));
  for (const d of decisions)
    if (!output.write(JSON.stringify(decisionResultSchema.parse(d)) + "\n")) await once(output, "drain");
  output.end();
  await once(output, "finish");
  const out = {
    runId: createHash("sha256").update(`${manifest.runId}:${version}`).digest("hex").slice(0, 24),
    scoreRunId: manifest.runId,
    parameterVersion: version,
    rows: decisions.length,
    completedAt: new Date().toISOString(),
  };
  await writeFile(path.join(decisionDir, "manifest.json"), JSON.stringify(out));
  console.log(JSON.stringify(out));
}
if (command === "run") await doRun();
else throw new Error("Usage: decision.ts run|backtest|import");
```

- [ ] **Step 2: Add the scripts to `package.json`**

After `"scoring:import": …` add:

```json
    "decision:run": "node --import tsx scripts/decision.ts run",
    "decision:backtest": "node --import tsx scripts/decision.ts backtest",
    "decision:import": "node --conditions=react-server --import tsx scripts/decision.ts import",
```

- [ ] **Step 3: Run end to end on the real dataset**

The dataset must be real CSVs, not LFS pointers (`git lfs pull`). Regenerate scoring with the new contract first (the `name` bump gives a new parameter version):

Run:
```bash
pnpm scoring:fit && pnpm scoring:score && pnpm decision:run
```
Expected: the last line is a JSON manifest like `{"runId":"…","scoreRunId":"…","parameterVersion":"…","rows":30864,…}` with `rows` equal to the scoring manifest's `rows`. Quick sanity:

```bash
node -e "const fs=require('fs');const p=process.argv[1];const rows=fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);const c={};for(const r of rows)c[r.action]=(c[r.action]||0)+1;console.log(c)" "$(ls tmp/scoring-v02/runs/*/*/decision/*/decisions.jsonl | head -1)"
```
Expected: a count per action; `mantener` should dominate, `cerrar` heavy in the first months (no history).

- [ ] **Step 4: Typecheck and commit**

Run: `pnpm run typecheck`
Expected: exit 0.

```bash
git add scripts/decision.ts package.json
git commit -m "feat(decision): batch run over a scoring run"
```

---

### Task 12: Backtest metrics for the jury (§14)

**Files:**
- Create: `lib/features/decision/backtest.ts`
- Modify: `scripts/decision.ts`
- Test: `lib/features/decision/backtest.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// lib/features/decision/backtest.test.ts
import assert from "node:assert/strict";
import test from "node:test";
import { decisionBacktest } from "@/lib/features/decision/backtest";
import { decide } from "@/lib/features/decision/engine";
import { sanaRow } from "@/lib/features/decision/fixtures";
import type { Decision } from "@/lib/features/decision/model";
import { DECISION_PARAMETERS as P } from "@/lib/features/decision/parameters";

/** 14 months so that a closure at index 6 has the 6 following months the false-closure rule needs. */
const months = Array.from({ length: 14 }, (_, i) => `2025-${String(i + 1).padStart(2, "0")}`).map(
  (m, i) => (i < 12 ? m : `2026-${String(i - 11).padStart(2, "0")}`),
);
/** deficits from index 8 on: event_deterioro at index 8, preceded by 6+ non-deficit months. */
const deficits = months.map((_, i) => i >= 8);

function decisionsWith(actions: Decision["action"][], limits: number[]): Decision[] {
  return months.map((month, i) => ({
    ...decide(sanaRow(month), null, null, P),
    month,
    action: actions[i],
    appliedLimit: limits[i],
  }));
}

test("§14 metrics: avoided exposure, lead time, false closures, churn, revenue", () => {
  const scores = months.map((month, i) => ({ company: "c", month, monthlyDeficit: deficits[i] }));
  const actions: Decision["action"][] = ["abrir", "mantener", "mantener", "mantener", "mantener", "reducir", ...(Array(8).fill("cerrar") as Decision["action"][])];
  const limits = [120_000, 120_000, 120_000, 120_000, 120_000, 90_000, ...Array(8).fill(0)];
  const cut = decisionsWith(actions, limits);
  const naive = decisionsWith(Array(14).fill("mantener") as Decision["action"][], Array(14).fill(120_000));
  const report = decisionBacktest(scores, cut, naive, P);
  assert.equal(report.events, 1);
  assert.equal(report.avoidedExposure, 120_000);
  assert.equal(report.avoidedExposureNaive, 0);
  assert.equal(report.closeLeadMedian, 3);
  assert.equal(report.closures, 1);
  assert.equal(report.falseClosureRate, 0);
  assert.equal(report.churn, 10 / 14);
  assert.ok(report.simulatedRevenue > 0);
  assert.equal(report.closeLeadWithForecast, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL, `Cannot find module '@/lib/features/decision/backtest'`.

- [ ] **Step 3: Write the backtest**

```ts
// lib/features/decision/backtest.ts
import { costOf } from "@/lib/features/decision/engine";
import type { Decision } from "@/lib/features/decision/model";
import type { DecisionParameters } from "@/lib/features/decision/parameters";
import { eventAt } from "@/lib/features/scoring/backtest";
import { median } from "@/lib/features/scoring/model";

export type DeficitRow = { company: string; month: string; monthlyDeficit: boolean | null };
export type DecisionBacktest = {
  events: number;
  avoidedExposure: number;
  avoidedExposureNaive: number;
  simulatedRevenue: number;
  usageAssumption: number;
  churn: number;
  closures: number;
  falseClosureRate: number | null;
  closeLeadMedian: number | null;
  closeLeadWithForecast: null;
};
function byCompany<T extends { company: string; month: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const r of rows) {
    const list = out.get(r.company) ?? [];
    list.push(r);
    out.set(r.company, list);
  }
  for (const list of out.values()) list.sort((a, b) => a.month.localeCompare(b.month));
  return out;
}
/** Exposure the cut removed before the event: limit before the first reducir/cerrar in the 6 prior months minus limit at the event. */
function avoided(list: Decision[], eventIndex: number): { avoided: number; lead: number } | null {
  for (let j = Math.max(0, eventIndex - 6); j < eventIndex; j++)
    if (list[j].action === "reducir" || list[j].action === "cerrar")
      return {
        avoided: Math.max(0, (list[j - 1]?.appliedLimit ?? 0) - list[eventIndex].appliedLimit),
        lead: eventIndex - j,
      };
  return null;
}
export function decisionBacktest(
  scores: DeficitRow[],
  decisions: Decision[],
  naive: Decision[],
  P: DecisionParameters,
  usage = 0.6,
): DecisionBacktest {
  const scoreBy = byCompany(scores), decideBy = byCompany(decisions), naiveBy = byCompany(naive);
  let events = 0, avoidedExposure = 0, avoidedExposureNaive = 0, closures = 0, falseClosures = 0;
  const leads: number[] = [];
  for (const [company, list] of scoreBy) {
    const ds = decideBy.get(company) ?? [], ns = naiveBy.get(company) ?? [];
    const eventIndexes = list.map((_, i) => i).filter((i) => eventAt(list, i, "deterioro"));
    for (const i of eventIndexes) {
      events++;
      const hit = avoided(ds, i);
      if (hit) {
        avoidedExposure += hit.avoided;
        leads.push(hit.lead);
      }
      avoidedExposureNaive += avoided(ns, i)?.avoided ?? 0;
    }
    for (let i = 1; i + 6 < ds.length; i++) {
      if (ds[i].action !== "cerrar" || ds[i - 1].action === "cerrar") continue;
      closures++;
      if (!eventIndexes.some((e) => e > i && e <= i + 6)) falseClosures++;
    }
  }
  let simulatedRevenue = 0;
  for (const d of decisions) {
    if (d.appliedLimit <= 0 || !d.menu.length) continue;
    const option = d.menu.find((o) => o.term >= d.naturalTerm) ?? d.menu[d.menu.length - 1];
    simulatedRevenue += costOf(usage * d.appliedLimit, option.rate, option.term, P);
  }
  return {
    events,
    avoidedExposure,
    avoidedExposureNaive,
    simulatedRevenue: Math.round(simulatedRevenue * 100) / 100,
    usageAssumption: usage,
    churn: decisions.length ? decisions.filter((d) => d.action !== "mantener").length / decisions.length : 0,
    closures,
    falseClosureRate: closures ? falseClosures / closures : null,
    closeLeadMedian: median(leads),
    closeLeadWithForecast: null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS. Trace: event at index 8; window `[2, 8)` → first cut at index 5 (`reducir`), `avoided = limits[4] − limits[8] = 120 000`, lead 3. Closure at index 6 (`cerrar` after `reducir`, with 6 following months: `6 + 6 < 14`), event 8 within `(6, 12]` → not false. Churn: every row `≠ mantener` → `abrir` + `reducir` + 8 × `cerrar` = 10 of 14.

- [ ] **Step 5: Add the `backtest` command to `scripts/decision.ts`**

Add the import `import { decisionBacktest } from "../lib/features/decision/backtest";` and:

```ts
async function doBacktest() {
  const { meta, params, scoreDir, decisionDir } = await scoringRun();
  const validation = new Set(params.validationGroups);
  const groupOf = new Map(meta.companies.map((c) => [c.id, c.groupId]));
  const scores = (await loadScores(scoreDir)).filter((r) => validation.has(groupOf.get(r.company)!));
  const decisions: Decision[] = [];
  const validationCompanies = new Set(scores.map((r) => r.company));
  for await (const d of lines<Decision>(path.join(decisionDir, "decisions.jsonl")))
    if (validationCompanies.has(d.company)) decisions.push(d);
  const naive = decideAll(scores, meta, true);
  const metrics = {
    ...decisionBacktest(scores, decisions, naive, DECISION_PARAMETERS),
    validationCompanies: validationCompanies.size,
    validationRows: decisions.length,
  };
  await writeFile(path.join(decisionDir, "backtest.json"), JSON.stringify(metrics));
  console.log(JSON.stringify(metrics));
}
```

and in the dispatcher: `else if (command === "backtest") await doBacktest();`.

Note: `naive` is decided over validation companies only, which changes group totals for groups split across the validation boundary. Groups are never split (Eric's `groupSplit` assigns whole groups), so totals are identical.

- [ ] **Step 6: Run on the real data and commit**

Run: `pnpm decision:backtest`
Expected: JSON with `events > 0`, `churn` printed (target < 0,2 per §14; report the number, do not tune parameters in this task).

```bash
git add lib/features/decision/backtest.ts lib/features/decision/backtest.test.ts scripts/decision.ts
git commit -m "feat(decision): §14 backtest metrics"
```

---

### Task 13: Persistence (Prisma) and `db:setup` wiring

**Files:**
- Create: `prisma/schema/decision.prisma`
- Modify: `scripts/decision.ts` (import command), `scripts/setup-db.mjs`

- [ ] **Step 1: Add the schema**

```prisma
// prisma/schema/decision.prisma
model DecisionRun {
  id               String   @id
  scoreRunId       String
  parameterVersion String
  status           String   @default("importing")
  manifest         Json
  metrics          Json?
  createdAt        DateTime @default(now())
  completedAt      DateTime?
  decisions        CompanyMonthDecision[]

  @@index([status, completedAt])
  @@map("decision_runs")
}

model CompanyMonthDecision {
  runId         String
  companyId     String
  month         String
  run           DecisionRun @relation(fields: [runId], references: [id])
  eligible      Boolean
  band          String
  effectiveBand String
  action        String
  appliedLimit  Float
  data          Json

  @@id([runId, companyId, month])
  @@index([runId, month, action, eligible])
  @@index([runId, companyId, month])
  @@map("company_month_decisions")
}
```

Run: `pnpm exec prisma generate && pnpm exec prisma db push`
Expected: `Your database is now in sync with your Prisma schema.` (Postgres must be up: `pnpm db:up`.)

- [ ] **Step 2: Add the `import` command to `scripts/decision.ts`**

```ts
async function doImport() {
  const { prisma } = await import("../lib/core/db");
  const { decisionDir } = await scoringRun();
  const manifest = JSON.parse(await readFile(path.join(decisionDir, "manifest.json"), "utf8"));
  const metrics = JSON.parse(
    await readFile(path.join(decisionDir, "backtest.json"), "utf8").catch(() => "null"),
  );
  await prisma.decisionRun.upsert({
    where: { id: manifest.runId },
    update: { status: "importing", completedAt: null },
    create: {
      id: manifest.runId,
      scoreRunId: manifest.scoreRunId,
      parameterVersion: manifest.parameterVersion,
      manifest,
      status: "importing",
    },
  });
  let batch: Decision[] = [], imported = 0;
  async function flush() {
    if (!batch.length) return;
    await prisma.$transaction(
      batch.map((d) => {
        const fields = {
          eligible: d.eligible,
          band: d.band,
          effectiveBand: d.effectiveBand,
          action: d.action,
          appliedLimit: d.appliedLimit,
          data: d as never,
        };
        return prisma.companyMonthDecision.upsert({
          where: { runId_companyId_month: { runId: manifest.runId, companyId: d.company, month: d.month } },
          update: fields,
          create: { runId: manifest.runId, companyId: d.company, month: d.month, ...fields },
        });
      }),
    );
    imported += batch.length;
    batch = [];
  }
  for await (const d of lines<Decision>(path.join(decisionDir, "decisions.jsonl"))) {
    batch.push(decisionResultSchema.parse(d));
    if (batch.length >= 100) await flush();
  }
  await flush();
  if (imported !== manifest.rows) throw new Error(`imported ${imported}, expected ${manifest.rows}`);
  await prisma.decisionRun.update({
    where: { id: manifest.runId },
    data: { status: "complete", completedAt: new Date(), metrics },
  });
  await prisma.$disconnect();
  console.log(JSON.stringify({ imported, runId: manifest.runId }));
}
```

Dispatcher: `else if (command === "import") await doImport();`.

- [ ] **Step 3: Wire `scripts/setup-db.mjs`**

Change `completedRunExists()` SQL to:

```js
      "SELECT EXISTS (SELECT 1 FROM decision_runs WHERE status = 'complete');",
```

and after `run(pnpm, ["scoring:import"]);` add:

```js
  run(pnpm, ["decision:run"]);
  run(pnpm, ["decision:backtest"]);
  run(pnpm, ["decision:import"]);
```

Update the two `log(...)` texts to say "scoring and decision data".

- [ ] **Step 4: Run the whole pipeline**

Run: `pnpm scoring:import && pnpm decision:import`
Expected: `{"imported":<rows>,"runId":"…"}` for both. Then `pnpm db:setup` prints `A completed scoring run already exists.` path (idempotent). Verify:

```bash
docker compose exec -T postgres psql -U scoring -d scoring -tAc "SELECT action, count(*) FROM company_month_decisions GROUP BY action ORDER BY 1;"
```
Expected: five rows, one per action.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema/decision.prisma scripts/decision.ts scripts/setup-db.mjs
git commit -m "feat(decision): persist decision runs and wire db:setup"
```

---

### Task 14: Read-only API

**Files:**
- Create: `lib/features/decision/api.ts`
- Create: `app/api/decision/companies/route.ts`, `app/api/decision/companies/[companyId]/route.ts`, `app/api/decision/runs/[runId]/route.ts`, `app/api/decision/export/route.ts`

- [ ] **Step 1: Write the handler logic**

```ts
// lib/features/decision/api.ts
import { z } from "zod";
import { prisma } from "@/lib/core/db";
import { decisionResultSchema, type DecisionResultDTO } from "@/lib/features/decision/contracts";
import { ACTIONS, BANDS } from "@/lib/features/decision/model";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const listQuery = z.object({
  month: month.optional(),
  run: z.string().optional(),
  action: z.enum(ACTIONS).optional(),
  band: z.enum(BANDS).optional(),
  eligible: z
    .enum(["true", "false"])
    .transform((v) => v === "true")
    .optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
function queryObject(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}
function invalid(error: z.ZodError): Response {
  return Response.json({ error: z.treeifyError(error) }, { status: 400 });
}
export async function completedDecisionRun(run?: string) {
  return run
    ? prisma.decisionRun.findFirst({ where: { id: run, status: "complete" } })
    : prisma.decisionRun.findFirst({ where: { status: "complete" }, orderBy: { completedAt: "desc" } });
}
export async function listDecisions(request: Request): Promise<Response> {
  const parsed = listQuery.safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const { run, month: m = "2026-08", action, band, eligible, page, pageSize } = parsed.data;
  const selected = await completedDecisionRun(run);
  if (!selected) return Response.json({ error: "Run not found" }, { status: 404 });
  const where = { runId: selected.id, month: m, action, band, eligible };
  const [total, rows] = await Promise.all([
    prisma.companyMonthDecision.count({ where }),
    prisma.companyMonthDecision.findMany({
      where,
      orderBy: [{ appliedLimit: "desc" }, { companyId: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);
  return Response.json({
    runId: selected.id,
    scoreRunId: selected.scoreRunId,
    month: m,
    total,
    page,
    pageSize,
    rows: rows.map((r) => decisionResultSchema.parse(r.data)),
  });
}
export async function companyDecisions(request: Request, companyId: string): Promise<Response> {
  const parsed = z.object({ run: z.string().optional() }).safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const run = await completedDecisionRun(parsed.data.run);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthDecision.findMany({
    where: { runId: run.id, companyId },
    orderBy: { month: "asc" },
  });
  if (!rows.length) return Response.json({ error: "Company not found" }, { status: 404 });
  return Response.json({
    runId: run.id,
    latest: decisionResultSchema.parse(rows.at(-1)!.data),
    history: rows.map((r) => decisionResultSchema.parse(r.data)),
  });
}
export async function decisionRunDetail(runId: string): Promise<Response> {
  const run = await completedDecisionRun(runId);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  return Response.json({
    id: run.id,
    scoreRunId: run.scoreRunId,
    parameterVersion: run.parameterVersion,
    manifest: run.manifest,
    metrics: run.metrics,
    completedAt: run.completedAt,
  });
}
function cell(value: DecisionResultDTO[keyof DecisionResultDTO] | string): string {
  const s = typeof value === "object" && value !== null ? JSON.stringify(value) : String(value ?? "");
  return `"${s.replaceAll('"', '""')}"`;
}
/** §4.6 SOURCE: CSV with the §10 contract, one row per company-month (or latest per company). */
export async function exportDecisions(request: Request): Promise<Response> {
  const parsed = z
    .object({ run: z.string().optional(), month: month.optional(), mode: z.enum(["month", "latest"]).default("month") })
    .safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const run = await completedDecisionRun(parsed.data.run);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthDecision.findMany({
    where: { runId: run.id, ...(parsed.data.mode === "month" ? { month: parsed.data.month ?? "2026-08" } : {}) },
    orderBy: [{ companyId: "asc" }, { month: "desc" }],
  });
  const seen = new Set<string>();
  const selected = rows
    .filter((r) => parsed.data.mode !== "latest" || (!seen.has(r.companyId) && seen.add(r.companyId)))
    .map((r) => decisionResultSchema.parse(r.data));
  const keys: (keyof DecisionResultDTO)[] = [
    "company", "month", "parameterVersion", "eligible", "reason", "failedGates", "band", "effectiveBand",
    "adverseCapacity", "capacityLimit", "operatingLimit", "limit", "appliedLimit", "maxTerm", "menu",
    "naturalTerm", "action", "actionReason", "reductionKind", "groupReason", "forecastBandUsed", "state",
  ];
  const csv =
    ["runId," + keys.join(","), ...selected.map((row) => [run.id, ...keys.map((k) => row[k])].map(cell).join(","))].join("\r\n") + "\r\n";
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="decision-${run.id}.csv"`,
    },
  });
}
```

- [ ] **Step 2: Write the four routes**

```ts
// app/api/decision/companies/route.ts
import { listDecisions } from "@/lib/features/decision/api";
export async function GET(request: Request) {
  return listDecisions(request);
}
```

```ts
// app/api/decision/companies/[companyId]/route.ts
import { companyDecisions } from "@/lib/features/decision/api";
export async function GET(request: Request, props: { params: Promise<{ companyId: string }> }) {
  const { companyId } = await props.params;
  return companyDecisions(request, companyId);
}
```

```ts
// app/api/decision/runs/[runId]/route.ts
import { decisionRunDetail } from "@/lib/features/decision/api";
export async function GET(_request: Request, props: { params: Promise<{ runId: string }> }) {
  const { runId } = await props.params;
  return decisionRunDetail(runId);
}
```

```ts
// app/api/decision/export/route.ts
import { exportDecisions } from "@/lib/features/decision/api";
export async function GET(request: Request) {
  return exportDecisions(request);
}
```

- [ ] **Step 3: Verify manually**

Run: `pnpm dev` in one terminal, then:

```bash
curl -s "http://localhost:3000/api/decision/companies?month=2026-08&action=reducir&pageSize=2"
curl -s "http://localhost:3000/api/decision/companies/<some company id from the first call>" | head -c 600
curl -s -o /dev/null -w "%{http_code} %{size_download}\n" "http://localhost:3000/api/decision/export?mode=latest"
curl -s "http://localhost:3000/api/decision/companies?month=13-2026"
```
Expected: JSON with `rows` parsed by the contract; company history with `latest` + `history`; `200` and a non-zero CSV size; a `400` with a zod error tree for the bad month.

- [ ] **Step 4: Typecheck, lint, commit**

Run: `pnpm run typecheck && pnpm run lint`
Expected: exit 0 (warnings from the anti-slop plugin are acceptable only if they are not `error`).

```bash
git add lib/features/decision/api.ts app/api/decision
git commit -m "feat(decision): read-only API routes and CSV export"
```

---

### Task 15: Docs, deprecation notes, final checks

**Files:**
- Modify: `README.md`, `lib/features/scoring/model.ts` (comment), `docs/decision-engine.md` (implementation note)

- [ ] **Step 1: README section**

After the `## Motor de scoring v0.2` section add:

````markdown
## Motor de decisión v1.0

Implementa [docs/decision-engine.md](./docs/decision-engine.md) (SOURCE §3)
sobre la salida del scoring. `pnpm db:setup` lo ejecuta después del scoring;
por etapas:

```bash
pnpm decision:run        # scores.jsonl → decisions.jsonl (+ manifest)
pnpm decision:backtest   # métricas §14 sobre validación → backtest.json
pnpm decision:import     # → decision_runs, company_month_decisions
```

Resultados en `/api/decision/companies`, `/api/decision/companies/[companyId]`,
`/api/decision/runs/[runId]` y `/api/decision/export`. Los parámetros viven en
`lib/features/decision/parameters.ts`; cambiar uno cambia `parameterVersion`
y por tanto el `runId`. La previsión (`forecast-engine.md`) aún no existe:
el motor la trata como desconectada (`banda_pred_3m = banda`).

Los campos `band`, `price`, `action`, `recommendedLimit` y `appliedLimit` de
`/api/scoring/*` son el §8 antiguo del scoring y quedan **deprecados**: la
fuente de verdad de límites y acciones es `/api/decision/*`.
````

- [ ] **Step 2: Deprecation comment in Eric's `Result`**

In `lib/features/scoring/model.ts`, above `baseCapacity: number;` in `type Result` add:

```ts
  /** @deprecated legacy §8 (limits/actions). Read `company_month_decisions` instead. */
```

- [ ] **Step 3: Implementation note in the spec**

At the end of `docs/decision-engine.md` add:

```markdown
## 16. Estado de implementación (19-09-2026)

Implementado en `lib/features/decision/` sobre el scoring v0.2 de `fd422db`
(plan: `docs/superpowers/plans/2026-09-19-decision-engine.md`). Desviaciones
declaradas: `racha_B2` mínima (sin B1/B3), flujos de grupo = suma de
miembros (sin quitar espejos intragrupo), `cobros_op_media3m` de grupo = Σ
miembros, menú acotado por `min(L, L_vigente)`, caídas de grupo excluyen
cierres cuya única puerta fallida es `grupo`, fixture `prevision_peor` con
score 80 (72 es banda B). La previsión entra como opcional y se ignora si
falta (`metodo = desconectado`).
```

- [ ] **Step 4: Full verification**

Run:
```bash
pnpm test && pnpm run typecheck && pnpm run lint && pnpm run knip
```
Expected: all green. If `knip` flags `validateRequest` as an unused export, keep it (spec §7 API for the ficha) and list it in `knip.json` under `ignore`/`ignoreExportsUsedInFile` rather than deleting it.

- [ ] **Step 5: Commit and open a draft PR**

```bash
git add README.md lib/features/scoring/model.ts docs/decision-engine.md
git commit -m "docs: decision engine usage, deprecate legacy scoring §8 fields"
git push -u origin feat/decision-engine
gh pr create --draft --title "feat: decision engine v1.0 (SOURCE §3)" --body-file - <<'EOF'
Implements docs/decision-engine.md on top of the v0.2 scoring engine (#17).

- lib/features/decision: parameters, engine, group step, run, contract, adapter, backtest, API
- scoring: Result gains flows / deficitStreak / obligationStreak (parameter version bumped)
- scripts: decision:run | backtest | import, wired into db:setup
- 7 spec fixtures + property tests 1-7

Plan: docs/superpowers/plans/2026-09-19-decision-engine.md

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
```

---

## Self-review against the spec

**Spec coverage (decision-engine.md):** §0-§1 inputs → `ScoreInput`/`ForecastInput` (Task 1) and adapter (Task 10). §2 parameters → Task 2. §3 gates and texts → Task 4. §4 limit → Task 3. §5 term, §6 rate/cost/natural term, §7 menu/validate → Task 5. §8 action/state → Task 6. §9 group → Task 8. §10 contract → Task 7. §11 action texts → Task 4. §12 order → Task 8 `run()`. §13 fixtures (7) and properties (1-7) → Tasks 2 and 8. §14 metrics → Task 12 (lead time "con previsión" reported as `null` until a forecast engine exists). §15 out of scope respected. SOURCE §4.6 (CSV delivery by script) → `decision:run` writes `decisions.jsonl`, `/api/decision/export` gives the CSV; the test-company delivery script over unseen companies still depends on the scoring side and is not in this plan.

**Not covered here, by design:** SOURCE §1 scoring rewrite, §2 forecast engine, §4 product screens. Each is its own plan.

**Placeholder scan:** no TBD/TODO; every code step shows the code; hand-computed expectations were re-derived and baked into the tests (Task 6 `noMenu` uses `payments6m: 43_600`; Task 12 uses 14 months so the false-closure window exists, churn `10/14`; Task 8 group-ceiling test gives `b` weight 0,2 so the ceiling is tested without a cross-default).

**Type consistency:** `ScoreInput`, `State`, `Decision`, `MenuOption`, `CrossDefault` defined once in `model.ts` and used with the same names in engine/group/run/adapter/backtest/api; `limitOf(row, band, P)` signature used identically in Tasks 3, 6, 8; `actionOf` returns `ActionResult` consumed by `nextState` and `decide`; `groupStep(members: Member[], P)` used by `run()` and tests; `eventAt` widened to `Pick<Result, "monthlyDeficit">[]` so `DeficitRow[]` fits.
