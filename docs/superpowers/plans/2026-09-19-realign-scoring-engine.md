# Realinear el motor de scoring con SOURCE — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir la implementación de `lib/features/scoring/` (v0.2 legacy: 12 indicadores planos, solo EUR, decisión mezclada) por la especificada en `docs/product/SOURCE.md` §1 y `docs/engines/scoring-engine.md` v1.0 (bloques A/B/C con 14 variables, ajuste de grupo, divisas, espejos sobre todas las categorías, categorías de #12), y sacar la lógica de límite/banda/acción a `lib/features/decision/` sin cambiar su comportamiento todavía.

**Architecture:** Pipeline por grupo empresarial: ingest (CSV → JSONL por grupo, importes ya en €) → espejos → flujos mensuales → variables → subnotas y agregación → ajuste de grupo → evolución y alertas → fila `ScoreRow` (contrato scoring-engine §10). Un módulo `decision/legacy.ts` recibe filas `ScoreRow` y produce `DecisionRow` con la lógica actual de Eric (movida, no reescrita); `decision-engine.md` se implementa en el plan siguiente. La app (API, Prisma, script) sigue funcionando de punta a punta al terminar cada tarea.

**Tech Stack:** TypeScript (Node 20, `tsx`), `node:test` + `node:assert/strict` vía `pnpm test`, `zod` 4, `csv-parse`, Prisma 7 + Postgres, Python (`analysis/.venv`, pandas/pyarrow) solo para exportar el parquet de #12 a CSV.

**Referencias que el implementador debe tener abiertas:** `docs/product/SOURCE.md` §1 y §5 (registro de decisiones), `docs/engines/scoring-engine.md` (§2 parámetros, §3 normalización, §5 variables, §6-9, §10 contrato, §12 fixtures). Cuando este plan y la spec difieran, manda la spec y se corrige el plan.

**Convenciones del repo (AGENTS.md):** imports con alias `@/*`; `function` declarativa; sin `enum` (const maps / union types); `pnpm`, nunca npm; tests `*.test.ts` junto al código; `pnpm run typecheck` y `pnpm run lint` verdes antes de cada commit.

---

## Mapa de ficheros

| Fichero | Estado | Responsabilidad |
| --- | --- | --- |
| `lib/features/scoring/params.ts` | crear | `PARAMS` (scoring-engine §2) y `hashParams()` |
| `lib/features/scoring/types.ts` | crear | tipos de entrada, `Flow`, variables, `ScoreRow` |
| `lib/features/scoring/windows.ts` | crear | calendario `CALENDAR`, `sum`, `median`, `mad`, `percentile`, `clamp`, `divide` (sale de `model.ts`) |
| `lib/features/scoring/fx.ts` | crear | tabla de tasas a € y conversión (§3.2) |
| `lib/features/scoring/mirrors.ts` | crear | emparejado de espejos internos e intragrupo (§3.3, decisión 24) |
| `lib/features/scoring/flows.ts` | crear | `monthlyFlows`, `groupFlows` (§3.3, §4) |
| `lib/features/scoring/variables.ts` | crear | A1-A5, B1-B3, C1-C6 y extras (§5.1-5.3) |
| `lib/features/scoring/aggregate.ts` | crear | subnotas, agregación, estado (§6) |
| `lib/features/scoring/group.ts` | crear | D1-D5 y `avalGrupo` (§5.4, §7) |
| `lib/features/scoring/evolution.ts` | crear | dirección, naturaleza, deltas, alertas (§8-9) |
| `lib/features/scoring/fit.ts` | crear | split por grupo, percentiles congelados (§11) |
| `lib/features/scoring/engine.ts` | reescribir | orquestación por grupo → `ScoreRow[]` (§14) |
| `lib/features/scoring/contracts.ts` | reescribir | `scoreRowSchema` (zod) del contrato §10 |
| `lib/features/scoring/ingest.ts` | reescribir | partición por grupo, € en ingest, categorías de #12, cuadro de deuda |
| `lib/features/scoring/backtest.ts` | modificar | usar `deficitMes`, `margenMes`, alertas `desdeMes` |
| `lib/features/scoring/api.ts` | modificar | leer decisión de su tabla |
| `lib/features/scoring/model.ts` | borrar | sustituido por `types/params/windows` |
| `lib/features/decision/types.ts` | crear | `DecisionRow` |
| `lib/features/decision/legacy.ts` | crear | lógica actual de banda/límite/acción, movida |
| `lib/features/decision/contracts.ts` | crear | `decisionRowSchema` |
| `prisma/schema/scoring.prisma` | modificar | `CompanyMonthDecision`, columnas de `CompanyMonthScore` |
| `scripts/scoring.ts` | reescribir | `fit \| score \| decide \| backtest \| import` |
| `scripts/setup-db.mjs` | modificar | añadir `scoring:decide` |
| `analysis/09_export_categories.py` | crear | parquet de #12 → `analysis/transaction_categories.csv` |
| `package.json` | modificar | script `scoring:decide` |
| `README.md` | modificar | sección "Motor de scoring" |

Tests: un `*.test.ts` por módulo, mismo directorio.

---

## Tarea 0: Rama y línea base

**Files:** ninguno.

- [ ] **Step 1: Crear rama desde main**

```bash
git fetch origin main
git checkout -b feat/realign-scoring origin/main
```

- [ ] **Step 2: Comprobar que la línea base está verde**

Run: `pnpm install && pnpm test && pnpm run typecheck`
Expected: `pnpm test` termina con `# pass 4` (los 4 tests de `engine.test.ts`), typecheck sin errores.

- [ ] **Step 3: Exportar el parquet de #12 a CSV (una vez, artefacto derivado)**

Crear `analysis/09_export_categories.py`:

```python
"""Exporta analysis/transaction_categories.parquet (08_categories.py) a CSV
para que el motor TypeScript lo lea sin dependencias de parquet.

Salida: analysis/transaction_categories.csv con
transaction_id,normalized_category,category_confidence
"""
from pathlib import Path
import pandas as pd

HERE = Path(__file__).resolve().parent
SRC = HERE / "transaction_categories.parquet"
DST = HERE / "transaction_categories.csv"

def main() -> None:
    if not SRC.exists():
        raise SystemExit(f"No existe {SRC}. Ejecuta antes: python analysis/08_categories.py")
    df = pd.read_parquet(SRC, columns=["transaction_id", "normalized_category", "category_confidence"])
    df["normalized_category"] = df["normalized_category"].fillna("unknown")
    df["category_confidence"] = df["category_confidence"].fillna(0.0)
    df.to_csv(DST, index=False)
    print(f"{len(df)} filas -> {DST}")

if __name__ == "__main__":
    main()
```

Run: `.\.venv\Scripts\python.exe analysis\08_categories.py && .\.venv\Scripts\python.exe analysis\09_export_categories.py`
Expected: última línea `2556437 filas -> ...analysis\transaction_categories.csv`.

Añadir a `.gitignore` la línea `/analysis/transaction_categories.csv` (debajo de `# generated / build output`).

- [ ] **Step 4: Commit**

```bash
git add analysis/09_export_categories.py .gitignore
git commit -m "chore(analysis): export transaction categories to csv"
```

---

## Tarea 1: Parámetros versionados

**Files:**
- Create: `lib/features/scoring/params.ts`
- Test: `lib/features/scoring/params.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";

test("block weights sum to 1 and every variable belongs to one block", () => {
  const { A, B, C } = PARAMS.pesos;
  assert.ok(Math.abs(A + B + C - 1) < 1e-9);
  const all = [...PARAMS.bloques.A, ...PARAMS.bloques.B, ...PARAMS.bloques.C];
  assert.equal(all.length, 14);
  assert.equal(new Set(all).size, 14);
  for (const v of all) assert.ok(v in PARAMS.mejor, `mejor[${v}] missing`);
});

test("hash is stable and changes with any parameter", () => {
  assert.equal(hashParams(PARAMS), hashParams({ ...PARAMS }));
  assert.notEqual(hashParams(PARAMS), hashParams({ ...PARAMS, wMax: 0.5 }));
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/params.test.ts`
Expected: FAIL, `Cannot find module '@/lib/features/scoring/params'`.

- [ ] **Step 3: Implementación**

```ts
import { createHash } from "node:crypto";

export const VARIABLES = [
  "A1", "A2", "A3", "A4", "A5",
  "B1", "B2", "B3",
  "C1", "C2", "C3", "C4", "C5", "C6",
] as const;
export type VariableId = (typeof VARIABLES)[number];
export type Bloque = "A" | "B" | "C";

export const PARAMS = {
  mesInicio: "2024-09",
  mesFin: "2026-08",
  ventanaCorta: 6,
  ventanaLarga: 12,
  pesos: { A: 0.45, B: 0.3, C: 0.25 } as Record<Bloque, number>,
  bloques: {
    A: ["A1", "A2", "A3", "A4", "A5"],
    B: ["B1", "B2", "B3"],
    C: ["C1", "C2", "C3", "C4", "C5", "C6"],
  } as Record<Bloque, readonly VariableId[]>,
  mejor: {
    A1: "alto", A2: "bajo", A3: "alto", A4: "bajo", A5: "bajo",
    B1: "alto", B2: "bajo", B3: "bajo",
    C1: "bajo", C2: "bajo", C3: "bajo", C4: "bajo", C5: "bajo", C6: "bajo",
  } as Record<VariableId, "alto" | "bajo">,
  umbralSano: { A1: 0.1, A2: 1 / 6, A3: 1.3, A4: 0.25, A5: 0.2 } as Partial<Record<VariableId, number>>,
  nFacturasRef: 5,
  confSinDatos: 0.3,
  confSana: 0.5,
  scoreSana: 70,
  scoreRiesgo: 45,
  recurrenciaMin: 3,
  subnotaRacha1: 70,
  decaimientoMeses: 3,
  umbralDireccion: 6,
  persistenciaEstructural: 2,
  minVariablesEstructural: 2,
  deltaAportacionMin: 1,
  wMax: 0.4,
  d5Saturacion: 0.2,
  avalMax: 20,
  d3Ref: 2,
  estresCobros: 0.8,
  estresPagos: 1.1,
  coberturaMin: 1.3,
  categoryConfidenceMin: 0.95,
  a5SinLineaConf: 0.3,
  minObsVolatilidad: 6,
  alertaContagio: -10,
  vencidoAlto: 0.4,
} as const;
export type Params = typeof PARAMS;

export function hashParams(p: object): string {
  return createHash("sha256").update(JSON.stringify(p)).digest("hex");
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/params.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/params.ts lib/features/scoring/params.test.ts
git commit -m "feat(scoring): add versioned parameters from SOURCE"
```

---

## Tarea 2: Tipos y utilidades de ventana

**Files:**
- Create: `lib/features/scoring/types.ts`
- Create: `lib/features/scoring/windows.ts`
- Test: `lib/features/scoring/windows.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { CALENDAR, endOfMonth, mad, median, monthIndex, percentile, window } from "@/lib/features/scoring/windows";

test("calendar covers 2024-09..2026-08", () => {
  assert.equal(CALENDAR.length, 24);
  assert.equal(CALENDAR[0], "2024-09");
  assert.equal(CALENDAR[23], "2026-08");
  assert.equal(monthIndex("2025-01"), 4);
  assert.equal(endOfMonth("2025-02"), "2025-02-28");
  assert.equal(endOfMonth("2024-12"), "2024-12-31");
});

test("robust statistics", () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([]), null);
  assert.equal(mad([1, 2, 3, 4, 100]), 1);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
});

test("window returns the last n calendar slots, padding with undefined", () => {
  const items = ["a", "b", "c"];
  assert.deepEqual(window(items, 2, 6), [undefined, undefined, undefined, "a", "b", "c"]);
  assert.deepEqual(window(items, 1, 2), ["a", "b"]);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/windows.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar `windows.ts`**

```ts
export const CALENDAR: readonly string[] = (() => {
  const out: string[] = [];
  for (let y = 2024, m = 9; y < 2026 || (y === 2026 && m <= 8); m++) {
    if (m === 13) {
      y++;
      m = 1;
    }
    out.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return out;
})();

export function monthIndex(month: string): number {
  return CALENDAR.indexOf(month);
}

export function endOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
}

export function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const a = [...xs].sort((x, y) => x - y);
  return (a[Math.floor((a.length - 1) / 2)] + a[Math.floor(a.length / 2)]) / 2;
}

export function mad(xs: number[]): number | null {
  const m = median(xs);
  if (m === null) return null;
  return median(xs.map((x) => Math.abs(x - m)));
}

export function percentile(xs: number[], p: number): number {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return 0;
  const i = (a.length - 1) * p;
  const k = Math.floor(i);
  return a[k] + (a[Math.min(k + 1, a.length - 1)] - a[k]) * (i - k);
}

export function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

export function divide(a: number, b: number): number | null {
  return b > 0 ? a / b : null;
}

/** Slots de calendario t-n+1..t; undefined donde no hay elemento. */
export function window<T>(items: readonly (T | undefined)[], t: number, n: number): (T | undefined)[] {
  const out: (T | undefined)[] = [];
  for (let i = t - n + 1; i <= t; i++) out.push(i >= 0 ? items[i] : undefined);
  return out;
}
```

- [ ] **Step 4: Implementar `types.ts`** (sin test propio; lo cubre `typecheck`)

```ts
import type { VariableId } from "@/lib/features/scoring/params";

export type Company = { id: string; groupId: string; currency: string };
export type Product = { company: string; type: string; currency: string; service: string };

/** Movimiento bancario ya filtrado (booked, en ventana) con importe en € o null si no convertible. */
export type Tx = {
  id: string;
  company: string;
  product: string;
  date: string;
  month: string;
  amount: number | null;
  category: string;
  counterparty: string;
};

/** Factura `invoice` con importe en € y signo (+ cliente, − proveedor). */
export type Invoice = {
  id: string;
  company: string;
  issued: string;
  due: string;
  paid: string;
  amount: number;
  status: string;
  counterparty: string;
};

export const OBLIGACIONES = ["tax", "social_security", "salary", "debt_repayment"] as const;
export type Obligacion = (typeof OBLIGACIONES)[number];

export type Flow = {
  company: string;
  month: string;
  observed: boolean;
  cobrosOp: number;
  pagosOp: number;
  servicioDeuda: number;
  dispCredito: number;
  amortCredito: number;
  recibosDevueltos: number;
  obligaciones: Record<Obligacion, number>;
  intragrupoIn: number;
  intragrupoOut: number;
  clasificado: number;
  neutral: number;
  sinClasificar: number;
  nMov: number;
  nExcluidos: number;
  cobrosPorContraparte: Record<string, number>;
  pagosPorContraparte: Record<string, number>;
};

export type GroupFlow = {
  month: string;
  cobrosOp: number;
  pagosOp: number;
  servicioDeuda: number;
  nEmpresas: number;
};

export type VariableValue = { raw: number | null; conf: number };
export type VariableSet = Record<VariableId, VariableValue>;

export type Extras = {
  cobrosOpMedia3m: number;
  cobrosOpMedia6m: number;
  pagosOpMedia6m: number;
  servicioDeudaMedia6m: number;
  amortCreditoMedia6m: number;
  obligacionesRecMedia6m: number;
  capacidadCuotaAdv: number;
  cobrosOp12m: number;
  pagosOp12m: number;
  intragrupoIn12m: number;
  intragrupoOut12m: number;
  rachaB2: number;
  rachaB2Prev: number[];
  rachaDeficit: number;
  C3dias: number | null;
  C4: number | null;
  deficitMes: boolean | null;
  margenMes: number | null;
  cobertura: {
    mesesObs6m: number;
    mesesObs12m: number;
    pctClasificado6m: number;
    nFacturasCli6m: number;
    nFacturasProv6m: number;
    tieneLineaCredito: boolean;
    tieneCuotas: boolean;
    C4Estimado: boolean;
  };
};

export type Contribution = {
  id: VariableId | "grupo";
  raw: number | null;
  subnota: number;
  conf: number;
  aportacion: number;
  umbralSano: number | null;
  sano: boolean | null;
};

export type Alert = { tipo: string; desdeMes: string };
export type Direccion = "mejora" | "estable" | "deterioro";
export type Naturaleza = "temporal" | "estructural" | "sin_cambio";
export type Estado = "sana" | "vigilar" | "riesgo" | "sin_datos";

export type Percentiles = Record<VariableId, { p5: number; p95: number }>;
export type Parameters = {
  version: string;
  paramsHash: string;
  percentiles: Percentiles;
  trainGroups: string[];
  validationGroups: string[];
  inputFingerprint: string;
};

export type Senales = {
  deterioro: boolean;
  estructural: boolean;
  mejora: boolean;
  deficit: boolean;
  impago: boolean;
  vencidoAlto: boolean;
  contagio: boolean;
  datosInsuficientes: boolean;
};

/** Contrato scoring-engine §10. */
export type ScoreRow = {
  company: string;
  month: string;
  groupId: string;
  versionParametros: string;
  score: number;
  scoreSolo: number;
  avalGrupo: number;
  confianza: number;
  subscores: Record<"A" | "B" | "C", number>;
  confs: Record<"A" | "B" | "C", number>;
  estado: Estado;
  variables: Contribution[];
  deltaContrib: { id: VariableId | "grupo"; delta: number }[];
  direccion: Direccion;
  naturaleza: Naturaleza;
  tendScore3m: number | null;
  tend3m: Record<"A" | "B" | "C", number | null>;
  rachaB2: number;
  rachaDeficit: number;
  C3dias: number | null;
  C4: number | null;
  cobrosOpMedia3m: number;
  cobrosOpMedia6m: number;
  pagosOpMedia6m: number;
  servicioDeudaMedia6m: number;
  amortCreditoMedia6m: number;
  obligacionesRecMedia6m: number;
  capacidadCuotaAdv: number;
  D1: number;
  D2: number | null;
  D3: number | null;
  D4: number | null;
  D5: number;
  confD: number;
  tienePrestamoIntragrupo: boolean;
  cobrosOpGrupoMedia6m: number;
  pagosOpGrupoMedia6m: number;
  servicioDeudaGrupoMedia6m: number;
  scoreGrupo: number | null;
  deficitMes: boolean | null;
  margenMes: number | null;
  senales: Senales;
  alertas: Alert[];
  cobertura: Extras["cobertura"] & { nHermanasConDatos: number };
};
```

- [ ] **Step 5: Ejecutar tests y typecheck**

Run: `node --import tsx --test lib/features/scoring/windows.test.ts && pnpm run typecheck`
Expected: `# pass 3`; typecheck sin errores.

- [ ] **Step 6: Commit**

```bash
git add lib/features/scoring/types.ts lib/features/scoring/windows.ts lib/features/scoring/windows.test.ts
git commit -m "feat(scoring): add contract types and window helpers"
```

---

## Tarea 3: Divisas a €

**Files:**
- Create: `lib/features/scoring/fx.ts`
- Test: `lib/features/scoring/fx.test.ts`

Regla (SOURCE §1.0, decisión 1): `exchange_rate` = unidades de la moneda del producto o factura por 1 unidad de la moneda de la empresa. `importe_empresa = amount / exchange_rate`; `importe_eur = importe_empresa × tasa(moneda_empresa → EUR, mes)`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { buildFxTable, eurRate, toEur } from "@/lib/features/scoring/fx";

test("fx table from invoice pairs, both directions, median per month", () => {
  const fx = buildFxTable([
    { currency: "USD", accounting: "EUR", rate: 1.16, month: "2025-03" },
    { currency: "USD", accounting: "EUR", rate: 1.2, month: "2025-03" },
    { currency: "USD", accounting: "EUR", rate: 1.18, month: "2025-03" },
    { currency: "EUR", accounting: "USD", rate: 0.86, month: "2025-04" },
    { currency: "EUR", accounting: "EUR", rate: 1, month: "2025-04" },
  ]);
  assert.ok(Math.abs(eurRate(fx, "USD", "2025-03")! - 1 / 1.18) < 1e-9);
  assert.ok(Math.abs(eurRate(fx, "USD", "2025-04")! - 0.86) < 1e-9);
  assert.equal(eurRate(fx, "EUR", "2025-01"), 1);
  assert.ok(eurRate(fx, "GBP", "2025-01")! > 1); // respaldo fijo
  assert.equal(eurRate(fx, "XXX", "2025-01"), null);
});

test("toEur applies the two steps and rejects unconvertible rows", () => {
  const fx = buildFxTable([{ currency: "USD", accounting: "EUR", rate: 1.16, month: "2025-03" }]);
  // cuenta USD de empresa EUR: rate 1.16 → 116 USD = 100 EUR
  assert.ok(Math.abs(toEur(fx, 116, 1.16, "USD", "EUR", "2025-03")! - 100) < 1e-9);
  // cuenta USD de empresa USD: rate 1 → 100 USD × 1/1.16 EUR
  assert.ok(Math.abs(toEur(fx, 100, 1, "USD", "USD", "2025-03")! - 100 / 1.16) < 1e-9);
  // rate vacío, monedas iguales → 1
  assert.equal(toEur(fx, 50, null, "EUR", "EUR", "2025-03"), 50);
  // rate vacío, monedas distintas: se deriva de la tabla
  assert.ok(Math.abs(toEur(fx, 116, null, "USD", "EUR", "2025-03")! - 100) < 1e-6);
  // moneda desconocida → null
  assert.equal(toEur(fx, 10, null, "XXX", "EUR", "2025-03"), null);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/fx.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { median } from "@/lib/features/scoring/windows";

export type FxTable = Record<string, Record<string, number>>; // moneda → mes → € por 1 unidad
export type FxObservation = { currency: string; accounting: string; rate: number; month: string };

/** Tasa fija de respaldo (€ por 1 unidad), aproximación 2025-26. Forma parte de los parámetros versionados. */
export const FX_FALLBACK: Record<string, number> = {
  EUR: 1, USD: 0.86, GBP: 1.16, CHF: 1.06, DKK: 0.134, NOK: 0.088, SEK: 0.09,
  AUD: 0.58, CAD: 0.63, NZD: 0.53, MXN: 0.048, BRL: 0.16, COP: 0.00022, CLP: 0.00095,
  ARS: 0.0008, BAM: 0.51, PLN: 0.235, CZK: 0.04, HUF: 0.0025, RON: 0.2, TRY: 0.024,
};

export function buildFxTable(rows: FxObservation[]): FxTable {
  const samples: Record<string, Record<string, number[]>> = {};
  for (const r of rows) {
    if (!(r.rate > 0)) continue;
    let currency: string, eurPerUnit: number;
    if (r.accounting === "EUR" && r.currency !== "EUR") {
      currency = r.currency;
      eurPerUnit = 1 / r.rate; // rate = unidades de currency por 1 EUR
    } else if (r.currency === "EUR" && r.accounting !== "EUR") {
      currency = r.accounting;
      eurPerUnit = r.rate; // rate = EUR por 1 unidad de accounting
    } else continue;
    ((samples[currency] ??= {})[r.month] ??= []).push(eurPerUnit);
  }
  const table: FxTable = {};
  for (const [currency, byMonth] of Object.entries(samples))
    for (const [month, xs] of Object.entries(byMonth)) (table[currency] ??= {})[month] = median(xs)!;
  return table;
}

export function eurRate(fx: FxTable, currency: string, month: string): number | null {
  if (currency === "EUR") return 1;
  return fx[currency]?.[month] ?? FX_FALLBACK[currency] ?? null;
}

/**
 * amount: importe en la moneda del producto/factura. rate: exchange_rate del CSV (unidades de esa
 * moneda por 1 unidad de la moneda de la empresa) o null si vacío/0.
 */
export function toEur(
  fx: FxTable,
  amount: number,
  rate: number | null,
  productCurrency: string,
  companyCurrency: string,
  month: string,
): number | null {
  const companyEur = eurRate(fx, companyCurrency, month);
  if (companyEur === null) return null;
  let r = rate && rate > 0 ? rate : null;
  if (r === null) {
    if (productCurrency === companyCurrency) r = 1;
    else {
      const productEur = eurRate(fx, productCurrency, month);
      if (productEur === null) return null;
      r = companyEur / productEur;
    }
  }
  return (amount / r) * companyEur;
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/fx.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/fx.ts lib/features/scoring/fx.test.ts
git commit -m "feat(scoring): currency conversion to EUR"
```

---

## Tarea 4: Espejos (decisión 24)

**Files:**
- Create: `lib/features/scoring/mirrors.ts`
- Test: `lib/features/scoring/mirrors.test.ts`

Regla: sobre **todos** los movimientos del grupo (sin filtrar por categoría), mismo `|importe|` al céntimo, misma fecha, signo opuesto, uno a uno. Primero pareja dentro de la misma empresa (interno), después con otra empresa del grupo (intragrupo). Greedy por `transaction_id`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { pairMirrors } from "@/lib/features/scoring/mirrors";
import type { Tx } from "@/lib/features/scoring/types";

function tx(id: string, company: string, amount: number | null, category = "transfer", date = "2025-01-10"): Tx {
  return { id, company, product: `p-${company}`, date, month: date.slice(0, 7), amount, category, counterparty: "" };
}

test("pairs internal first, then intra-group, across any category, one to one", () => {
  const m = pairMirrors([
    tx("a1", "A", -100),
    tx("a2", "A", 100),
    tx("a3", "A", -100, "payment"),
    tx("b1", "B", 100, "collection"),
    tx("b2", "B", 100, "collection"),
    tx("c1", "C", -100, "-", "2025-01-11"),
  ]);
  assert.equal(m.get("a1"), "interno");
  assert.equal(m.get("a2"), "interno");
  assert.equal(m.get("a3"), "intragrupo");
  assert.equal(m.get("b1"), "intragrupo");
  assert.equal(m.has("b2"), false); // sin pareja: uno a uno
  assert.equal(m.has("c1"), false); // otra fecha
});

test("ignores unconvertible amounts and near misses", () => {
  const m = pairMirrors([tx("x", "A", null), tx("y", "B", 100), tx("z", "B", -100.01)]);
  assert.equal(m.size, 0);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/mirrors.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import type { Tx } from "@/lib/features/scoring/types";

export type MirrorKind = "interno" | "intragrupo";

/** txs = todos los movimientos booked de un grupo empresarial. Devuelve id → tipo de espejo. */
export function pairMirrors(txs: Tx[]): Map<string, MirrorKind> {
  const buckets = new Map<string, { pos: Tx[]; neg: Tx[] }>();
  for (const t of txs) {
    if (t.amount === null || t.amount === 0) continue;
    const key = `${Math.round(Math.abs(t.amount) * 100)}|${t.date}`;
    const b = buckets.get(key) ?? { pos: [], neg: [] };
    (t.amount > 0 ? b.pos : b.neg).push(t);
    buckets.set(key, b);
  }
  const out = new Map<string, MirrorKind>();
  const byId = (a: Tx, b: Tx) => a.id.localeCompare(b.id);
  for (const { pos, neg } of buckets.values()) {
    pos.sort(byId);
    neg.sort(byId);
    for (const p of pos) {
      const same = neg.find((n) => !out.has(n.id) && n.company === p.company);
      const partner = same ?? neg.find((n) => !out.has(n.id) && n.company !== p.company);
      if (!partner) continue;
      const kind: MirrorKind = partner.company === p.company ? "interno" : "intragrupo";
      out.set(p.id, kind);
      out.set(partner.id, kind);
    }
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/mirrors.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/mirrors.ts lib/features/scoring/mirrors.test.ts
git commit -m "feat(scoring): pair mirror transactions across all categories"
```

---

## Tarea 5: Flujos mensuales por empresa y por grupo

**Files:**
- Create: `lib/features/scoring/flows.ts`
- Test: `lib/features/scoring/flows.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { groupFlows, monthlyFlows } from "@/lib/features/scoring/flows";
import type { Product, Tx } from "@/lib/features/scoring/types";

const products = new Map<string, Product>([
  ["cash", { company: "c", type: "checking", currency: "EUR", service: "" }],
  ["credit", { company: "c", type: "lineofcredit", currency: "EUR", service: "" }],
  ["card", { company: "c", type: "card", currency: "EUR", service: "" }],
]);
function tx(id: string, product: string, amount: number | null, category: string, counterparty = ""): Tx {
  return { id, company: "c", product, date: "2025-01-10", month: "2025-01", amount, category, counterparty };
}

test("classifies every movement into exactly one bucket", () => {
  const txs = [
    tx("1", "cash", 100, "collection", "cp1"),
    tx("2", "cash", -20, "payment", "cp2"),
    tx("3", "cash", -30, "salary"),
    tx("4", "cash", -5, "debt_repayment"),
    tx("5", "cash", -1, "interest_charge"),
    tx("6", "cash", -7, "collection_refund"),
    tx("7", "cash", 40, "payment_refund"),
    tx("8", "cash", 60, "unknown"),
    tx("9", "credit", 500, "collection"),
    tx("10", "credit", -200, "payment"),
    tx("11", "cash", 80, "debt_drawdown"),
    tx("12", "cash", -9, "balance_adjustment"),
    tx("13", "card", -3, "payment"),
    tx("14", "cash", null, "collection"),
    tx("15", "cash", -100, "transfer"),
    tx("16", "cash", 100, "payment"),
    tx("17", "cash", 25, "collection", "cp1"),
  ];
  const mirrors = new Map<string, "interno" | "intragrupo">([["15", "interno"], ["16", "intragrupo"]]);
  const f = monthlyFlows("c", txs, products, mirrors).get("2025-01")!;
  assert.equal(f.observed, true);
  assert.equal(f.cobrosOp, 125);
  assert.equal(f.pagosOp, 50);
  assert.equal(f.servicioDeuda, 6);
  assert.equal(f.recibosDevueltos, 7);
  assert.equal(f.dispCredito, 580);
  assert.equal(f.amortCredito, 200);
  assert.equal(f.neutral, 149); // 40 + 9 + 100 (interno)
  assert.equal(f.intragrupoIn, 100);
  assert.equal(f.sinClasificar, 60);
  assert.equal(f.nExcluidos, 2); // card, null
  assert.equal(f.nMov, 17);
  assert.deepEqual(f.obligaciones, { tax: 0, social_security: 0, salary: 30, debt_repayment: 5 });
  assert.equal(f.cobrosPorContraparte.cp1, 125);
  assert.equal(f.pagosPorContraparte.cp2, 20);
  assert.equal(f.clasificado, 125 + 50 + 6 + 7 + 580 + 200);
});

test("group flows sum operating flows per month", () => {
  const a = monthlyFlows("c", [tx("1", "cash", 100, "collection")], products, new Map());
  const b = monthlyFlows("c", [tx("2", "cash", -40, "payment")], products, new Map());
  const g = groupFlows([a, b]).get("2025-01")!;
  assert.equal(g.cobrosOp, 100);
  assert.equal(g.pagosOp, 40);
  assert.equal(g.nEmpresas, 2);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/flows.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import type { MirrorKind } from "@/lib/features/scoring/mirrors";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Flow, GroupFlow, Product, Tx } from "@/lib/features/scoring/types";

const COBROS = new Set(["collection", "bulk_collection", "pos_settlement", "cash_settlement", "cash_settlements"]);
const PAGOS = new Set(["payment", "bulk_payment", "utility", "salary", "social_security", "tax", "fee"]);
const OBLIG = new Set(["tax", "social_security", "salary"]);
const OPERATIVAS = new Set(["checking", "saving", "wallet"]);

export function emptyFlow(company: string, month: string): Flow {
  return {
    company, month, observed: false,
    cobrosOp: 0, pagosOp: 0, servicioDeuda: 0, dispCredito: 0, amortCredito: 0, recibosDevueltos: 0,
    obligaciones: { tax: 0, social_security: 0, salary: 0, debt_repayment: 0 },
    intragrupoIn: 0, intragrupoOut: 0,
    clasificado: 0, neutral: 0, sinClasificar: 0, nMov: 0, nExcluidos: 0,
    cobrosPorContraparte: {}, pagosPorContraparte: {},
  };
}

function add(map: Record<string, number>, key: string, amount: number): void {
  if (key) map[key] = (map[key] ?? 0) + amount;
}

/** txs: movimientos booked de UNA empresa, en ventana, con importe en €. mirrors: resultado de pairMirrors sobre el grupo. */
export function monthlyFlows(
  company: string,
  txs: Tx[],
  products: Map<string, Product>,
  mirrors: Map<string, MirrorKind>,
): Map<string, Flow> {
  const flows = new Map<string, Flow>();
  for (const t of txs) {
    if (t.month < PARAMS.mesInicio || t.month > PARAMS.mesFin) continue;
    const f = flows.get(t.month) ?? emptyFlow(company, t.month);
    flows.set(t.month, f);
    f.nMov++;
    const p = products.get(t.product);
    if (t.amount === null || !p) {
      f.nExcluidos++;
      continue;
    }
    const a = Math.abs(t.amount);
    const mirror = mirrors.get(t.id);
    if (mirror === "interno") {
      f.neutral += a;
      continue;
    }
    if (mirror === "intragrupo") {
      if (t.amount > 0) f.intragrupoIn += a;
      else f.intragrupoOut += a;
      continue;
    }
    if (p.type === "lineofcredit") {
      if (t.amount > 0) f.dispCredito += a;
      else f.amortCredito += a;
      f.clasificado += a;
      continue;
    }
    if (!OPERATIVAS.has(p.type)) {
      f.nExcluidos++;
      continue;
    }
    f.observed = true;
    const c = t.category;
    if (c === "unknown" || c === "-" || c === "") f.sinClasificar += a;
    else if (c === "debt_drawdown" && t.amount > 0) {
      f.dispCredito += a;
      f.clasificado += a;
    } else if (COBROS.has(c) && t.amount > 0) {
      f.cobrosOp += a;
      f.clasificado += a;
      add(f.cobrosPorContraparte, t.counterparty, a);
    } else if (PAGOS.has(c) && t.amount < 0) {
      f.pagosOp += a;
      f.clasificado += a;
      if (OBLIG.has(c)) f.obligaciones[c as "tax" | "social_security" | "salary"] += a;
      add(f.pagosPorContraparte, t.counterparty, a);
    } else if ((c === "debt_repayment" || c === "interest_charge") && t.amount < 0) {
      f.servicioDeuda += a;
      f.clasificado += a;
      if (c === "debt_repayment") f.obligaciones.debt_repayment += a;
    } else if (c === "collection_refund" && t.amount < 0) {
      f.recibosDevueltos += a;
      f.clasificado += a;
    } else f.neutral += a;
  }
  return flows;
}

export function groupFlows(members: Map<string, Flow>[]): Map<string, GroupFlow> {
  const out = new Map<string, GroupFlow>();
  for (const flows of members)
    for (const f of flows.values()) {
      const g = out.get(f.month) ?? { month: f.month, cobrosOp: 0, pagosOp: 0, servicioDeuda: 0, nEmpresas: 0 };
      g.cobrosOp += f.cobrosOp;
      g.pagosOp += f.pagosOp;
      g.servicioDeuda += f.servicioDeuda;
      g.nEmpresas++;
      out.set(f.month, g);
    }
  return out;
}

export function pctClasificado(flows: (Flow | undefined)[]): number {
  let clasificado = 0, resto = 0, nMov = 0, nExcl = 0;
  for (const f of flows) {
    if (!f) continue;
    clasificado += f.clasificado;
    resto += f.neutral + f.sinClasificar;
    nMov += f.nMov;
    nExcl += f.nExcluidos;
  }
  const porImporte = clasificado + resto > 0 ? clasificado / (clasificado + resto) : 0;
  const porFilas = nMov > 0 ? (nMov - nExcl) / nMov : 1;
  return porImporte * porFilas;
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/flows.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/flows.ts lib/features/scoring/flows.test.ts
git commit -m "feat(scoring): monthly flows per company and group"
```

---

## Tarea 6: Variables bloque A y extras de caja

**Files:**
- Create: `lib/features/scoring/variables.ts`
- Test: `lib/features/scoring/variables.test.ts`

Convención de ventanas (scoring-engine §5): `Σ6m` suma los slots de calendario `t−5..t`; `media6m = Σ6m / min(6, t+1)`; `meses_obs` = slots con flujo.

- [ ] **Step 1: Test que falla (fixture `sana` de scoring-engine §12)**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { emptyFlow } from "@/lib/features/scoring/flows";
import { computeVariables, type VariableInput } from "@/lib/features/scoring/variables";
import { CALENDAR } from "@/lib/features/scoring/windows";
import type { Flow } from "@/lib/features/scoring/types";

export function sanaHistory(months = 6, patch: (f: Flow, i: number) => void = () => {}): (Flow | undefined)[] {
  const history: (Flow | undefined)[] = Array(CALENDAR.length).fill(undefined);
  for (let i = 0; i < months; i++) {
    const f = emptyFlow("c", CALENDAR[i]);
    f.observed = true;
    f.cobrosOp = 100_000;
    f.pagosOp = 85_000;
    f.servicioDeuda = 5_000;
    f.obligaciones = { tax: 10_000, social_security: 8_000, salary: 30_000, debt_repayment: 4_500 };
    f.clasificado = 190_000;
    for (let k = 1; k <= 10; k++) f.cobrosPorContraparte[`cli${k}`] = 10_000;
    patch(f, i);
    history[i] = f;
  }
  return history;
}

export function input(history: (Flow | undefined)[], t: number, extra: Partial<VariableInput> = {}): VariableInput {
  return { company: "c", t, history, invoices: [], scheduleMonthly: 0, hasLine: false, ...extra };
}

test("block A on the sana fixture", () => {
  const { vars, extras } = computeVariables(input(sanaHistory(), 5));
  assert.ok(Math.abs(vars.A1.raw! - 0.15) < 1e-9);
  assert.equal(vars.A2.raw, 0);
  assert.ok(Math.abs(vars.A3.raw! - 3) < 1e-9);
  assert.ok(Math.abs(vars.A4.raw! - 0.05) < 1e-9);
  assert.equal(vars.A5.raw, null);
  assert.equal(vars.A5.conf, 0.3);
  assert.equal(vars.A1.conf, 1);
  assert.equal(extras.cobrosOpMedia6m, 100_000);
  assert.equal(extras.rachaDeficit, 0);
  assert.equal(extras.deficitMes, false);
  assert.ok(Math.abs(extras.capacidadCuotaAdv - ((0.8 * 100_000 - 1.1 * 85_000) / 1.3 - 5_000)) < 1e-6);
});

test("A3 is NA without debt service, confidence scales with observed months", () => {
  const h = sanaHistory(2, (f) => (f.servicioDeuda = 0));
  const { vars } = computeVariables(input(h, 5));
  assert.equal(vars.A3.raw, null);
  assert.equal(vars.A3.conf, 0);
  assert.ok(Math.abs(vars.A1.conf - 2 / 6) < 1e-9);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación (bloque A y extras; B y C se añaden en las tareas 7 y 8)**

```ts
import { pctClasificado } from "@/lib/features/scoring/flows";
import { PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Extras, Flow, Invoice, VariableSet } from "@/lib/features/scoring/types";
import { divide, sum, window } from "@/lib/features/scoring/windows";

export type VariableInput = {
  company: string;
  t: number;
  history: (Flow | undefined)[]; // indexado por CALENDAR
  invoices: Invoice[];
  scheduleMonthly: number; // cuota mensual esperada según cuadro (€), 0 si no hay
  hasLine: boolean; // tiene producto lineofcredit
};

function na(): { raw: null; conf: number } {
  return { raw: null, conf: 0 };
}
function val(raw: number | null, conf: number) {
  return raw === null || !Number.isFinite(raw) ? na() : { raw, conf };
}
function s(flows: (Flow | undefined)[], key: keyof Flow): number {
  return sum(flows.map((f) => (f ? Number(f[key]) : 0)));
}

export function computeVariables(input: VariableInput): { vars: VariableSet; extras: Extras } {
  const { t, history } = input;
  const w6 = window(history, t, 6);
  const w3 = window(history, t, 3);
  const w12 = window(history, t, 12);
  const nCal6 = Math.min(6, t + 1);
  const obs6 = w6.filter(Boolean).length;
  const obs12 = w12.filter(Boolean).length;
  const cVentana6 = obs6 / 6;
  const cobertura6 = pctClasificado(w6);
  const cTx = cVentana6 * cobertura6;

  const cobros6 = s(w6, "cobrosOp"), pagos6 = s(w6, "pagosOp");
  const caja6 = cobros6 - pagos6;
  const servicio6 = s(w6, "servicioDeuda");
  const amort6 = s(w6, "amortCredito"), disp6 = s(w6, "dispCredito");
  const deficitMonths = w6.filter((f) => f && f.cobrosOp < f.pagosOp).length;

  const vars = Object.fromEntries(VARIABLES.map((v) => [v, na()])) as VariableSet;
  vars.A1 = val(divide(caja6, cobros6), cTx);
  vars.A2 = val(obs6 ? deficitMonths / obs6 : null, cTx);
  vars.A3 = val(divide(caja6, servicio6), cTx);
  vars.A4 = val(divide(servicio6 + amort6, cobros6), cTx);
  vars.A5 = input.hasLine ? val(divide(disp6, cobros6), cTx) : { raw: null, conf: PARAMS.a5SinLineaConf };

  const current = history[t];
  let rachaDeficit = 0;
  for (let i = t; i >= 0 && history[i] && history[i]!.cobrosOp < history[i]!.pagosOp; i--) rachaDeficit++;
  const media6 = (x: number) => x / nCal6;
  const oblig6 = sum(w6.map((f) => (f ? f.obligaciones.tax + f.obligaciones.social_security + f.obligaciones.salary + f.obligaciones.debt_repayment : 0)));
  const capacidadCuotaAdv = Math.max(
    0,
    (PARAMS.estresCobros * media6(cobros6) - PARAMS.estresPagos * media6(pagos6)) / PARAMS.coberturaMin - media6(servicio6),
  );
  const extras: Extras = {
    cobrosOpMedia3m: s(w3, "cobrosOp") / Math.min(3, t + 1),
    cobrosOpMedia6m: media6(cobros6),
    pagosOpMedia6m: media6(pagos6),
    servicioDeudaMedia6m: media6(servicio6),
    amortCreditoMedia6m: media6(amort6),
    obligacionesRecMedia6m: media6(oblig6),
    capacidadCuotaAdv,
    cobrosOp12m: s(w12, "cobrosOp"),
    pagosOp12m: s(w12, "pagosOp"),
    intragrupoIn12m: s(w12, "intragrupoIn"),
    intragrupoOut12m: s(w12, "intragrupoOut"),
    rachaB2: 0,
    rachaB2Prev: [0, 0, 0],
    rachaDeficit,
    C3dias: null,
    C4: null,
    deficitMes: current ? current.cobrosOp < current.pagosOp : null,
    margenMes: current ? divide(current.cobrosOp - current.pagosOp, current.cobrosOp) : null,
    cobertura: {
      mesesObs6m: obs6,
      mesesObs12m: obs12,
      pctClasificado6m: cobertura6,
      nFacturasCli6m: 0,
      nFacturasProv6m: 0,
      tieneLineaCredito: input.hasLine,
      tieneCuotas: servicio6 > 0,
      C4Estimado: true,
    },
  };

  // ---- Bloque B (Tarea 7): insertar aquí

  // ---- Bloque C (Tarea 8): insertar aquí

  return { vars, extras };
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/variables.ts lib/features/scoring/variables.test.ts
git commit -m "feat(scoring): block A variables and cash extras"
```

---

## Tarea 7: Variables bloque B (fiabilidad)

**Files:**
- Modify: `lib/features/scoring/variables.ts`
- Test: `lib/features/scoring/variables.test.ts`

Reglas (scoring-engine §5.2): obligación recurrente = categoría presente ≥ 3 de los últimos 6 meses; esperado mensual = mediana de los meses presentes (cuota del cuadro para `debt_repayment` si existe); los meses esperados van desde la primera presencia en la ventana hasta `t`. `B1 = min(1, Σ pagado / Σ esperado)`. `B2` = máxima racha actual de meses esperados sin pago. `rachaB2Prev` = rachas en `t−1, t−2, t−3` (para el decaimiento de la subnota).

- [ ] **Step 1: Tests que fallan (fixtures `salto_un_mes` e `impago`)**

Añadir a `variables.test.ts`:

```ts
import type { Invoice } from "@/lib/features/scoring/types";

test("B1/B2 on sana: everything paid, no streak", () => {
  const { vars, extras } = computeVariables(input(sanaHistory(), 5));
  assert.equal(vars.B1.raw, 1);
  assert.equal(vars.B2.raw, 0);
  assert.equal(extras.rachaB2, 0);
  assert.equal(vars.B3.raw, null);
});

test("salto_un_mes: skipped tax in month 4, double in month 5", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i === 3) f.obligaciones.tax = 0;
    if (i === 4) f.obligaciones.tax = 20_000;
  });
  const m4 = computeVariables(input(h, 3));
  assert.equal(m4.vars.B2.raw, 1);
  assert.ok(m4.vars.B1.raw! < 1);
  const m5 = computeVariables(input(h, 4));
  assert.equal(m5.vars.B2.raw, 0);
  assert.equal(m5.vars.B1.raw, 1);
  assert.deepEqual(m5.extras.rachaB2Prev, [1, 0, 0]);
});

test("impago: two months without social security", () => {
  const h = sanaHistory(6, (f, i) => {
    if (i >= 4) f.obligaciones.social_security = 0;
  });
  const { vars } = computeVariables(input(h, 5));
  assert.equal(vars.B2.raw, 2);
});

test("B3 median supplier delay from paid invoices in the last 6 months", () => {
  const inv = (id: string, due: string, paid: string, amount: number): Invoice => ({
    id, company: "c", issued: "2024-12-01", due, paid, amount, status: "paid", counterparty: "s",
  });
  const invoices = [inv("1", "2025-01-10", "2025-01-20", -100), inv("2", "2025-01-10", "2025-01-12", -100), inv("3", "2025-01-10", "2025-02-15", -100)];
  const { vars } = computeVariables(input(sanaHistory(), 4, { invoices })); // t=4 → 2025-01
  assert.equal(vars.B3.raw, 6); // mediana de 10 y 2; la de febrero queda fuera (pagada tras fin(t))
  assert.ok(Math.abs(vars.B3.conf - 2 / 5) < 1e-9);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: FAIL en los tests nuevos (`B1.raw` es `null`).

- [ ] **Step 3: Implementación** — añadir en `variables.ts` antes de `computeVariables`:

```ts
import { OBLIGACIONES, type Obligacion } from "@/lib/features/scoring/types";
import { CALENDAR, endOfMonth, median } from "@/lib/features/scoring/windows";

type ObligacionStat = { recurrente: boolean; pagado: number; esperado: number; racha: number };

export function obligacionStat(w6: (Flow | undefined)[], k: Obligacion, scheduleMonthly: number): ObligacionStat {
  const amounts = w6.map((f) => (f ? f.obligaciones[k] : 0));
  const presentes = amounts.filter((a) => a > 0);
  const recurrente = presentes.length >= PARAMS.recurrenciaMin;
  if (!recurrente) return { recurrente: false, pagado: 0, esperado: 0, racha: 0 };
  const esperadoMes = k === "debt_repayment" && scheduleMonthly > 0 ? scheduleMonthly : median(presentes)!;
  const first = amounts.findIndex((a) => a > 0);
  const mesesEsperados = amounts.length - first;
  let racha = 0;
  for (let i = amounts.length - 1; i >= first && amounts[i] === 0; i--) racha++;
  return { recurrente: true, pagado: sum(presentes), esperado: esperadoMes * mesesEsperados, racha };
}

export function rachaAt(history: (Flow | undefined)[], t: number, scheduleMonthly: number): number {
  if (t < 0) return 0;
  const w6 = window(history, t, 6);
  return Math.max(0, ...OBLIGACIONES.map((k) => obligacionStat(w6, k, scheduleMonthly).racha));
}

function paidAt(i: Invoice, end: string): boolean {
  return i.status === "paid" && !!i.paid && i.paid <= end;
}
function days(a: string, b: string): number {
  return Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
}
export function medianDelay(items: Invoice[]): number | null {
  return median(items.map((i) => days(i.paid, i.due)).filter((d) => Math.abs(d) <= 365));
}
```

y dentro de `computeVariables`, en el hueco `// ---- Bloque B (Tarea 7)`:

```ts
  // ---- Bloque B
  const stats = OBLIGACIONES.map((k) => obligacionStat(w6, k, input.scheduleMonthly)).filter((o) => o.recurrente);
  const esperadoTotal = sum(stats.map((o) => o.esperado));
  const rachaB2 = stats.length ? Math.max(...stats.map((o) => o.racha)) : 0;
  vars.B1 = stats.length ? val(Math.min(1, sum(stats.map((o) => o.pagado)) / esperadoTotal), cTx) : na();
  vars.B2 = stats.length ? val(rachaB2, cVentana6) : na();
  const end = endOfMonth(CALENDAR[t]);
  const start6 = `${CALENDAR[Math.max(0, t - 5)]}-01`;
  const eligible = input.invoices.filter((i) => i.issued <= end);
  const paidSupplier = eligible.filter((i) => i.amount < 0 && paidAt(i, end) && i.paid >= start6);
  vars.B3 = val(medianDelay(paidSupplier), Math.min(1, paidSupplier.length / PARAMS.nFacturasRef));
  extras.rachaB2 = rachaB2;
  extras.rachaB2Prev = [1, 2, 3].map((k) => rachaAt(history, t - k, input.scheduleMonthly));
  extras.cobertura.nFacturasProv6m = paidSupplier.length;
```

Va en el hueco marcado `// ---- Bloque B (Tarea 7)`; `extras` ya existe en ese punto.

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: `# pass 6`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/variables.ts lib/features/scoring/variables.test.ts
git commit -m "feat(scoring): block B reliability variables"
```

---

## Tarea 8: Variables bloque C (dependencia)

**Files:**
- Modify: `lib/features/scoring/variables.ts`
- Test: `lib/features/scoring/variables.test.ts`

- [ ] **Step 1: Tests que fallan**

```ts
test("C1/C2 concentration over 12 months of identified counterparties", () => {
  const h = sanaHistory(6, (f) => {
    f.pagosPorContraparte = { p1: 40_000, p2: 5_000, p3: 5_000, p4: 5_000 };
  });
  const { vars } = computeVariables(input(h, 5));
  assert.ok(Math.abs(vars.C1.raw! - 0.3) < 1e-9); // 10 clientes iguales
  assert.ok(Math.abs(vars.C2.raw! - 50 / 55) < 1e-9);
  assert.ok(Math.abs(vars.C1.conf - (6 / 12) * 1) < 1e-9); // identificados 100 %, ventana 6/12
});

test("C3, C4 from client invoices; C6 from returned receipts; C5 needs 6 observations", () => {
  const inv = (id: string, due: string, paid: string, status: string, amount: number): Invoice => ({
    id, company: "c", issued: "2024-12-01", due, paid, amount, status, counterparty: "k",
  });
  const invoices = [
    inv("1", "2025-01-05", "2025-01-15", "paid", 100),
    inv("2", "2025-01-05", "2025-01-05", "overdue", 300),
    inv("3", "2025-01-05", "2025-03-01", "paid", 100), // pagada tras fin(t): vencida en t
  ];
  const h = sanaHistory(6, (f) => (f.recibosDevueltos = 2_000));
  const { vars, extras } = computeVariables(input(h, 4, { invoices })); // t=4 → 2025-01
  assert.equal(vars.C3.raw, 10);
  assert.ok(Math.abs(vars.C4.raw! - 400 / 500) < 1e-9);
  assert.equal(extras.C4, vars.C4.raw);
  assert.ok(Math.abs(vars.C6.raw! - 0.02) < 1e-9);
  assert.equal(vars.C5.raw, null); // 5 meses observados < 6
  const { vars: v6 } = computeVariables(input(h, 5));
  assert.equal(v6.C5.raw, 0); // 6 meses iguales → MAD 0
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: FAIL en los dos tests nuevos.

- [ ] **Step 3: Implementación** — añadir en `computeVariables`, en el hueco `// ---- Bloque C (Tarea 8)`:

```ts
  // ---- Bloque C
  const top3Share = (key: "cobrosPorContraparte" | "pagosPorContraparte", total: number) => {
    const by: Record<string, number> = {};
    for (const f of w12) if (f) for (const [cp, a] of Object.entries(f[key])) by[cp] = (by[cp] ?? 0) + a;
    const vals = Object.values(by).sort((a, b) => b - a);
    const identificado = sum(vals);
    return { raw: divide(sum(vals.slice(0, 3)), identificado), conf: (obs12 / 12) * (total > 0 ? identificado / total : 0) };
  };
  const c1 = top3Share("cobrosPorContraparte", extras.cobrosOp12m);
  const c2 = top3Share("pagosPorContraparte", extras.pagosOp12m);
  vars.C1 = val(c1.raw, c1.conf);
  vars.C2 = val(c2.raw, c2.conf);
  const client = eligible.filter((i) => i.amount > 0);
  const paidClient = client.filter((i) => paidAt(i, end) && i.paid >= start6);
  const dueClient = client.filter((i) => i.due >= start6 && i.due <= end);
  const vencido = divide(sum(dueClient.filter((i) => !paidAt(i, end)).map((i) => i.amount)), sum(dueClient.map((i) => i.amount)));
  vars.C3 = val(medianDelay(paidClient), Math.min(1, paidClient.length / PARAMS.nFacturasRef));
  vars.C4 = val(vencido, Math.min(1, dueClient.length / PARAMS.nFacturasRef));
  const obsCobros = w12.filter((f): f is Flow => !!f).map((f) => f.cobrosOp);
  const med = obsCobros.length >= PARAMS.minObsVolatilidad ? median(obsCobros) : null;
  vars.C5 = val(med && med > 0 ? mad(obsCobros)! / med : null, (obs12 / 12) * cobertura6);
  vars.C6 = val(divide(s(w6, "recibosDevueltos"), cobros6), cTx);
  extras.C3dias = vars.C3.raw;
  extras.C4 = vars.C4.raw;
  extras.cobertura.nFacturasCli6m = paidClient.length + dueClient.length;
```

Añade `mad` al import de `windows`.

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/variables.test.ts`
Expected: `# pass 8`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/variables.ts lib/features/scoring/variables.test.ts
git commit -m "feat(scoring): block C dependency variables"
```

---

## Tarea 9: Subnotas, agregación y estado

**Files:**
- Create: `lib/features/scoring/aggregate.ts`
- Test: `lib/features/scoring/aggregate.test.ts`

Percentiles de fixture (scoring-engine §12): A1 [−0,10; 0,30] · A2 [0; 0,67] · A3 [0,5; 4,0] · A4 [0; 0,50] · A5 [0; 0,60] · B1 [0,5; 1,0] · B3 [−10; 60] · C1 [0,2; 0,9] · C2 [0,2; 0,9] · C3 [−5; 60] · C4 [0; 0,6] · C5 [0,05; 0,8] · C6 [0; 0,10]. B2 usa regla directa.

- [ ] **Step 1: Percentiles de fixture compartidos** — crear `lib/features/scoring/fixtures.ts`:

```ts
import type { Percentiles } from "@/lib/features/scoring/types";

/** Percentiles fijos de scoring-engine §12 para que los fixtures sean calculables a mano. Solo tests. */
export const FIXTURE_PERCENTILES: Percentiles = {
  A1: { p5: -0.1, p95: 0.3 }, A2: { p5: 0, p95: 0.67 }, A3: { p5: 0.5, p95: 4 }, A4: { p5: 0, p95: 0.5 }, A5: { p5: 0, p95: 0.6 },
  B1: { p5: 0.5, p95: 1 }, B2: { p5: 0, p95: 2 }, B3: { p5: -10, p95: 60 },
  C1: { p5: 0.2, p95: 0.9 }, C2: { p5: 0.2, p95: 0.9 }, C3: { p5: -5, p95: 60 }, C4: { p5: 0, p95: 0.6 }, C5: { p5: 0.05, p95: 0.8 }, C6: { p5: 0, p95: 0.1 },
};
```

- [ ] **Step 1b: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { aggregate, estado, subnota, subnotaB2 } from "@/lib/features/scoring/aggregate";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/fixtures";
import type { VariableSet } from "@/lib/features/scoring/types";

test("subnota scales between p5 and p95 and inverts for 'bajo'", () => {
  assert.ok(Math.abs(subnota("A1", 0.15, FIXTURE_PERCENTILES) - 62.5) < 1e-9);
  assert.ok(Math.abs(subnota("A3", 3, FIXTURE_PERCENTILES) - 71.428571) < 1e-5);
  assert.ok(Math.abs(subnota("A4", 0.05, FIXTURE_PERCENTILES) - 90) < 1e-9);
  assert.equal(subnota("A1", 5, FIXTURE_PERCENTILES), 100);
  assert.equal(subnota("A1", null, FIXTURE_PERCENTILES), 50);
});

test("B2 rule with decay", () => {
  assert.equal(subnotaB2(2, [0, 0, 0]), 0);
  assert.equal(subnotaB2(1, [0, 0, 0]), 70);
  assert.equal(subnotaB2(0, [1, 0, 0]), 80);
  assert.equal(subnotaB2(0, [0, 1, 0]), 90);
  assert.equal(subnotaB2(0, [0, 0, 1]), 100);
  assert.equal(subnotaB2(0, [0, 0, 0]), 100);
  assert.ok(Math.abs(subnotaB2(0, [2, 0, 0]) - 100 / 3) < 1e-9);
});

test("aggregate: contributions sum to score_solo, NA pulls to 50", () => {
  const vars = {
    A1: { raw: 0.15, conf: 1 }, A2: { raw: 0, conf: 1 }, A3: { raw: 3, conf: 1 }, A4: { raw: 0.05, conf: 1 }, A5: { raw: null, conf: 0.3 },
    B1: { raw: 1, conf: 1 }, B2: { raw: 0, conf: 1 }, B3: { raw: null, conf: 0 },
    C1: { raw: 0.3, conf: 1 }, C2: { raw: null, conf: 0 }, C3: { raw: null, conf: 0 }, C4: { raw: null, conf: 0 }, C5: { raw: 0, conf: 1 }, C6: { raw: 0, conf: 1 },
  } as VariableSet;
  const r = aggregate(vars, { rachaB2: 0, rachaB2Prev: [0, 0, 0] }, FIXTURE_PERCENTILES);
  const sumA = r.contributions.filter((c) => c.id.startsWith("A")).reduce((a, c) => a + c.aportacion, 0);
  assert.ok(Math.abs(r.subscores.A - (62.5 + 100 + 71.428571 + 90 + 50) / 5) < 1e-4);
  assert.ok(Math.abs(sumA - 0.45 * r.subscores.A) < 1e-9);
  assert.ok(Math.abs(r.contributions.reduce((a, c) => a + c.aportacion, 0) - r.scoreSolo) < 1e-9);
  assert.ok(Math.abs(r.confs.A - (1 + 1 + 1 + 1 + 0.3) / 5) < 1e-9);
  const a1 = r.contributions.find((c) => c.id === "A1")!;
  assert.equal(a1.umbralSano, 0.1);
  assert.equal(a1.sano, true);
});

test("estado thresholds", () => {
  assert.equal(estado(80, 0.9, 0), "sana");
  assert.equal(estado(80, 0.4, 0), "vigilar");
  assert.equal(estado(60, 0.9, 0), "vigilar");
  assert.equal(estado(40, 0.9, 0), "riesgo");
  assert.equal(estado(80, 0.9, 2), "riesgo");
  assert.equal(estado(80, 0.2, 0), "sin_datos");
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/aggregate.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { PARAMS, type Bloque, type VariableId } from "@/lib/features/scoring/params";
import type { Contribution, Estado, Percentiles, VariableSet } from "@/lib/features/scoring/types";
import { clamp } from "@/lib/features/scoring/windows";

export function subnota(id: VariableId, raw: number | null, percentiles: Percentiles): number {
  if (raw === null || !Number.isFinite(raw)) return 50;
  const { p5, p95 } = percentiles[id];
  if (!(p95 > p5)) return 50;
  const u = clamp((raw - p5) / (p95 - p5));
  return 100 * (PARAMS.mejor[id] === "alto" ? u : 1 - u);
}

/** prev = [racha(t-1), racha(t-2), racha(t-3)]. Decisión 7. */
export function subnotaB2(racha: number, prev: number[]): number {
  if (racha >= 2) return 0;
  if (racha === 1) return PARAMS.subnotaRacha1;
  for (let k = 1; k <= PARAMS.decaimientoMeses; k++) {
    const r = prev[k - 1] ?? 0;
    if (r > 0) {
      const base = r === 1 ? PARAMS.subnotaRacha1 : 0;
      return base + ((100 - base) * k) / PARAMS.decaimientoMeses;
    }
  }
  return 100;
}

export function sano(id: VariableId, raw: number | null): { umbralSano: number | null; sano: boolean | null } {
  const u = PARAMS.umbralSano[id];
  if (u === undefined) return { umbralSano: null, sano: null };
  if (raw === null) return { umbralSano: u, sano: null };
  return { umbralSano: u, sano: PARAMS.mejor[id] === "alto" ? raw >= u : raw <= u };
}

export type Aggregated = {
  contributions: Contribution[];
  subscores: Record<Bloque, number>;
  confs: Record<Bloque, number>;
  scoreSolo: number;
  confianza: number;
};

export function aggregate(
  vars: VariableSet,
  racha: { rachaB2: number; rachaB2Prev: number[] },
  percentiles: Percentiles,
): Aggregated {
  const contributions: Contribution[] = [];
  const subscores = { A: 0, B: 0, C: 0 }, confs = { A: 0, B: 0, C: 0 };
  for (const bloque of ["A", "B", "C"] as const) {
    const ids = PARAMS.bloques[bloque];
    for (const id of ids) {
      const v = vars[id];
      const s = id === "B2" ? (v.raw === null ? 50 : subnotaB2(racha.rachaB2, racha.rachaB2Prev)) : subnota(id, v.raw, percentiles);
      const notaEf = 50 + v.conf * (s - 50);
      const aportacion = (PARAMS.pesos[bloque] / ids.length) * notaEf;
      contributions.push({ id, raw: v.raw, subnota: s, conf: v.conf, aportacion, ...sano(id, v.raw) });
      subscores[bloque] += notaEf / ids.length;
      confs[bloque] += v.conf / ids.length;
    }
  }
  const scoreSolo = contributions.reduce((a, c) => a + c.aportacion, 0);
  const confianza = PARAMS.pesos.A * confs.A + PARAMS.pesos.B * confs.B + PARAMS.pesos.C * confs.C;
  return { contributions, subscores, confs, scoreSolo, confianza };
}

export function estado(score: number, confianza: number, rachaB2: number): Estado {
  if (confianza < PARAMS.confSinDatos) return "sin_datos";
  if (score < PARAMS.scoreRiesgo || rachaB2 >= 2) return "riesgo";
  if (score >= PARAMS.scoreSana && confianza >= PARAMS.confSana) return "sana";
  return "vigilar";
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/aggregate.test.ts`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/aggregate.ts lib/features/scoring/aggregate.test.ts lib/features/scoring/fixtures.ts
git commit -m "feat(scoring): subscores, aggregation and state"
```

---

## Tarea 10: Grupo (D1-D5 y aval/contagio)

**Files:**
- Create: `lib/features/scoring/group.ts`
- Test: `lib/features/scoring/group.test.ts`

- [ ] **Step 1: Test que falla (fixtures `grupo_aval` y `grupo_contagio`)**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { avalGrupo, groupVariables, type GroupMember } from "@/lib/features/scoring/group";

function member(p: Partial<GroupMember>): GroupMember {
  return {
    company: "x", scoreSolo: 50, confianza: 1, cobrosOp12m: 0, pagosOp12m: 0, capacidadCuotaAdv: 0,
    obligacionesMedia6m: 1, intragrupoIn12m: 0, intragrupoOut12m: 0, ...p,
  };
}

test("grupo_aval: rich sibling lifts a weak subsidiary, capped by w", () => {
  const filial = member({ company: "f", scoreSolo: 35, cobrosOp12m: 240_000, pagosOp12m: 252_000, obligacionesMedia6m: 1_000, intragrupoIn12m: 60_000 });
  const hermana = member({ company: "h", scoreSolo: 80, cobrosOp12m: 6_000_000, pagosOp12m: 4_200_000, capacidadCuotaAdv: 50_000, intragrupoOut12m: 60_000 });
  const d = groupVariables(filial, [hermana]);
  assert.ok(Math.abs(d.D1 - 240_000 / 6_240_000) < 1e-9);
  assert.equal(d.D2, 80);
  assert.equal(d.D3, 50);
  assert.ok(Math.abs(d.D4! - 0.25) < 1e-9);
  assert.ok(Math.abs(d.D5 - 60_000 / 492_000) < 1e-9);
  const aval = avalGrupo(35, d.D2, d.D3, d.D5);
  const w = 0.4 * Math.min(1, d.D5 / 0.2);
  assert.ok(Math.abs(aval - w * 45) < 1e-9);
  assert.ok(aval > 0 && aval <= 20);
});

test("grupo_contagio: weak sibling drags a healthy one without capacity filter", () => {
  const filial = member({ company: "f", scoreSolo: 78, cobrosOp12m: 1_200_000, pagosOp12m: 1_020_000, intragrupoOut12m: 180_000 });
  const hermana = member({ company: "h", scoreSolo: 30, cobrosOp12m: 600_000, pagosOp12m: 700_000, capacidadCuotaAdv: 0, intragrupoIn12m: 180_000 });
  const d = groupVariables(filial, [hermana]);
  assert.equal(d.D3, 0);
  const aval = avalGrupo(78, d.D2, d.D3, d.D5);
  const w = 0.4 * Math.min(1, d.D5 / 0.2);
  assert.ok(Math.abs(aval - w * (30 - 78)) < 1e-9);
  assert.ok(aval < 0);
});

test("single company: no group effect; cap at ±20", () => {
  const d = groupVariables(member({ cobrosOp12m: 100 }), []);
  assert.equal(d.D1, 1);
  assert.equal(d.D2, null);
  assert.equal(avalGrupo(50, d.D2, d.D3, d.D5), 0);
  assert.equal(avalGrupo(10, 100, 10, 1), 20);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/group.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { PARAMS } from "@/lib/features/scoring/params";
import { clamp, divide, sum } from "@/lib/features/scoring/windows";

export type GroupMember = {
  company: string;
  scoreSolo: number;
  confianza: number;
  cobrosOp12m: number;
  pagosOp12m: number;
  capacidadCuotaAdv: number;
  obligacionesMedia6m: number; // servicio_deuda + obligaciones_rec, media 6 m
  intragrupoIn12m: number;
  intragrupoOut12m: number;
};

export type GroupVars = { D1: number; D2: number | null; D3: number | null; D4: number | null; D5: number; confD: number };

export function groupVariables(me: GroupMember, siblings: GroupMember[]): GroupVars {
  const cobrosGrupo = me.cobrosOp12m + sum(siblings.map((s) => s.cobrosOp12m));
  const D1 = cobrosGrupo > 0 ? me.cobrosOp12m / cobrosGrupo : siblings.length ? 0 : 1;
  const D5 = divide(me.intragrupoIn12m + me.intragrupoOut12m, me.cobrosOp12m + me.pagosOp12m) ?? 0;
  const D4 = divide(me.intragrupoIn12m - me.intragrupoOut12m, me.cobrosOp12m);
  if (!siblings.length) return { D1, D2: null, D3: null, D4, D5, confD: 0 };
  const peso = sum(siblings.map((s) => s.cobrosOp12m));
  const D2 = peso > 0 ? sum(siblings.map((s) => s.scoreSolo * s.cobrosOp12m)) / peso : sum(siblings.map((s) => s.scoreSolo)) / siblings.length;
  const capacidad = sum(siblings.map((s) => s.capacidadCuotaAdv));
  const D3 = me.obligacionesMedia6m > 0 ? capacidad / me.obligacionesMedia6m : capacidad > 0 ? PARAMS.d3Ref : 0;
  const confD = peso > 0 ? sum(siblings.map((s) => s.confianza * s.cobrosOp12m)) / peso : 0;
  return { D1, D2, D3, D4, D5, confD };
}

export function avalGrupo(scoreSolo: number, D2: number | null, D3: number | null, D5: number): number {
  if (D2 === null) return 0;
  const w = PARAMS.wMax * Math.min(1, D5 / PARAMS.d5Saturacion);
  const a = D2 > scoreSolo ? w * Math.min(1, (D3 ?? 0) / PARAMS.d3Ref) * (D2 - scoreSolo) : w * (D2 - scoreSolo);
  return clamp(a, -PARAMS.avalMax, PARAMS.avalMax);
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/group.test.ts`
Expected: `# pass 3`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/group.ts lib/features/scoring/group.test.ts
git commit -m "feat(scoring): group variables and aval/contagio adjustment"
```

---

## Tarea 11: Evolución y alertas

**Files:**
- Create: `lib/features/scoring/evolution.ts`
- Test: `lib/features/scoring/evolution.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { computeAlerts, deltas, direccion, naturaleza } from "@/lib/features/scoring/evolution";
import type { Contribution, Senales } from "@/lib/features/scoring/types";

function c(id: Contribution["id"], aportacion: number): Contribution {
  return { id, raw: null, subnota: 50, conf: 1, aportacion, umbralSano: null, sano: null };
}
const flags = (p: Partial<Senales>): Senales => ({
  deterioro: false, estructural: false, mejora: false, deficit: false, impago: false, vencidoAlto: false, contagio: false, datosInsuficientes: false, ...p,
});

test("direction needs a 6-point move over 3 months", () => {
  assert.equal(direccion(60, 66), "deterioro");
  assert.equal(direccion(66, 60), "mejora");
  assert.equal(direccion(63, 60), "estable");
  assert.equal(direccion(63, null), "estable");
});

test("naturaleza: structural needs persistence, two variables and a level variable", () => {
  const now = [c("A1", 5), c("A2", 8), c("C5", 4)];
  const three = [c("A1", 8), c("A2", 10), c("C5", 4)];
  assert.equal(naturaleza("deterioro", "deterioro", now, three), "estructural");
  assert.equal(naturaleza("deterioro", "estable", now, three), "temporal");
  assert.equal(naturaleza("deterioro", "deterioro", [c("A1", 5), c("C5", 1)], [c("A1", 8), c("C5", 4)]), "estructural");
  assert.equal(naturaleza("deterioro", "deterioro", [c("C5", 1), c("C6", 1)], [c("C5", 4), c("C6", 4)]), "temporal");
  assert.equal(naturaleza("estable", "estable", now, three), "sin_cambio");
});

test("deltas decompose exactly", () => {
  const d = deltas([c("A1", 5), c("grupo", 2)], [c("A1", 8), c("grupo", -1)]);
  assert.deepEqual(d, [{ id: "A1", delta: -3 }, { id: "grupo", delta: 3 }]);
});

test("alerts with persistence and onset month", () => {
  const prev = [flags({ deterioro: true }), flags({ deterioro: true, deficit: true })]; // t-2, t-1
  const now = flags({ deterioro: true, deficit: true, vencidoAlto: true });
  const a = computeAlerts(now, prev, ["2025-01", "2025-02", "2025-03"]);
  assert.deepEqual(a.find((x) => x.tipo === "deterioro"), { tipo: "deterioro", desdeMes: "2025-01" });
  assert.equal(a.some((x) => x.tipo === "deficit_persistente"), false); // solo 2 meses
  assert.deepEqual(a.find((x) => x.tipo === "vencido_alto"), { tipo: "vencido_alto", desdeMes: "2025-03" });
  assert.equal(computeAlerts(flags({ deterioro: true }), [], ["2025-01"]).length, 0); // necesita 2 meses
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/evolution.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { PARAMS } from "@/lib/features/scoring/params";
import type { Alert, Contribution, Direccion, Naturaleza, Senales } from "@/lib/features/scoring/types";

export function direccion(score: number, score3: number | null): Direccion {
  if (score3 === null) return "estable";
  const d = score - score3;
  if (d >= PARAMS.umbralDireccion) return "mejora";
  if (d <= -PARAMS.umbralDireccion) return "deterioro";
  return "estable";
}

const NIVEL = new Set(["A1", "A2", "A3"]);

export function naturaleza(
  dir: Direccion,
  dirPrev: Direccion,
  contributions: Contribution[],
  contributions3: Contribution[] | null,
): Naturaleza {
  if (dir === "estable") return "sin_cambio";
  if (dirPrev !== dir || !contributions3) return "temporal";
  const sign = dir === "mejora" ? 1 : -1;
  const moved = contributions.filter((c) => {
    const before = contributions3.find((x) => x.id === c.id);
    return before && sign * (c.aportacion - before.aportacion) >= PARAMS.deltaAportacionMin;
  });
  return moved.length >= PARAMS.minVariablesEstructural && moved.some((c) => NIVEL.has(c.id)) ? "estructural" : "temporal";
}

export function deltas(now: Contribution[], prev: Contribution[] | null): { id: Contribution["id"]; delta: number }[] {
  return now.map((c) => ({ id: c.id, delta: c.aportacion - (prev?.find((p) => p.id === c.id)?.aportacion ?? c.aportacion) }));
}

const RULES: { tipo: string; flag: keyof Senales; meses: number }[] = [
  { tipo: "deterioro", flag: "deterioro", meses: 2 },
  { tipo: "deterioro_estructural", flag: "estructural", meses: 1 },
  { tipo: "recuperacion", flag: "mejora", meses: 2 },
  { tipo: "deficit_persistente", flag: "deficit", meses: 3 },
  { tipo: "impago_obligaciones", flag: "impago", meses: 1 },
  { tipo: "vencido_alto", flag: "vencidoAlto", meses: 1 },
  { tipo: "contagio_grupo", flag: "contagio", meses: 1 },
  { tipo: "datos_insuficientes", flag: "datosInsuficientes", meses: 1 },
];

/** prev: señales de los meses anteriores en orden cronológico; months: meses de prev seguidos del actual. */
export function computeAlerts(now: Senales, prev: Senales[], months: string[]): Alert[] {
  const all = [...prev, now];
  const out: Alert[] = [];
  for (const r of RULES) {
    if (!now[r.flag]) continue;
    let run = 0;
    for (let i = all.length - 1; i >= 0 && all[i][r.flag]; i--) run++;
    if (run >= r.meses) out.push({ tipo: r.tipo, desdeMes: months[all.length - run] });
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/evolution.test.ts`
Expected: `# pass 4`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/evolution.ts lib/features/scoring/evolution.test.ts
git commit -m "feat(scoring): trend, nature, deltas and signal alerts"
```

---

## Tarea 12: Split y percentiles congelados

**Files:**
- Create: `lib/features/scoring/fit.ts`
- Test: `lib/features/scoring/fit.test.ts`

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { fitPercentiles, groupSplit } from "@/lib/features/scoring/fit";

test("split is deterministic, disjoint and by group", () => {
  const groups = ["g1", "g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"];
  const s = groupSplit(groups);
  assert.deepEqual(s, groupSplit([...groups].reverse()));
  assert.ok(s.train.every((g) => !s.validation.includes(g)));
  assert.equal(s.train.length + s.validation.length, 10);
  assert.equal(s.train.length, 7);
});

test("percentiles use only confident samples and freeze into a version", () => {
  const samples = Array.from({ length: 100 }, (_, i) => ({ id: "A1" as const, raw: i / 100, conf: i < 50 ? 0.2 : 1 }));
  const p = fitPercentiles(samples, ["g1"], ["g2"], "fp");
  assert.ok(p.percentiles.A1.p5 >= 0.5);
  assert.ok(p.percentiles.A1.p95 <= 0.99 + 1e-9);
  assert.equal(p.percentiles.C6.p5, 0); // sin muestras → [0, 1]
  assert.equal(p.percentiles.C6.p95, 1);
  assert.equal(p.version.length, 64);
  assert.notEqual(p.version, fitPercentiles(samples, ["g1"], ["g2"], "other").version);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/fit.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { createHash } from "node:crypto";
import { hashParams, PARAMS, VARIABLES, type VariableId } from "@/lib/features/scoring/params";
import type { Parameters, Percentiles } from "@/lib/features/scoring/types";
import { percentile } from "@/lib/features/scoring/windows";

export function groupSplit(groups: string[]): { train: string[]; validation: string[] } {
  const key = (g: string) => createHash("sha256").update(`42:${g}`).digest("hex");
  const unique = [...new Set(groups)].sort((a, b) => key(a).localeCompare(key(b)));
  const cut = Math.ceil(unique.length * 0.7);
  return { train: unique.slice(0, cut), validation: unique.slice(cut) };
}

export type Sample = { id: VariableId; raw: number | null; conf: number };

export function fitPercentiles(samples: Sample[], train: string[], validation: string[], inputFingerprint: string): Parameters {
  const percentiles = {} as Percentiles;
  for (const id of VARIABLES) {
    const xs = samples
      .filter((s) => s.id === id && s.raw !== null && Number.isFinite(s.raw) && s.conf >= PARAMS.confSana)
      .map((s) => s.raw as number);
    percentiles[id] = xs.length ? { p5: percentile(xs, 0.05), p95: percentile(xs, 0.95) } : { p5: 0, p95: 1 };
  }
  const core = { paramsHash: hashParams(PARAMS), percentiles, trainGroups: train, validationGroups: validation, inputFingerprint };
  return { ...core, version: createHash("sha256").update(JSON.stringify(core)).digest("hex") };
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/fit.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/fit.ts lib/features/scoring/fit.test.ts
git commit -m "feat(scoring): group split and frozen percentiles"
```

---

## Tarea 13: Orquestador por grupo (`engine.ts`) y contrato zod

**Files:**
- Rewrite: `lib/features/scoring/engine.ts`
- Rewrite: `lib/features/scoring/contracts.ts`
- Rewrite: `lib/features/scoring/engine.test.ts`

- [ ] **Step 1: Test que falla**

Sustituir `engine.test.ts` por:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURE_PERCENTILES } from "@/lib/features/scoring/fixtures";
import { scoreRowSchema } from "@/lib/features/scoring/contracts";
import { prepareGroup, scoreGroup, type GroupInput } from "@/lib/features/scoring/engine";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type { Parameters, Product, Tx } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params: Parameters = {
  version: "v", paramsHash: hashParams(PARAMS), percentiles: FIXTURE_PERCENTILES, trainGroups: [], validationGroups: [], inputFingerprint: "fp",
};
function tx(id: string, company: string, month: string, amount: number, category: string): Tx {
  return { id, company, product: `cash-${company}`, date: `${month}-10`, month, amount, category, counterparty: "" };
}
function input(months: number, monthly: (m: string, i: number) => Tx[]): GroupInput {
  const products = new Map<string, Product>([
    ["cash-f", { company: "f", type: "checking", currency: "EUR", service: "" }],
    ["cash-h", { company: "h", type: "checking", currency: "EUR", service: "" }],
  ]);
  const txs = CALENDAR.slice(0, months).flatMap((m, i) => monthly(m, i));
  return {
    groupId: "g",
    companies: [{ id: "f", groupId: "g", currency: "EUR" }, { id: "h", groupId: "g", currency: "EUR" }],
    txs, invoices: new Map(), schedule: new Map(), products,
  };
}

test("rows respect the contract and exact decompositions", () => {
  const rows = scoreGroup(input(8, (m, i) => [
    tx(`f${i}a`, "f", m, 20_000, "collection"), tx(`f${i}b`, "f", m, -21_000, "payment"), tx(`f${i}t`, "f", m, -8_000, "tax"),
    tx(`h${i}a`, "h", m, 500_000, "collection"), tx(`h${i}b`, "h", m, -250_000, "payment"), tx(`h${i}t`, "h", m, -50_000, "tax"),
    tx(`h${i}m`, "h", m, -5_000, "transfer"), tx(`f${i}m`, "f", m, 5_000, "collection"),
  ]), params);
  assert.equal(rows.length, 2 * CALENDAR.length);
  for (const r of rows) {
    scoreRowSchema.parse(r);
    assert.ok(Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.score) < 1e-6);
    assert.ok(r.score >= 0 && r.score <= 100);
  }
  const f = rows.filter((r) => r.company === "f");
  for (let i = 1; i < f.length; i++)
    assert.ok(Math.abs(f[i].deltaContrib.reduce((a, d) => a + d.delta, 0) - (f[i].score - f[i - 1].score)) < 1e-6);
  const f7 = f[7];
  assert.ok(f7.avalGrupo > 0, "rich sibling with mirrored transfers should lift f");
  assert.equal(f7.variables.find((c) => c.id === "grupo")!.aportacion, f7.avalGrupo);
  assert.ok(f7.cobrosOpMedia6m < 20_001, "mirrored inflow is not a cobro");
});

test("months without data give score 50, confidence 0, sin_datos; later data never changes an earlier row", () => {
  const a = scoreGroup(input(3, (m, i) => [tx(`f${i}`, "f", m, 100, "collection")]), params);
  const b = scoreGroup(input(6, (m, i) => [tx(`f${i}`, "f", m, i < 3 ? 100 : -900, i < 3 ? "collection" : "payment")]), params);
  const fa = a.filter((r) => r.company === "f"), fb = b.filter((r) => r.company === "f");
  assert.equal(fa[2].score, fb[2].score);
  const empty = a.find((r) => r.company === "h" && r.month === CALENDAR[0])!;
  assert.equal(empty.scoreSolo, 50);
  assert.equal(empty.confianza, 0);
  assert.equal(empty.estado, "sin_datos");
});

test("prepareGroup exposes history per company", () => {
  const p = prepareGroup(input(2, (m, i) => [tx(`f${i}`, "f", m, 100, "collection")]));
  assert.equal(p.get("f")!.history.filter(Boolean).length, 2);
  assert.equal(p.get("h")!.history.filter(Boolean).length, 0);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/engine.test.ts`
Expected: FAIL (`scoreGroup` no exportado).

- [ ] **Step 3: Implementar `contracts.ts`**

```ts
import { z } from "zod";
import { VARIABLES } from "@/lib/features/scoring/params";

const finite = z.number().finite();
const nullable = finite.nullable();
const id = z.enum([...VARIABLES, "grupo"]);
const bloque = z.object({ A: finite, B: finite, C: finite });
const contribution = z.object({
  id, raw: nullable, subnota: finite.min(0).max(100), conf: finite.min(0).max(1), aportacion: finite,
  umbralSano: nullable, sano: z.boolean().nullable(),
});
export const scoreRowSchema = z.object({
  company: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  groupId: z.string().min(1),
  versionParametros: z.string().min(1),
  score: finite.min(0).max(100),
  scoreSolo: finite.min(0).max(100),
  avalGrupo: finite.min(-20).max(20),
  confianza: finite.min(0).max(1),
  subscores: bloque,
  confs: bloque,
  estado: z.enum(["sana", "vigilar", "riesgo", "sin_datos"]),
  variables: z.array(contribution).length(15),
  deltaContrib: z.array(z.object({ id, delta: finite })).length(15),
  direccion: z.enum(["mejora", "estable", "deterioro"]),
  naturaleza: z.enum(["temporal", "estructural", "sin_cambio"]),
  tendScore3m: nullable,
  tend3m: z.object({ A: nullable, B: nullable, C: nullable }),
  rachaB2: z.number().int().min(0),
  rachaDeficit: z.number().int().min(0),
  C3dias: nullable,
  C4: nullable,
  cobrosOpMedia3m: finite, cobrosOpMedia6m: finite, pagosOpMedia6m: finite, servicioDeudaMedia6m: finite,
  amortCreditoMedia6m: finite, obligacionesRecMedia6m: finite, capacidadCuotaAdv: finite.min(0),
  D1: finite.min(0).max(1), D2: nullable, D3: nullable, D4: nullable, D5: finite.min(0), confD: finite.min(0).max(1),
  tienePrestamoIntragrupo: z.boolean(),
  cobrosOpGrupoMedia6m: finite, pagosOpGrupoMedia6m: finite, servicioDeudaGrupoMedia6m: finite, scoreGrupo: nullable,
  deficitMes: z.boolean().nullable(),
  margenMes: nullable,
  senales: z.object({
    deterioro: z.boolean(), estructural: z.boolean(), mejora: z.boolean(), deficit: z.boolean(), impago: z.boolean(),
    vencidoAlto: z.boolean(), contagio: z.boolean(), datosInsuficientes: z.boolean(),
  }),
  alertas: z.array(z.object({ tipo: z.string(), desdeMes: z.string() })),
  cobertura: z.object({
    mesesObs6m: z.number().int(), mesesObs12m: z.number().int(), pctClasificado6m: finite.min(0).max(1),
    nFacturasCli6m: z.number().int(), nFacturasProv6m: z.number().int(), tieneLineaCredito: z.boolean(),
    tieneCuotas: z.boolean(), C4Estimado: z.boolean(), nHermanasConDatos: z.number().int(),
  }),
});
export type ScoreRowDTO = z.infer<typeof scoreRowSchema>;
```

- [ ] **Step 4: Implementar `engine.ts`**

```ts
import { aggregate, estado } from "@/lib/features/scoring/aggregate";
import { computeAlerts, deltas, direccion, naturaleza } from "@/lib/features/scoring/evolution";
import { groupFlows, monthlyFlows } from "@/lib/features/scoring/flows";
import { avalGrupo, groupVariables, type GroupMember } from "@/lib/features/scoring/group";
import { pairMirrors } from "@/lib/features/scoring/mirrors";
import { hashParams, PARAMS } from "@/lib/features/scoring/params";
import type { Company, Contribution, Flow, Invoice, Parameters, Product, ScoreRow, Senales, Tx } from "@/lib/features/scoring/types";
import { computeVariables, type VariableInput } from "@/lib/features/scoring/variables";
import { CALENDAR, monthIndex, window } from "@/lib/features/scoring/windows";

export type GroupInput = {
  groupId: string;
  companies: Company[];
  txs: Tx[]; // todos los movimientos booked del grupo, importes en €
  invoices: Map<string, Invoice[]>; // por empresa
  schedule: Map<string, number>; // cuota mensual esperada por empresa (cuadro)
  products: Map<string, Product>;
};

export type Prepared = {
  company: Company;
  history: (Flow | undefined)[];
  invoices: Invoice[];
  scheduleMonthly: number;
  hasLine: boolean;
  tienePrestamoIntragrupo: boolean;
};

export function prepareGroup(input: GroupInput): Map<string, Prepared> {
  const mirrors = pairMirrors(input.txs);
  const out = new Map<string, Prepared>();
  for (const c of input.companies) {
    const txs = input.txs.filter((t) => t.company === c.id);
    const flows = monthlyFlows(c.id, txs, input.products, mirrors);
    const history: (Flow | undefined)[] = CALENDAR.map((m) => flows.get(m));
    const own = [...input.products.entries()].filter(([, p]) => p.company === c.id);
    out.set(c.id, {
      company: c,
      history,
      invoices: input.invoices.get(c.id) ?? [],
      scheduleMonthly: input.schedule.get(c.id) ?? 0,
      hasLine: own.some(([, p]) => p.type === "lineofcredit"),
      tienePrestamoIntragrupo: own.some(([, p]) => p.service === "custom"),
    });
  }
  return out;
}

export function variablesAt(p: Prepared, t: number) {
  const inp: VariableInput = { company: p.company.id, t, history: p.history, invoices: p.invoices, scheduleMonthly: p.scheduleMonthly, hasLine: p.hasLine };
  return computeVariables(inp);
}

function media6(flows: ({ cobrosOp: number; pagosOp: number; servicioDeuda: number } | undefined)[], key: "cobrosOp" | "pagosOp" | "servicioDeuda", t: number): number {
  return flows.reduce((a, f) => a + (f ? f[key] : 0), 0) / Math.min(6, t + 1);
}

export function scoreGroup(input: GroupInput, params: Parameters): ScoreRow[] {
  if (params.paramsHash !== hashParams(PARAMS)) throw new Error("frozen parameters do not match PARAMS");
  const prepared = prepareGroup(input);
  const gflows = groupFlows([...prepared.values()].map((p) => new Map(p.history.filter((f): f is Flow => !!f).map((f) => [f.month, f]))));
  const ghistory = CALENDAR.map((m) => gflows.get(m));
  const rowsBy = new Map<string, ScoreRow[]>([...prepared.keys()].map((id) => [id, []]));
  const flagsBy = new Map<string, Senales[]>([...prepared.keys()].map((id) => [id, []]));

  for (let t = 0; t < CALENDAR.length; t++) {
    const month = CALENDAR[t];
    const stage = new Map<string, ReturnType<typeof variablesAt> & ReturnType<typeof aggregate>>();
    for (const [id, p] of prepared) {
      const v = variablesAt(p, t);
      stage.set(id, { ...v, ...aggregate(v.vars, v.extras, params.percentiles) });
    }
    const members = new Map<string, GroupMember>();
    for (const [id, s] of stage)
      members.set(id, {
        company: id, scoreSolo: s.scoreSolo, confianza: s.confianza,
        cobrosOp12m: s.extras.cobrosOp12m, pagosOp12m: s.extras.pagosOp12m, capacidadCuotaAdv: s.extras.capacidadCuotaAdv,
        obligacionesMedia6m: s.extras.servicioDeudaMedia6m + s.extras.obligacionesRecMedia6m,
        intragrupoIn12m: s.extras.intragrupoIn12m, intragrupoOut12m: s.extras.intragrupoOut12m,
      });
    const gw6 = window(ghistory, t, 6);
    for (const [id, s] of stage) {
      const p = prepared.get(id)!;
      const me = members.get(id)!;
      const siblings = [...members.values()].filter((m) => m.company !== id && prepared.get(m.company)!.history[t]);
      const d = groupVariables(me, siblings);
      const aval = avalGrupo(s.scoreSolo, d.D2, d.D3, d.D5);
      const score = Math.min(100, Math.max(0, s.scoreSolo + aval));
      const variables: Contribution[] = [...s.contributions, { id: "grupo", raw: d.D2, subnota: 50, conf: d.confD, aportacion: aval, umbralSano: null, sano: null }];
      const prevRows = rowsBy.get(id)!;
      const prev = prevRows[t - 1], three = prevRows[t - 3];
      const dir = direccion(score, three?.score ?? null);
      const nat = naturaleza(dir, prev?.direccion ?? "estable", variables, three?.variables ?? null);
      const est = estado(score, s.confianza, s.extras.rachaB2);
      const senales: Senales = {
        deterioro: dir === "deterioro", estructural: dir === "deterioro" && nat === "estructural", mejora: dir === "mejora",
        deficit: s.extras.deficitMes === true, impago: s.extras.rachaB2 >= 2,
        vencidoAlto: s.extras.C4 !== null && s.extras.C4 > PARAMS.vencidoAlto,
        contagio: aval <= PARAMS.alertaContagio, datosInsuficientes: s.confianza < PARAMS.confSinDatos,
      };
      const flags = flagsBy.get(id)!;
      const alertas = computeAlerts(senales, flags, CALENDAR.slice(0, t + 1));
      flags.push(senales);
      prevRows.push({
        company: id, month, groupId: input.groupId, versionParametros: params.version,
        score, scoreSolo: s.scoreSolo, avalGrupo: aval, confianza: s.confianza,
        subscores: s.subscores, confs: s.confs, estado: est,
        variables, deltaContrib: deltas(variables, prev?.variables ?? null),
        direccion: dir, naturaleza: nat,
        tendScore3m: three ? score - three.score : null,
        tend3m: { A: three ? s.subscores.A - three.subscores.A : null, B: three ? s.subscores.B - three.subscores.B : null, C: three ? s.subscores.C - three.subscores.C : null },
        rachaB2: s.extras.rachaB2, rachaDeficit: s.extras.rachaDeficit, C3dias: s.extras.C3dias, C4: s.extras.C4,
        cobrosOpMedia3m: s.extras.cobrosOpMedia3m, cobrosOpMedia6m: s.extras.cobrosOpMedia6m, pagosOpMedia6m: s.extras.pagosOpMedia6m,
        servicioDeudaMedia6m: s.extras.servicioDeudaMedia6m, amortCreditoMedia6m: s.extras.amortCreditoMedia6m,
        obligacionesRecMedia6m: s.extras.obligacionesRecMedia6m, capacidadCuotaAdv: s.extras.capacidadCuotaAdv,
        D1: d.D1, D2: d.D2, D3: d.D3, D4: d.D4, D5: d.D5, confD: d.confD, tienePrestamoIntragrupo: p.tienePrestamoIntragrupo,
        cobrosOpGrupoMedia6m: media6(gw6, "cobrosOp", t), pagosOpGrupoMedia6m: media6(gw6, "pagosOp", t), servicioDeudaGrupoMedia6m: media6(gw6, "servicioDeuda", t),
        scoreGrupo: null,
        deficitMes: s.extras.deficitMes, margenMes: s.extras.margenMes,
        senales, alertas,
        cobertura: { ...s.extras.cobertura, nHermanasConDatos: siblings.length },
      });
    }
  }
  return [...rowsBy.values()].flat();
}

export { monthIndex };
```

`scoreGrupo` se deja en `null` en esta tarea (se calcula pasando `GroupFlow` por las variables A-C; queda como mejora posterior y así lo declara el contrato como nullable).

- [ ] **Step 5: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/engine.test.ts && pnpm run typecheck`
Expected: `# pass 3`; typecheck falla solo en `scripts/scoring.ts`, `api.ts`, `backtest.ts` (importan `model.ts` viejo): se arreglan en las tareas 15-17.

- [ ] **Step 6: Commit**

```bash
git add lib/features/scoring/engine.ts lib/features/scoring/contracts.ts lib/features/scoring/engine.test.ts
git commit -m "feat(scoring): group orchestrator producing company_month_score rows"
```

---

## Tarea 14: Ingest por grupo, € y categorías de #12

**Files:**
- Rewrite: `lib/features/scoring/ingest.ts`
- Test: `lib/features/scoring/ingest.test.ts`

Cambios respecto al ingest actual: partición por **grupo** (`parts/tx-<group>.jsonl`, `parts/invoice-<group>.jsonl`); lee `exchange_rate` y `companies.currency`; conserva monedas ≠ EUR convirtiendo en ingest; primera pasada sobre `invoices.csv` para la tabla de tasas; sobreescribe `category` con `analysis/transaction_categories.csv` si `category_confidence ≥ 0,95`; lee `debt_schedule_config.csv` a cuota mensual esperada por empresa.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { ingest, readPartition } from "@/lib/features/scoring/ingest";
import type { Invoice, Tx } from "@/lib/features/scoring/types";

async function dataset(): Promise<{ dataset: string; out: string; categories: string }> {
  const dir = await mkdtemp(path.join(tmpdir(), "ingest-"));
  const w = (name: string, body: string) => writeFile(path.join(dir, name), body);
  await w("companies.csv", "company_id,group_id,country,currency,erp,created_at\nA,G,ES,EUR,,\nB,G,,USD,,\n");
  await w("banking_products.csv", "product_id,company_id,label,type,bank_name,service,currency,created_at\npa,A,,checking,,,EUR,\npb,B,,checking,,,USD,\npu,A,,checking,,,USD,\n");
  await w("debt_products.csv", "product_id,company_id,label,type,bank_name,service,currency,created_at,granted,outstanding,liquidity\nla,A,LOAN_01,loan,Other (customer-defined),custom,EUR,,-1000,-500,\n");
  await w("debt_schedule_config.csv", "product_id,company_id,settlement_product_id,currency,amortization_type,interest_calc_method,amortising_frequency,granted_balance,outstanding_balance,total_periods,next_payment_date,last_payment_date,annual_interest_rate_or_spread,interest_type\nla,A,pa,EUR,constant quote,30/360,monthly,1200,600,12,,,0.06,fixed\n");
  await w("transactions.csv", [
    "transaction_id,company_id,product_id,date,value_date,amount,exchange_rate,status,accounting_status,category,description,counterparty_id",
    "t1,A,pa,2025-03-05 00:00:00,2025-03-05,100,1,booked,,collection,,c1",
    "t2,A,pu,2025-03-06 00:00:00,2025-03-06,116,1.16,booked,,-,,",
    "t3,B,pb,2025-03-07 00:00:00,2025-03-07,100,1,booked,,payment,,",
    "t4,A,pa,2025-03-08 00:00:00,2025-03-08,-5,1,pending,,fee,,",
    "t5,A,pa,2023-01-08 00:00:00,2023-01-08,-5,1,booked,,fee,,",
    "",
  ].join("\n"));
  await w("invoices.csv", [
    "operation_id,company_id,document_type,issuance_date,due_date,payment_date,amount,pending_amount,currency,accounting_currency,exchange_rate,status,concept,counterparty_id",
    "i1,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,2025-03-31 00:00:00,232,0,USD,EUR,1.16,paid,,c1",
    "i2,A,invoice,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,pending,,c2",
    "i3,A,note,2025-03-01 00:00:00,2025-03-31 00:00:00,,-50,50,EUR,EUR,1,paid,,c2",
    "",
  ].join("\n"));
  const categories = path.join(dir, "categories.csv");
  await writeFile(categories, "transaction_id,normalized_category,category_confidence\nt2,collection,0.97\nt3,collection,0.5\n");
  return { dataset: dir, out: path.join(dir, "out"), categories };
}

test("ingest partitions by group, converts to EUR and applies confident categories", async () => {
  const d = await dataset();
  const meta = await ingest(d.dataset, d.out, d.categories);
  assert.deepEqual(meta.companies.map((c) => c.id), ["A", "B"]);
  assert.equal(meta.schedule.A, 1200 / 12 + (600 * 0.06) / 12);
  const txs = await readPartition<Tx>(d.out, "G", "tx");
  const by = Object.fromEntries(txs.map((t) => [t.id, t]));
  assert.equal(txs.length, 3); // t4 pending y t5 fuera de ventana quedan fuera
  assert.equal(by.t1.amount, 100);
  assert.ok(Math.abs(by.t2.amount! - 100) < 1e-9); // 116 USD / 1.16 → 100 EUR
  assert.equal(by.t2.category, "collection"); // reclasificada con 0.97
  assert.equal(by.t3.category, "payment"); // 0.5 < 0.95: se conserva la original
  assert.ok(Math.abs(by.t3.amount! - 100 / 1.16) < 1e-6); // empresa USD → EUR con la tabla de facturas
  const inv = await readPartition<Invoice>(d.out, "G", "invoice");
  assert.equal(inv.length, 2); // note fuera
  assert.ok(Math.abs(inv.find((i) => i.id === "i1")!.amount - 200) < 1e-9);
  assert.equal(meta.diagnostics.unbooked_tx, 1);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/ingest.test.ts`
Expected: FAIL (firma de `ingest` distinta, `schedule` no existe).

- [ ] **Step 3: Implementación** (sustituye el fichero completo)

```ts
import { createReadStream } from "node:fs";
import { appendFile, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "csv-parse";
import { z } from "zod";
import { buildFxTable, toEur, type FxObservation, type FxTable } from "@/lib/features/scoring/fx";
import { PARAMS } from "@/lib/features/scoring/params";
import type { Company, Invoice, Product, Tx } from "@/lib/features/scoring/types";

const num = z.preprocess((v) => (v === "" || v === undefined ? null : Number(v)), z.number().finite().nullable());
const companySchema = z.object({ company_id: z.string().min(1), group_id: z.string().default(""), currency: z.string().default("EUR") });
const productSchema = z.object({ product_id: z.string().min(1), company_id: z.string().min(1), type: z.string(), currency: z.string(), service: z.string().default("") });
const scheduleSchema = z.object({
  product_id: z.string(), company_id: z.string().min(1), amortising_frequency: z.string(),
  granted_balance: num, outstanding_balance: num, total_periods: num, annual_interest_rate_or_spread: num,
});
const txSchema = z.object({
  transaction_id: z.string().min(1), company_id: z.string().min(1), product_id: z.string().min(1), date: z.string(),
  amount: z.coerce.number().finite(), exchange_rate: num, status: z.string(), accounting_status: z.string(), category: z.string(), counterparty_id: z.string(),
});
const invoiceSchema = z.object({
  operation_id: z.string().min(1), company_id: z.string().min(1), document_type: z.string(), issuance_date: z.string(), due_date: z.string(),
  payment_date: z.string(), amount: z.coerce.number().finite(), currency: z.string(), accounting_currency: z.string(), exchange_rate: num, status: z.string(), counterparty_id: z.string(),
});
const categorySchema = z.object({ transaction_id: z.string(), normalized_category: z.string(), category_confidence: z.coerce.number() });

export type Meta = {
  companies: Company[];
  products: Record<string, Product>;
  schedule: Record<string, number>;
  fx: FxTable;
  fingerprint: string;
  diagnostics: Record<string, number>;
};

export function partFile(dir: string, group: string, kind: "tx" | "invoice"): string {
  return path.join(dir, "parts", `${kind}-${encodeURIComponent(group)}.jsonl`);
}

export async function* csv(file: string, required: string[]): AsyncGenerator<Record<string, string>> {
  const parser = createReadStream(file).pipe(parse({ columns: true, bom: true, skip_empty_lines: true }));
  let checked = false;
  for await (const row of parser) {
    if (!checked) {
      const missing = required.filter((x) => !(x in row));
      if (missing.length) throw new Error(`${file}: missing ${missing.join(", ")}`);
      checked = true;
    }
    yield row as Record<string, string>;
  }
  if (!checked) throw new Error(`${file}: empty CSV`);
}

export async function fingerprint(dataset: string, categories: string | null): Promise<string> {
  const hash = createHash("sha256");
  const files = ["companies.csv", "banking_products.csv", "debt_products.csv", "debt_schedule_config.csv", "transactions.csv", "invoices.csv"].map((n) => path.join(dataset, n));
  if (categories) files.push(categories);
  for (const f of files) {
    const s = await stat(f);
    hash.update(`${path.basename(f)}:${s.size}:${s.mtimeMs};`);
  }
  return hash.digest("hex");
}

async function loadCategories(file: string | null): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!file) return out;
  for await (const row of csv(file, ["transaction_id", "normalized_category", "category_confidence"])) {
    const c = categorySchema.parse(row);
    if (c.category_confidence >= PARAMS.categoryConfidenceMin && c.normalized_category && c.normalized_category !== "unknown")
      out.set(c.transaction_id, c.normalized_category);
  }
  return out;
}

export async function ingest(dataset: string, dir: string, categoriesCsv: string | null = null): Promise<Meta> {
  await rm(path.join(dir, "parts"), { recursive: true, force: true });
  await mkdir(path.join(dir, "parts"), { recursive: true });
  const diagnostics: Record<string, number> = {};
  const count = (k: string) => (diagnostics[k] = (diagnostics[k] ?? 0) + 1);

  const companies: Company[] = [], groupOf = new Map<string, string>(), currencyOf = new Map<string, string>();
  for await (const row of csv(path.join(dataset, "companies.csv"), ["company_id", "group_id", "currency"])) {
    const c = companySchema.parse(row);
    if (groupOf.has(c.company_id)) throw new Error(`duplicate company ${c.company_id}`);
    const groupId = c.group_id || c.company_id;
    companies.push({ id: c.company_id, groupId, currency: c.currency || "EUR" });
    groupOf.set(c.company_id, groupId);
    currencyOf.set(c.company_id, c.currency || "EUR");
  }
  const products: Record<string, Product> = {};
  for (const name of ["banking_products.csv", "debt_products.csv"])
    for await (const row of csv(path.join(dataset, name), ["product_id", "company_id", "type", "currency"])) {
      const p = productSchema.parse(row);
      if (!groupOf.has(p.company_id)) throw new Error(`unknown company on product ${p.product_id}`);
      products[p.product_id] = { company: p.company_id, type: p.type, currency: p.currency, service: p.service };
    }
  const schedule: Record<string, number> = {};
  for await (const row of csv(path.join(dataset, "debt_schedule_config.csv"), ["product_id", "company_id", "amortising_frequency"])) {
    const s = scheduleSchema.parse(row);
    if (s.amortising_frequency !== "monthly" || !s.granted_balance || !s.total_periods) continue;
    const cuota = s.granted_balance / s.total_periods + ((s.outstanding_balance ?? 0) * (s.annual_interest_rate_or_spread ?? 0)) / 12;
    schedule[s.company_id] = (schedule[s.company_id] ?? 0) + cuota;
  }

  // pasada 1: tabla de tasas desde facturas
  const fxRows: FxObservation[] = [];
  for await (const row of csv(path.join(dataset, "invoices.csv"), ["currency", "accounting_currency", "exchange_rate", "issuance_date"])) {
    const rate = Number(row.exchange_rate);
    if (rate > 0 && row.currency !== row.accounting_currency)
      fxRows.push({ currency: row.currency, accounting: row.accounting_currency, rate, month: row.issuance_date.slice(0, 7) });
  }
  const fx = buildFxTable(fxRows);
  const categories = await loadCategories(categoriesCsv);

  const buffers = new Map<string, string[]>();
  let size = 0;
  async function flush() {
    await Promise.all([...buffers].map(async ([file, lines]) => lines.length && appendFile(file, lines.join(""))));
    buffers.clear();
    size = 0;
  }
  async function emit(file: string, item: Tx | Invoice) {
    const list = buffers.get(file) ?? [];
    list.push(JSON.stringify(item) + "\n");
    buffers.set(file, list);
    if (++size >= 100000) await flush();
  }

  for await (const row of csv(path.join(dataset, "transactions.csv"), ["transaction_id", "company_id", "product_id", "date", "amount", "exchange_rate", "status", "accounting_status", "category", "counterparty_id"])) {
    const parsed = txSchema.safeParse(row);
    if (!parsed.success) {
      count("invalid_tx");
      continue;
    }
    const r = parsed.data;
    const group = groupOf.get(r.company_id);
    if (!group) throw new Error(`unknown company on transaction ${r.transaction_id}`);
    if (r.status !== "booked" && !(r.status === "" && /RECONCIL/i.test(r.accounting_status))) {
      count("unbooked_tx");
      continue;
    }
    const month = r.date.slice(0, 7);
    if (month < PARAMS.mesInicio || month > PARAMS.mesFin) {
      count("outside_window_tx");
      continue;
    }
    const product = products[r.product_id];
    let amount: number | null = null;
    if (product) amount = toEur(fx, r.amount, r.exchange_rate, product.currency, currencyOf.get(r.company_id)!, month);
    else count("unknown_product_tx");
    if (product && amount === null) count("unconvertible_tx");
    await emit(partFile(dir, group, "tx"), {
      id: r.transaction_id, company: r.company_id, product: r.product_id, date: r.date.slice(0, 10), month, amount,
      category: categories.get(r.transaction_id) ?? r.category, counterparty: r.counterparty_id,
    });
  }
  for await (const row of csv(path.join(dataset, "invoices.csv"), ["operation_id", "company_id", "document_type", "issuance_date", "due_date", "payment_date", "amount", "currency", "accounting_currency", "exchange_rate", "status", "counterparty_id"])) {
    const parsed = invoiceSchema.safeParse(row);
    if (!parsed.success) {
      count("invalid_invoice");
      continue;
    }
    const r = parsed.data;
    const group = groupOf.get(r.company_id);
    if (!group) throw new Error(`unknown company on invoice ${r.operation_id}`);
    if (r.document_type !== "invoice" || r.status === "cancel") {
      count("excluded_document");
      continue;
    }
    if (!r.issuance_date || !r.due_date || r.issuance_date.slice(0, 7) > PARAMS.mesFin) {
      count("invalid_invoice_dates");
      continue;
    }
    const month = r.issuance_date.slice(0, 7);
    const amount = toEur(fx, r.amount, r.currency === r.accounting_currency ? 1 : r.exchange_rate, r.currency, r.accounting_currency, month);
    if (amount === null) {
      count("unconvertible_invoice");
      continue;
    }
    await emit(partFile(dir, group, "invoice"), {
      id: r.operation_id, company: r.company_id, issued: r.issuance_date.slice(0, 10), due: r.due_date.slice(0, 10),
      paid: r.payment_date.slice(0, 10), amount, status: r.status, counterparty: r.counterparty_id,
    });
  }
  await flush();
  const meta: Meta = { companies, products, schedule, fx, fingerprint: await fingerprint(dataset, categoriesCsv), diagnostics };
  await writeFile(path.join(dir, "ingest.json"), JSON.stringify(meta));
  return meta;
}

export async function readPartition<T>(dir: string, group: string, kind: "tx" | "invoice"): Promise<T[]> {
  const contents = await readFile(partFile(dir, group, kind), "utf8").catch((e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") return "";
    throw e;
  });
  return contents.trim() ? contents.trimEnd().split("\n").map((l) => JSON.parse(l) as T) : [];
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/ingest.test.ts`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/ingest.ts lib/features/scoring/ingest.test.ts
git commit -m "feat(scoring): ingest by group with EUR conversion and #12 categories"
```

---

## Tarea 15: Módulo de decisión legacy (mover, no reescribir)

**Files:**
- Create: `lib/features/decision/types.ts`
- Create: `lib/features/decision/legacy.ts`
- Create: `lib/features/decision/contracts.ts`
- Test: `lib/features/decision/legacy.test.ts`

Este módulo conserva el comportamiento actual de banda/límite/acción de Eric hasta que se implemente `decision-engine.md` (plan siguiente). Lee `ScoreRow`, no calcula nada del score.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { decideLegacy } from "@/lib/features/decision/legacy";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function row(month: string, p: Partial<ScoreRow>): ScoreRow {
  return {
    company: "c", month, groupId: "g", versionParametros: "v", score: 80, scoreSolo: 80, avalGrupo: 0, confianza: 0.9,
    subscores: { A: 80, B: 80, C: 80 }, confs: { A: 1, B: 1, C: 1 }, estado: "sana", variables: [], deltaContrib: [],
    direccion: "estable", naturaleza: "sin_cambio", tendScore3m: null, tend3m: { A: null, B: null, C: null },
    rachaB2: 0, rachaDeficit: 0, C3dias: null, C4: null,
    cobrosOpMedia3m: 100_000, cobrosOpMedia6m: 100_000, pagosOpMedia6m: 60_000, servicioDeudaMedia6m: 5_000,
    amortCreditoMedia6m: 0, obligacionesRecMedia6m: 0, capacidadCuotaAdv: 0,
    D1: 1, D2: null, D3: null, D4: null, D5: 0, confD: 0, tienePrestamoIntragrupo: false,
    cobrosOpGrupoMedia6m: 0, pagosOpGrupoMedia6m: 0, servicioDeudaGrupoMedia6m: 0, scoreGrupo: null,
    deficitMes: false, margenMes: 0.15,
    senales: { deterioro: false, estructural: false, mejora: false, deficit: false, impago: false, vencidoAlto: false, contagio: false, datosInsuficientes: false },
    alertas: [],
    cobertura: { mesesObs6m: 6, mesesObs12m: 6, pctClasificado6m: 1, nFacturasCli6m: 0, nFacturasProv6m: 0, tieneLineaCredito: false, tieneCuotas: true, C4Estimado: true, nHermanasConDatos: 0 },
    ...p,
  };
}

test("legacy decision reproduces band A limit and opens on first month", () => {
  const rows = [row(CALENDAR[0], {}), row(CALENDAR[1], {})];
  const d = decideLegacy(rows);
  assert.equal(d.length, 2);
  for (const x of d) decisionRowSchema.parse(x);
  assert.equal(d[0].banda, "A");
  assert.equal(d[0].accion, "abrir");
  const adverse = Math.max(0, (0.8 * 100_000 - 1.1 * 60_000) / 1.3 - 5_000);
  const expected = Math.round((Math.min(adverse * 12, 0.8 * 300_000) * 1 * 1) / 1000) * 1000;
  assert.equal(d[0].limiteRecomendado, expected);
  assert.equal(d[0].limiteVigente, expected);
  assert.equal(d[1].accion, "mantener");
  assert.equal(d[0].precio, 0.05);
});

test("hard close on band D, three deficits or overdue > 40 %", () => {
  assert.equal(decideLegacy([row(CALENDAR[0], { score: 40 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { rachaDeficit: 3 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { C4: 0.5 })])[0].accion, "cerrar");
  assert.equal(decideLegacy([row(CALENDAR[0], { confianza: 0.2 })])[0].accion, "mantener");
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/decision/legacy.test.ts`
Expected: FAIL, módulo no encontrado.

- [ ] **Step 3: Implementar `types.ts`, `contracts.ts`, `legacy.ts`**

`lib/features/decision/types.ts`:

```ts
export type Banda = "A" | "B" | "C" | "D";
export type Accion = "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
export type DecisionRow = {
  company: string;
  month: string;
  motor: "legacy";
  banda: Banda;
  precio: number | null;
  capacidadBase: number;
  capacidadAdv: number;
  limiteCap: number;
  limiteOp: number;
  limiteRecomendado: number;
  limiteVigente: number;
  accion: Accion;
  motivo: string;
};
```

`lib/features/decision/contracts.ts`:

```ts
import { z } from "zod";

const finite = z.number().finite();
export const decisionRowSchema = z.object({
  company: z.string().min(1),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  motor: z.literal("legacy"),
  banda: z.enum(["A", "B", "C", "D"]),
  precio: finite.nullable(),
  capacidadBase: finite.min(0),
  capacidadAdv: finite.min(0),
  limiteCap: finite.min(0),
  limiteOp: finite.min(0),
  limiteRecomendado: finite.min(0),
  limiteVigente: finite.min(0),
  accion: z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]),
  motivo: z.string(),
});
export type DecisionRowDTO = z.infer<typeof decisionRowSchema>;
```

`lib/features/decision/legacy.ts` (lógica de `scoreCompany` v0.2, sin cambios de comportamiento):

```ts
import type { Accion, Banda, DecisionRow } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const LEGACY = {
  coverageRatio: 1.3, stressReceipts: 0.8, stressPayments: 1.1, advanceRate: 0.8,
  bandThresholds: [75, 60, 45], bandFactors: { A: 1, B: 0.7, C: 0.4, D: 0 } as Record<Banda, number>,
  price: { A: 0.05, B: 0.07, C: 0.1, D: null } as Record<Banda, number | null>,
  confidenceTarget: 0.6, lowConfidence: 0.3, openingConfidence: 0.5, monthlyChangeCap: 0.25,
};

function band(score: number): Banda {
  return score >= LEGACY.bandThresholds[0] ? "A" : score >= LEGACY.bandThresholds[1] ? "B" : score >= LEGACY.bandThresholds[2] ? "C" : "D";
}
function lower(b: Banda): Banda {
  return b === "A" ? "B" : b === "B" ? "C" : "D";
}

/** rows: filas de UNA empresa en orden cronológico. */
export function decideLegacy(rows: ScoreRow[]): DecisionRow[] {
  const out: DecisionRow[] = [];
  for (let t = 0; t < rows.length; t++) {
    const r = rows[t], prev = out[t - 1], prev2 = out[t - 2];
    let b = band(r.score);
    if (r.direccion === "deterioro" && r.naturaleza === "estructural") b = lower(b);
    const dues = r.servicioDeudaMedia6m + r.amortCreditoMedia6m;
    const capacidadBase = Math.max(0, (r.cobrosOpMedia6m - r.pagosOpMedia6m) / LEGACY.coverageRatio - dues);
    const capacidadAdv = Math.max(0, (LEGACY.stressReceipts * r.cobrosOpMedia6m - LEGACY.stressPayments * r.pagosOpMedia6m) / LEGACY.coverageRatio - dues);
    const limiteCap = capacidadAdv * 12;
    const limiteOp = LEGACY.advanceRate * r.cobrosOpMedia3m * 3;
    const limiteRecomendado = Math.round((Math.min(limiteCap, limiteOp) * LEGACY.bandFactors[b] * Math.min(1, r.confianza / LEGACY.confidenceTarget)) / 1000) * 1000;
    const previousLimit = prev?.limiteVigente ?? 0;
    const hardClose = b === "D" || r.rachaDeficit >= 3 || (r.C4 !== null && r.C4 > 0.4);
    const declining2 = prev !== undefined && limiteRecomendado < 0.85 * previousLimit && prev.limiteRecomendado < 0.85 * (prev2?.limiteVigente ?? 0);
    const accion: Accion = hardClose
      ? "cerrar"
      : r.confianza < LEGACY.lowConfidence
        ? "mantener"
        : previousLimit === 0 && limiteRecomendado > 0 && r.confianza >= LEGACY.openingConfidence
          ? "abrir"
          : previousLimit > 0 && (declining2 || (r.direccion === "deterioro" && r.naturaleza === "estructural"))
            ? "reducir"
            : previousLimit > 0 && limiteRecomendado > 1.15 * previousLimit && r.direccion !== "deterioro"
              ? "ampliar"
              : "mantener";
    const limiteVigente =
      accion === "cerrar" ? 0
        : accion === "abrir" ? limiteRecomendado
          : accion === "ampliar" ? Math.min(limiteRecomendado, previousLimit * (1 + LEGACY.monthlyChangeCap))
            : accion === "reducir" ? Math.max(limiteRecomendado, previousLimit * (1 - LEGACY.monthlyChangeCap))
              : previousLimit;
    const top = [...r.deltaContrib].sort((a, c) => Math.abs(c.delta) - Math.abs(a.delta)).slice(0, 2);
    out.push({
      company: r.company, month: r.month, motor: "legacy", banda: b, precio: LEGACY.price[b],
      capacidadBase, capacidadAdv, limiteCap, limiteOp, limiteRecomendado, limiteVigente, accion,
      motivo: `${accion}: ${top.map((x) => `${x.id} ${x.delta >= 0 ? "+" : ""}${x.delta.toFixed(1)}`).join(", ")}`,
    });
  }
  return out;
}
```

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/decision/legacy.test.ts`
Expected: `# pass 2`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/decision
git commit -m "feat(decision): move legacy limit/band/action logic out of scoring"
```

---

## Tarea 16: Backtest sobre el nuevo contrato

**Files:**
- Modify: `lib/features/scoring/backtest.ts`
- Test: `lib/features/scoring/backtest.test.ts`

Cambios: `Result` → `ScoreRow`; `monthlyDeficit` → `deficitMes`; `monthlyMargin` → `margenMes`; alertas por `tipo` y `desdeMes`; el lead time se mide desde `desdeMes` de la primera alerta emitida antes del evento (spec §13).

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { backtest } from "@/lib/features/scoring/backtest";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

function series(deficit: boolean[], alertAt: Record<number, string>): ScoreRow[] {
  return deficit.map((d, i) => ({
    company: "c", month: CALENDAR[i], score: 60, deficitMes: d, margenMes: d ? -0.1 : 0.1,
    alertas: alertAt[i] ? [{ tipo: "deterioro", desdeMes: alertAt[i] }] : [],
  })) as unknown as ScoreRow[];
}

test("deterioration event detected and lead time measured from desdeMes", () => {
  const deficit = [false, false, false, false, false, false, false, false, true, true, true, false, false, false, false, false, false, false];
  const rows = series(deficit, { 6: CALENDAR[5], 7: CALENDAR[5] });
  const r = backtest(rows);
  assert.equal(r.deterioro.events, 1);
  assert.equal(r.deterioro.matched, 1);
  assert.equal(r.deterioro.leadMedian, 3); // evento en índice 8, desdeMes índice 5
  assert.equal(r.deterioro.falseAlarmRate, 0);
});
```

- [ ] **Step 2: Ejecutar para ver el fallo**

Run: `node --import tsx --test lib/features/scoring/backtest.test.ts`
Expected: FAIL (typecheck de `Result` / campos inexistentes).

- [ ] **Step 3: Implementación** — en `backtest.ts`:

1. Cambiar el import por `import type { ScoreRow } from "@/lib/features/scoring/types"; import { median, monthIndex, percentile } from "@/lib/features/scoring/windows";` y sustituir todas las apariciones de `Result` por `ScoreRow`.
2. En `eventAt`, sustituir `monthlyDeficit` por `deficitMes`.
3. En la construcción de `pairs`, sustituir `monthlyMargin` por `margenMes`.
4. Sustituir el bloque de candidatos y lead time por:

```ts
      const candidates = list
        .slice(Math.max(0, e.index - 6), e.index)
        .flatMap((r) => r.alertas.map((a) => ({ ...a, mes: r.month })))
        .filter((a) => a.tipo === kind && a.mes < e.month);
      if (candidates.length) {
        matched++;
        const first = candidates.sort((a, b) => a.desdeMes.localeCompare(b.desdeMes))[0];
        leads.push(e.index - monthIndex(first.desdeMes));
      }
```

5. En el bucle de falsas alarmas, `emitted` pasa a ser `list[i].alertas.some((a) => a.tipo === kind && !list[i - 1]?.alertas.some((p) => p.tipo === kind))` (una alerta cuenta como emitida el primer mes en que aparece).

- [ ] **Step 4: Ejecutar para ver que pasa**

Run: `node --import tsx --test lib/features/scoring/backtest.test.ts`
Expected: `# pass 1`.

- [ ] **Step 5: Commit**

```bash
git add lib/features/scoring/backtest.ts lib/features/scoring/backtest.test.ts
git commit -m "refactor(scoring): backtest reads the new score contract"
```

---

## Tarea 17: Prisma, script y API

**Files:**
- Modify: `prisma/schema/scoring.prisma`
- Rewrite: `scripts/scoring.ts`
- Modify: `lib/features/scoring/api.ts`
- Modify: `scripts/setup-db.mjs:122-127`
- Modify: `package.json`
- Delete: `lib/features/scoring/model.ts`

- [ ] **Step 1: Esquema Prisma**

Sustituir `CompanyMonthScore` y añadir `CompanyMonthDecision`:

```prisma
model CompanyMonthScore {
  runId      String
  companyId  String
  month      String
  run        ScoreRun @relation(fields: [runId], references: [id])
  company    ScoreCompany @relation(fields: [companyId], references: [id])
  score      Float
  confidence Float
  estado     String
  direction  String
  data       Json
  decision   CompanyMonthDecision?

  @@id([runId, companyId, month])
  @@index([runId, month, estado, direction])
  @@index([runId, companyId, month])
  @@map("company_month_scores")
}

model CompanyMonthDecision {
  runId            String
  companyId        String
  month            String
  score            CompanyMonthScore @relation(fields: [runId, companyId, month], references: [runId, companyId, month])
  band             String
  action           String
  recommendedLimit Float
  appliedLimit     Float
  data             Json

  @@id([runId, companyId, month])
  @@index([runId, month, band, action])
  @@map("company_month_decisions")
}
```

Run: `pnpm exec prisma generate`
Expected: cliente regenerado sin errores. (`prisma db push` se ejecuta en `pnpm db:setup`; en local, `pnpm exec prisma db push --accept-data-loss` borra las columnas retiradas.)

- [ ] **Step 2: `package.json`** — añadir en `scripts`, después de `scoring:score`:

```json
    "scoring:decide": "node --import tsx scripts/scoring.ts decide",
```

- [ ] **Step 3: `scripts/setup-db.mjs`** — entre `run(pnpm, ["scoring:score"]);` y `run(pnpm, ["scoring:backtest"]);` añadir `run(pnpm, ["scoring:decide"]);`. En `requiredDatasetFiles` añadir `"debt_schedule_config.csv"`.

- [ ] **Step 4: Reescribir `scripts/scoring.ts`**

```ts
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { once } from "node:events";
import { createInterface } from "node:readline";

import { decisionRowSchema } from "../lib/features/decision/contracts";
import { decideLegacy } from "../lib/features/decision/legacy";
import type { DecisionRow } from "../lib/features/decision/types";
import { backtest } from "../lib/features/scoring/backtest";
import { scoreRowSchema } from "../lib/features/scoring/contracts";
import { prepareGroup, scoreGroup, variablesAt, type GroupInput } from "../lib/features/scoring/engine";
import { fitPercentiles, groupSplit, type Sample } from "../lib/features/scoring/fit";
import { fingerprint, ingest, readPartition, type Meta } from "../lib/features/scoring/ingest";
import { VARIABLES } from "../lib/features/scoring/params";
import type { Invoice, Parameters, Product, ScoreRow, Tx } from "../lib/features/scoring/types";
import { CALENDAR } from "../lib/features/scoring/windows";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataset = path.resolve(process.env.SCORING_DATASET ?? path.join(root, "dataset"));
const dir = path.resolve(process.env.SCORING_OUT ?? path.join(root, "tmp", "scoring-v1"));
const categoriesCsv = (() => {
  const p = path.resolve(process.env.SCORING_CATEGORIES ?? path.join(root, "analysis", "transaction_categories.csv"));
  return existsSync(p) ? p : null;
})();
const command = process.argv[2];

function runDir(params: Parameters, fp: string): string {
  return path.join(dir, "runs", params.version, fp);
}
function parameterPath(): string {
  return path.resolve(process.env.SCORING_PARAMS ?? path.join(dir, "parameters.json"));
}
async function meta(): Promise<Meta> {
  const m = JSON.parse(await readFile(path.join(dir, "ingest.json"), "utf8")) as Meta;
  if (m.fingerprint !== (await fingerprint(dataset, categoriesCsv))) throw new Error("dataset changed; run fit again with SCORING_REINGEST=1");
  return m;
}
async function groupInput(groupId: string, m: Meta): Promise<GroupInput> {
  const txs = await readPartition<Tx>(dir, groupId, "tx");
  const invoices = new Map<string, Invoice[]>();
  for (const i of await readPartition<Invoice>(dir, groupId, "invoice")) (invoices.get(i.company) ?? invoices.set(i.company, []).get(i.company)!).push(i);
  return {
    groupId,
    companies: m.companies.filter((c) => c.groupId === groupId),
    txs, invoices,
    schedule: new Map(Object.entries(m.schedule)),
    products: new Map(Object.entries(m.products) as [string, Product][]),
  };
}
function groupsOf(m: Meta): string[] {
  return [...new Set(m.companies.map((c) => c.groupId))].sort();
}
async function* lines<T>(file: string): AsyncGenerator<T> {
  for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) if (line) yield JSON.parse(line) as T;
}
async function put(stream: ReturnType<typeof createWriteStream>, item: unknown): Promise<void> {
  if (!stream.write(JSON.stringify(item) + "\n")) await once(stream, "drain");
}
async function close(stream: ReturnType<typeof createWriteStream>): Promise<void> {
  stream.end();
  await once(stream, "finish");
}

async function doFit() {
  const m = process.env.SCORING_REINGEST === "1" ? await ingest(dataset, dir, categoriesCsv) : await meta().catch(() => ingest(dataset, dir, categoriesCsv));
  const split = groupSplit(groupsOf(m));
  const train = new Set(split.train);
  const samples: Sample[] = [];
  const cutoff = CALENDAR.indexOf("2026-02");
  for (const g of groupsOf(m)) {
    if (!train.has(g)) continue;
    const prepared = prepareGroup(await groupInput(g, m));
    for (const p of prepared.values())
      for (let t = 0; t <= cutoff; t++) {
        const { vars } = variablesAt(p, t);
        for (const id of VARIABLES) samples.push({ id, raw: vars[id].raw, conf: vars[id].conf });
      }
  }
  const params = fitPercentiles(samples, split.train, split.validation, m.fingerprint);
  await mkdir(path.join(dir, "runs", params.version), { recursive: true });
  await writeFile(path.join(dir, "parameters.json"), JSON.stringify(params));
  await writeFile(path.join(dir, "runs", params.version, "parameters.json"), JSON.stringify(params));
  console.log(JSON.stringify({ samples: samples.length, version: params.version, diagnostics: m.diagnostics }));
}

async function doScore() {
  const m = await meta().catch(() => ingest(dataset, dir, categoriesCsv));
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  await mkdir(runDir(params, m.fingerprint), { recursive: true });
  const output = createWriteStream(path.join(runDir(params, m.fingerprint), "scores.jsonl"));
  let count = 0;
  for (const g of groupsOf(m))
    for (const row of scoreGroup(await groupInput(g, m), params)) {
      await put(output, scoreRowSchema.parse(row));
      count++;
    }
  await close(output);
  const manifest = {
    runId: createHash("sha256").update(`${m.fingerprint}:${params.version}`).digest("hex").slice(0, 24),
    fingerprint: m.fingerprint, parameterVersion: params.version, rows: count, diagnostics: m.diagnostics, completedAt: new Date().toISOString(),
  };
  await writeFile(path.join(runDir(params, m.fingerprint), "manifest.json"), JSON.stringify(manifest));
  console.log(JSON.stringify(manifest));
}

async function doDecide() {
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const byCompany = new Map<string, ScoreRow[]>();
  for await (const r of lines<ScoreRow>(path.join(runDir(params, m.fingerprint), "scores.jsonl")))
    (byCompany.get(r.company) ?? byCompany.set(r.company, []).get(r.company)!).push(r);
  const output = createWriteStream(path.join(runDir(params, m.fingerprint), "decisions.jsonl"));
  let count = 0;
  for (const rows of byCompany.values()) {
    rows.sort((a, b) => a.month.localeCompare(b.month));
    for (const d of decideLegacy(rows)) {
      await put(output, decisionRowSchema.parse(d));
      count++;
    }
  }
  await close(output);
  console.log(JSON.stringify({ decisions: count }));
}

async function doBacktest() {
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const validation = new Set(params.validationGroups);
  const rows: ScoreRow[] = [];
  for await (const r of lines<ScoreRow>(path.join(runDir(params, m.fingerprint), "scores.jsonl"))) if (validation.has(r.groupId)) rows.push(r);
  const metrics = { ...backtest(rows), validationCompanies: new Set(rows.map((r) => r.company)).size, validationRows: rows.length };
  await writeFile(path.join(runDir(params, m.fingerprint), "backtest.json"), JSON.stringify(metrics));
  console.log(JSON.stringify(metrics));
}

async function doImport() {
  const { prisma } = await import("../lib/core/db");
  const m = await meta();
  const params = JSON.parse(await readFile(parameterPath(), "utf8")) as Parameters;
  const run = runDir(params, m.fingerprint);
  const manifest = JSON.parse(await readFile(path.join(run, "manifest.json"), "utf8"));
  const metrics = JSON.parse(await readFile(path.join(run, "backtest.json"), "utf8").catch(() => "null"));
  await prisma.scoreParameters.upsert({ where: { version: params.version }, update: {}, create: { version: params.version, data: params as never } });
  await prisma.scoreRun.upsert({
    where: { id: manifest.runId }, update: { status: "importing", completedAt: null },
    create: { id: manifest.runId, parameterVersion: params.version, manifest, status: "importing" },
  });
  for (const c of m.companies)
    await prisma.scoreCompany.upsert({ where: { id: c.id }, update: { groupId: c.groupId, currency: c.currency }, create: { id: c.id, groupId: c.groupId, currency: c.currency } });
  await prisma.companyMonthDecision.deleteMany({ where: { runId: manifest.runId } });
  await prisma.companyMonthScore.deleteMany({ where: { runId: manifest.runId } });
  let batch: ScoreRow[] = [], imported = 0;
  async function flush() {
    if (!batch.length) return;
    await prisma.companyMonthScore.createMany({
      data: batch.map((r) => ({ runId: manifest.runId, companyId: r.company, month: r.month, score: r.score, confidence: r.confianza, estado: r.estado, direction: r.direccion, data: r as never })),
    });
    imported += batch.length;
    batch = [];
  }
  for await (const r of lines<ScoreRow>(path.join(run, "scores.jsonl"))) {
    batch.push(scoreRowSchema.parse(r));
    if (batch.length >= 500) await flush();
  }
  await flush();
  if (imported !== manifest.rows) throw new Error(`imported ${imported}, expected ${manifest.rows}`);
  let dbatch: DecisionRow[] = [];
  async function dflush() {
    if (!dbatch.length) return;
    await prisma.companyMonthDecision.createMany({
      data: dbatch.map((d) => ({ runId: manifest.runId, companyId: d.company, month: d.month, band: d.banda, action: d.accion, recommendedLimit: d.limiteRecomendado, appliedLimit: d.limiteVigente, data: d as never })),
    });
    dbatch = [];
  }
  for await (const d of lines<DecisionRow>(path.join(run, "decisions.jsonl"))) {
    dbatch.push(decisionRowSchema.parse(d));
    if (dbatch.length >= 500) await dflush();
  }
  await dflush();
  await prisma.scoreRun.update({ where: { id: manifest.runId }, data: { status: "complete", completedAt: new Date(), metrics } });
  await prisma.$disconnect();
  console.log(JSON.stringify({ imported, runId: manifest.runId }));
}

await mkdir(dir, { recursive: true });
if (command === "fit") await doFit();
else if (command === "score") await doScore();
else if (command === "decide") await doDecide();
else if (command === "backtest") await doBacktest();
else if (command === "import") await doImport();
else throw new Error("Usage: scoring.ts fit|score|decide|backtest|import");
```

- [ ] **Step 5: `api.ts`**: cambios concretos

1. Imports: sustituir `scoreResultSchema`/`ScoreResultDTO` por `scoreRowSchema`/`ScoreRowDTO` de `contracts.ts` y añadir `import { decisionRowSchema } from "@/lib/features/decision/contracts";`.
2. `listQuery`: `band`/`action` se mantienen; `direction` igual; añadir `estado: z.enum(["sana","vigilar","riesgo","sin_datos"]).optional()`.
3. Sustituir `listCompanies` y `companyHistory` por:

```ts
function merged(r: { data: unknown; decision: { data: unknown } | null }) {
  return { score: scoreRowSchema.parse(r.data), decision: r.decision ? decisionRowSchema.parse(r.decision.data) : null };
}
export async function listCompanies(request: Request): Promise<Response> {
  const parsed = listQuery.safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const { run, month = "2026-08", band, action, direction, estado, page, pageSize } = parsed.data;
  const selected = await completedRun(run);
  if (!selected) return Response.json({ error: "Run not found" }, { status: 404 });
  const where = {
    runId: selected.id, month, direction, estado,
    ...(band || action ? { decision: { is: { band, action } } } : {}),
  };
  const [total, rows] = await Promise.all([
    prisma.companyMonthScore.count({ where }),
    prisma.companyMonthScore.findMany({
      where, include: { decision: true },
      orderBy: [{ score: "desc" }, { companyId: "asc" }],
      skip: (page - 1) * pageSize, take: pageSize,
    }),
  ]);
  return Response.json({ runId: selected.id, month, total, page, pageSize, rows: rows.map(merged) });
}
export async function companyHistory(request: Request, companyId: string): Promise<Response> {
  const parsed = z.object({ run: z.string().optional() }).safeParse(queryObject(request));
  if (!parsed.success) return invalid(parsed.error);
  const run = await completedRun(parsed.data.run);
  if (!run) return Response.json({ error: "Run not found" }, { status: 404 });
  const rows = await prisma.companyMonthScore.findMany({ where: { runId: run.id, companyId }, include: { decision: true }, orderBy: { month: "asc" } });
  if (!rows.length) return Response.json({ error: "Company not found" }, { status: 404 });
  return Response.json({ runId: run.id, latest: merged(rows.at(-1)!), history: rows.map(merged) });
}
```
4. `exportScores`: `keys` pasa a ser `["company","month","score","scoreSolo","avalGrupo","confianza","estado","direccion","naturaleza","tendScore3m","rachaB2","rachaDeficit","capacidadCuotaAdv","D1","D2","D5","variables","deltaContrib","alertas","cobertura","versionParametros"]` sobre `ScoreRowDTO`, y se añaden al final las columnas `banda,accion,limiteRecomendado,limiteVigente,precio` leídas de `decision` (vacías si no hay).

- [ ] **Step 6: Borrar `model.ts` y arreglar imports restantes**

```bash
git rm lib/features/scoring/model.ts
pnpm run typecheck
```

Expected: sin errores. Si `typecheck` señala algún import de `model.ts`, sustitúyelo por `types.ts` / `windows.ts` / `flows.ts` según el símbolo.

- [ ] **Step 7: Ejecutar todo**

Run: `pnpm test && pnpm run lint && pnpm run typecheck`
Expected: `# pass 39` (2 params + 3 windows + 2 fx + 2 mirrors + 2 flows + 8 variables + 4 aggregate + 3 group + 4 evolution + 2 fit + 3 engine + 1 ingest + 2 decision + 1 backtest), lint y typecheck limpios.

- [ ] **Step 8: Commit**

```bash
git add prisma/schema/scoring.prisma scripts/scoring.ts scripts/setup-db.mjs package.json lib/features/scoring/api.ts
git commit -m "feat(scoring): wire new engine and legacy decision through script, prisma and api"
```

---

## Tarea 18: Ejecución de punta a punta y README

**Files:**
- Modify: `README.md:53-72`

- [ ] **Step 1: Ejecutar el pipeline completo sobre el dataset real**

```bash
SCORING_REINGEST=1 pnpm scoring:fit
pnpm scoring:score
pnpm scoring:decide
pnpm scoring:backtest
```

Expected: `fit` imprime `samples` > 300000 y `diagnostics` con `unbooked_tx` ≈ 6579+; `score` imprime `rows: 30864` (1.286 × 24); `decide` imprime `decisions: 30864`; `backtest` imprime `deterioro.events` > 0 y `leadMedian` numérico. Si `fit` tarda más de 10 minutos, revisar que `pairMirrors` no se ejecute más de una vez por grupo (se llama en `prepareGroup`).

- [ ] **Step 2: Comprobación de propiedades sobre la salida real** (script de un solo uso, no se commitea)

```bash
node --import tsx -e "
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
const file = process.argv[1];
let n = 0, bad = 0, aval = 0, sinDatos = 0;
for await (const line of createInterface({ input: createReadStream(file) })) {
  const r = JSON.parse(line); n++;
  if (Math.abs(r.variables.reduce((a, c) => a + c.aportacion, 0) - r.score) > 1e-6) bad++;
  if (Math.abs(r.avalGrupo) > 20) bad++;
  if (r.avalGrupo !== 0) aval++;
  if (r.estado === 'sin_datos') sinDatos++;
}
console.log({ n, bad, aval, sinDatos });
" tmp/scoring-v1/runs/*/*/scores.jsonl
```

Expected: `bad: 0`; `aval` > 0 (hay grupos); anota `sinDatos / n` en el PR: es el dato que decide si la decisión 2 basta.

- [ ] **Step 3: Importar a Postgres y probar la API**

```bash
pnpm db:setup:force
curl "http://localhost:3000/api/scoring/companies?month=2026-02&band=A&pageSize=2"
```

Expected: JSON con `rows[].score.estado` y `rows[].decision.banda === "A"`.

- [ ] **Step 4: README** — sustituir la sección "Motor de scoring v0.2" por:

```markdown
## Motor de scoring v1 y decisión

Con PostgreSQL activo, los CSV en `dataset/` y (opcional) el CSV de
categorías reclasificadas generado con
`.venv\Scripts\python.exe analysis\08_categories.py && .venv\Scripts\python.exe analysis\09_export_categories.py`:

```bash
pnpm scoring:fit        # ingest por grupo, € y percentiles congelados
pnpm scoring:score      # company_month_score (docs/engines/scoring-engine.md §10)
pnpm scoring:decide     # decisión legacy sobre las filas del score (docs/engines/decision-engine.md, pendiente)
pnpm scoring:backtest   # lead time, recall, falsas alarmas sobre validación
pnpm scoring:import     # Postgres
```

Normalmente basta con `pnpm db:setup`. Salida en `/api/scoring/companies`
(`rows[].score` y `rows[].decision`), `/api/scoring/companies/[companyId]`,
`/api/scoring/runs/[runId]` y `/api/scoring/export`. Lógica y decisiones en
`docs/product/SOURCE.md`, `docs/engines/scoring-engine.md` y `docs/engines/decision-engine.md`.
```

- [ ] **Step 5: Commit y PR**

```bash
git add README.md
git commit -m "docs: describe scoring v1 pipeline"
git push -u origin feat/realign-scoring
gh pr create --base main --title "feat(scoring): realign engine with SOURCE (blocks, group, EUR, mirrors)" --body "Implements docs/engines/scoring-engine.md v1.0. Decision logic moved unchanged to lib/features/decision/legacy.ts; decision-engine.md follows in a separate PR. Property checks on the real dataset: <pegar salida del paso 2>."
```

---

## Auto-revisión del plan

**Cobertura de la spec (scoring-engine.md):** §2 parámetros → Tarea 1 · §3.1 filtros → Tarea 14 · §3.2 divisas → Tarea 3 y 14 · §3.3 clasificación y espejos → Tareas 4, 5 · §3.4 facturas → Tareas 7, 8, 14 · §4 flujos → Tarea 5 · §5.1-5.3 → Tareas 6-8 · §5.4 → Tarea 10 · §6 → Tarea 9 · §7 → Tareas 10, 13 · §8-9 → Tarea 11 · §10 contrato → Tareas 2, 13 · §11 → Tarea 12 · §12 fixtures → repartidos por tarea (`sana`, `salto_un_mes`, `impago`, `grupo_aval`, `grupo_contagio`; `deterioro_estructural`, `bache` e `historial_corto` quedan cubiertos por los tests de evolución y engine, no como fixtures nombrados) · §13 backtest → Tarea 16 · §14 orden → Tarea 13.

**Huecos declarados:** `scoreGrupo` se emite `null` (contrato lo admite); sin fixture explícito para `deterioro_estructural`/`bache` de punta a punta; `analysis/09_export_categories.py` requiere el `.venv` de `analysis/`.

**Consistencia de nombres:** `computeVariables` / `VariableInput` (T6-8, 13) · `aggregate`/`estado`/`subnota`/`subnotaB2` (T9, 13) · `groupVariables`/`avalGrupo`/`GroupMember` (T10, 13) · `direccion`/`naturaleza`/`deltas`/`computeAlerts` (T11, 13) · `groupSplit`/`fitPercentiles`/`Sample` (T12, 17) · `prepareGroup`/`scoreGroup`/`variablesAt`/`GroupInput` (T13, 17) · `ingest(dataset, dir, categoriesCsv)`/`readPartition(dir, group, kind)`/`Meta.schedule` (T14, 17) · `decideLegacy`/`DecisionRow` (T15, 17) · `ScoreRow` campos (T2, 13, 15, 16, 17).
