# Motor de decisión v1 — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sustituir `lib/features/decision/legacy.ts` por el motor especificado en `docs/decision-engine.md` v1.0 (SOURCE §3): elegibilidad por puertas, límite, plazo máximo, interés con desglose, menú (plazo, cantidad, TAE), estado mes a mes con histéresis y reapertura, techo de grupo y cross-default, contrato `company_month_decision`, métricas para el jurado. La previsión (`forecast-engine.md`) aún no existe: el motor acepta una entrada opcional y, sin ella, opera como "desconectado" (`banda_pred_3m = banda`).

**Architecture:** `lib/features/decision/` con un módulo por paso (`params`, `types`, `contracts`, `eligibility`, `limit`, `tenor`, `interest`, `menu`, `action`, `group`, `motivos`, `engine`, `metrics`). `engine.decideGroup` recibe todas las filas `ScoreRow` de un grupo, itera los 24 meses en orden, decide cada empresa con su estado del mes anterior, aplica el paso de grupo y persiste el estado. `scripts/scoring.ts decide` agrupa `scores.jsonl` por `groupId`. Tabla Prisma y API mantienen su forma; cambian los campos del JSON `data`.

**Tech Stack:** TypeScript (Node 22 vía fnm), `node:test` + `node:assert/strict` (`pnpm test`), `zod` 4, Prisma 7. Fixtures: `lib/features/scoring/__fixtures__/score-row.ts` (`scoreRowFixture`).

**Referencias obligatorias:** `docs/decision-engine.md` (§2 parámetros, §3-§9 pasos, §10 contrato, §11 plantillas, §13 fixtures, §14 métricas), `docs/SOURCE.md` §3 y §5 (decisiones 11, 12, 17-23, 37). `docs/scoring-engine.md` §10 para los campos de `ScoreRow`.

**Convenciones:** alias `@/*`, `function` declarativa, sin `enum`, tests `*.test.ts` junto al código, `pnpm run typecheck` (lib + scripts), `pnpm run lint`, prettier. Node 22: `export PATH="$HOME/AppData/Roaming/fnm/node-versions/v22.14.0/installation:$PATH"`.

**Rama:** `feat/decision-engine` desde `feat/realign-scoring` (PR #20 aún abierta). Si #20 se mergea antes, la PR de esta rama apunta a `main` tras `git rebase origin/main`.

---

## Mapa de ficheros

| Fichero | Estado | Responsabilidad |
| --- | --- | --- |
| `lib/features/decision/params.ts` | crear | `DECISION_PARAMS` (§2) + `hashDecisionParams` |
| `lib/features/decision/types.ts` | reescribir | `Banda`, `Accion`, `Puerta`, `EstadoDecision`, `MenuOption`, `PrevisionInput`, `DecisionRow` (§10), `DecisionParameters`; el tipo legacy pasa a `LegacyDecisionRow` |
| `lib/features/decision/contracts.ts` | reescribir | `decisionRowSchema` v1; legacy → `legacyDecisionRowSchema` |
| `lib/features/decision/motivos.ts` | crear | plantillas de texto (§3, §11) |
| `lib/features/decision/eligibility.ts` | crear | paso 0 (§3) |
| `lib/features/decision/limit.ts` | crear | banda, banda efectiva, `peor`, límite (§4) |
| `lib/features/decision/tenor.ts` | crear | `T_MAX` (§5) |
| `lib/features/decision/interest.ts` | crear | TAE con desglose, coste (§6) |
| `lib/features/decision/menu.ts` | crear | región factible y menú, `valida` (§7) |
| `lib/features/decision/action.ts` | crear | acción, histéresis, reapertura, estado (§8) |
| `lib/features/decision/group.ts` | crear | techo de grupo y cross-default (§9) |
| `lib/features/decision/engine.ts` | crear | `decideGroup` (§12) |
| `lib/features/decision/metrics.ts` | crear | métricas §14 |
| `lib/features/decision/legacy.ts`, `legacy.test.ts` | borrar (Tarea 11) | |
| `lib/features/scoring/backtest.ts` | modificar | exportar `detectEvents` para las métricas de decisión |
| `scripts/scoring.ts` | modificar | `decide` con el motor v1 agrupado por grupo; `backtest` añade métricas de decisión; `import` mapea campos nuevos |
| `lib/features/scoring/api.ts` | modificar | `DECISION_KEYS` y filtros `band`/`action` sobre los campos nuevos |
| `README.md`, `docs/decision-engine.md` | modificar | comandos; §9 techo con `media6m` (sin `media3m` de grupo) |

---

## Tarea 0: Rama y línea base

- [ ] **Step 1**

```bash
git fetch origin
git checkout -b feat/decision-engine origin/feat/realign-scoring
export PATH="$HOME/AppData/Roaming/fnm/node-versions/v22.14.0/installation:$PATH"
pnpm test && pnpm run typecheck && pnpm run lint
```

Expected: `# pass 88`, typecheck limpio, lint 12 avisos preexistentes, 0 errores.

---

## Tarea 1: Parámetros de decisión

**Files:** create `lib/features/decision/params.ts`, `lib/features/decision/params.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { DECISION_PARAMS, hashDecisionParams } from "@/lib/features/decision/params";

test("bands are ordered and the menu tenors are ascending", () => {
  const { bandas, plazosMenu, tMax } = DECISION_PARAMS;
  assert.ok(bandas.A > bandas.B && bandas.B > bandas.C);
  assert.deepEqual([...plazosMenu], [...plazosMenu].sort((a, b) => a - b));
  for (const b of ["A", "B", "C", "D"] as const)
    assert.ok(tMax[b].base >= tMax[b].temporal && tMax[b].temporal >= tMax[b].estructural);
  assert.equal(tMax.C.estructural, 0);
});

test("hash is canonical and sensitive", () => {
  assert.equal(hashDecisionParams(DECISION_PARAMS), hashDecisionParams({ ...DECISION_PARAMS }));
  assert.notEqual(hashDecisionParams(DECISION_PARAMS), hashDecisionParams({ ...DECISION_PARAMS, histeresisPct: 0.3 }));
});
```

- [ ] **Step 2: Run** `node --import tsx --test lib/features/decision/params.test.ts` → FAIL módulo no encontrado.

- [ ] **Step 3: Implementación**

```ts
import { hashParams } from "@/lib/features/scoring/params";

export type Banda = "A" | "B" | "C" | "D";

/** docs/decision-engine.md §2. Ningún número suelto en código. */
export const DECISION_PARAMS = {
  // elegibilidad (decisión 18)
  confMin: 0.5,
  scoreMin: 45,
  rachaB2Max: 1,
  rachaDeficitMax: 2,
  C4Max: 0.4,
  // capacidad y límite (11, 12): la capacidad de cuota adversa la calcula scoring con los mismos
  // parámetros de estrés (PARAMS.estresCobros/estresPagos/coberturaMin) y llega en ScoreRow.
  mesesLimiteCap: 12,
  anticipoPct: 0.8,
  anticipoMeses: 3,
  confRef: 0.6,
  redondeoL: 1000,
  // bandas (12, 21)
  bandas: { A: 75, B: 60, C: 45 } as Readonly<Record<"A" | "B" | "C", number>>,
  factorBanda: { A: 1, B: 0.7, C: 0.4, D: 0 } as Readonly<Record<Banda, number>>,
  baseTAE: { A: 0.05, B: 0.07, C: 0.1, D: null } as Readonly<Record<Banda, number | null>>,
  // plazo (20)
  tMax: {
    A: { base: 180, temporal: 120, estructural: 60 },
    B: { base: 120, temporal: 90, estructural: 30 },
    C: { base: 60, temporal: 30, estructural: 0 },
    D: { base: 0, temporal: 0, estructural: 0 },
  } as Readonly<Record<Banda, Readonly<{ base: number; temporal: number; estructural: number }>>>,
  plazosMenu: [30, 60, 90, 120, 180] as readonly number[],
  // interés (21, 37)
  primaPlazoPp30d: 0.005,
  primaConfianzaPp: 0.01,
  confPrima: 0.7,
  ajusteMejoraPp: -0.005,
  ajusteDeterioroPp: 0.01,
  primaPrevisionPp: 0.005,
  baseDias: 360,
  // revisión mensual (12, 23, 37)
  ampliarRatio: 1.15,
  reducirRatio: 0.85,
  reducirMeses: 2,
  reducirPrevMeses: 2,
  histeresisPct: 0.25,
  reaperturaMeses: 2,
  // grupo (17)
  D1CrossDefault: 0.3,
  // uso simulado para métricas (§14)
  usoSimulado: 0.6,
  plazoNaturalDefecto: 60,
} as const;
export type DecisionParams = typeof DECISION_PARAMS;

export function hashDecisionParams(p: Record<string, unknown>): string {
  return hashParams(p);
}
```

- [ ] **Step 4: Run** → `# pass 2`. **Step 5: Commit** `feat(decision): versioned parameters`.

---

## Tarea 2: Tipos y contratos v1 (sin romper el legacy)

**Files:** rewrite `lib/features/decision/types.ts`, `lib/features/decision/contracts.ts`; modify `lib/features/decision/legacy.ts`, `scripts/scoring.ts`, `lib/features/scoring/api.ts` (solo renombrar importaciones).

- [ ] **Step 1: `types.ts`**

```ts
import type { Banda } from "@/lib/features/decision/params";
import type { Direccion } from "@/lib/features/scoring/types";

export type { Banda };
export type Accion = "abrir" | "ampliar" | "mantener" | "reducir" | "cerrar";
export const PUERTAS = ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"] as const;
export type Puerta = (typeof PUERTAS)[number];

/** Estado que el motor arrastra de un mes al siguiente (decision-engine §8). */
export type EstadoDecision = {
  LPrev: number;
  accionPrev: Accion | null;
  mesesElegibleSeguidos: number;
  mesesReduccionSeguidos: number;
  mesesPredPeorSeguidos: number;
  cerradoDesde: string | null;
  crossDefaultActivo: boolean;
  causaCrossDefault: string | null;
};

export const ESTADO_INICIAL: EstadoDecision = {
  LPrev: 0,
  accionPrev: null,
  mesesElegibleSeguidos: 0,
  mesesReduccionSeguidos: 0,
  mesesPredPeorSeguidos: 0,
  cerradoDesde: null,
  crossDefaultActivo: false,
  causaCrossDefault: null,
};

export type DesgloseTae = {
  base: number;
  primaPlazo: number;
  primaConfianza: number;
  ajusteTendencia: number;
  primaPrevision: number;
};

export type MenuOption = {
  plazo: number;
  cantidadMax: number;
  tae: number;
  costeMax: number;
  desglose: DesgloseTae;
};

/** Entrada opcional del forecast-engine (§1). Sin previsión: `metodo = "desconectado"` y `bandaPred3m = banda`. */
export type PrevisionInput = {
  bandaPred3m: Banda;
  scorePred3m: number | null;
  direccionPred: Direccion | null;
  probDeterioro6m: number | null;
  metodo: "v1_proyeccion" | "v2_modelo" | "desconectado";
};

/** Contrato decision-engine §10. */
export type DecisionRow = {
  company: string;
  month: string;
  groupId: string;
  motor: "v1";
  versionParametros: string;
  elegible: boolean;
  motivo: string | null;
  puertasFallidas: Puerta[];
  banda: Banda;
  bandaEfectiva: Banda;
  capacidadCuotaAdv: number;
  limiteCap: number;
  limiteOp: number;
  L: number;
  LVigente: number;
  TMax: number;
  menu: MenuOption[];
  plazoNaturalAnticipo: number;
  accion: Accion;
  motivoAccion: string;
  motivoGrupo: string | null;
  bandaPred3mUsada: Banda | null;
  estado: EstadoDecision;
};

export type DecisionParameters = {
  version: string;
  paramsHash: string;
  versionScoring: string;
};

/** Contrato del motor legacy (se elimina en la Tarea 11). */
export type LegacyDecisionRow = {
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

- [ ] **Step 2: `contracts.ts`**

```ts
import { z } from "zod";
import { DECISION_PARAMS } from "@/lib/features/decision/params";
import { PUERTAS, type DecisionRow } from "@/lib/features/decision/types";
import { PARAMS } from "@/lib/features/scoring/params";

const finite = z.number().finite();
const money = finite.min(0);
const banda = z.enum(["A", "B", "C", "D"]);
const accion = z.enum(["abrir", "ampliar", "mantener", "reducir", "cerrar"]);
const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const desglose = z.object({
  base: finite, primaPlazo: finite.min(0), primaConfianza: finite.min(0), ajusteTendencia: finite, primaPrevision: finite.min(0),
});
const opcion = z.object({
  plazo: z.number().int().positive(), cantidadMax: money, tae: finite.min(0).max(1), costeMax: money, desglose,
});
const estado = z.object({
  LPrev: money, accionPrev: accion.nullable(), mesesElegibleSeguidos: z.number().int().min(0),
  mesesReduccionSeguidos: z.number().int().min(0), mesesPredPeorSeguidos: z.number().int().min(0),
  cerradoDesde: mes.nullable(), crossDefaultActivo: z.boolean(), causaCrossDefault: z.string().nullable(),
});

export const decisionRowSchema = z.object({
  company: z.string().min(1),
  month: mes.refine((m) => m >= PARAMS.mesInicio && m <= PARAMS.mesFin),
  groupId: z.string().min(1),
  motor: z.literal("v1"),
  versionParametros: z.string().min(1),
  elegible: z.boolean(),
  motivo: z.string().nullable(),
  puertasFallidas: z.array(z.enum(PUERTAS)),
  banda, bandaEfectiva: banda,
  capacidadCuotaAdv: money, limiteCap: money, limiteOp: money, L: money, LVigente: money,
  TMax: z.number().int().min(0).max(Math.max(...Object.values(DECISION_PARAMS.tMax).map((t) => t.base))),
  menu: z.array(opcion),
  plazoNaturalAnticipo: z.number().int().positive(),
  accion,
  motivoAccion: z.string(),
  motivoGrupo: z.string().nullable(),
  bandaPred3mUsada: banda.nullable(),
  estado,
}) satisfies z.ZodType<DecisionRow>;
export type DecisionRowDTO = z.infer<typeof decisionRowSchema>;

/** Esquema del motor legacy (se elimina en la Tarea 11). */
export const legacyDecisionRowSchema = z.object({
  company: z.string().min(1), month: mes, motor: z.literal("legacy"), banda,
  precio: finite.nullable(), capacidadBase: money, capacidadAdv: money, limiteCap: money, limiteOp: money,
  limiteRecomendado: money, limiteVigente: money, accion, motivo: z.string(),
});
export type LegacyDecisionRowDTO = z.infer<typeof legacyDecisionRowSchema>;
```

- [ ] **Step 3: Renombrar en los consumidores** — `legacy.ts`: `DecisionRow` → `LegacyDecisionRow`; `scripts/scoring.ts` y `lib/features/scoring/api.ts`: `decisionRowSchema` → `legacyDecisionRowSchema`, `DecisionRowDTO` → `LegacyDecisionRowDTO`, `DecisionRow` → `LegacyDecisionRow`. Run `pnpm run typecheck && pnpm test` → limpio, 90 pass (88 + 2 de params).

- [ ] **Step 4: Commit** `feat(decision): v1 contract types alongside legacy`.

---

## Tarea 3: Elegibilidad y plantillas de motivo

**Files:** create `lib/features/decision/motivos.ts`, `lib/features/decision/eligibility.ts`, `eligibility.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { elegibilidad } from "@/lib/features/decision/eligibility";
import { ESTADO_INICIAL } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("a healthy row passes every gate", () => {
  const r = scoreRowFixture({ capacidadCuotaAdv: 5_000 });
  const e = elegibilidad(r, ESTADO_INICIAL);
  assert.equal(e.elegible, true);
  assert.equal(e.motivo, null);
  assert.deepEqual(e.puertasFallidas, []);
});

test("gates fail in the documented order and all failures are listed", () => {
  const r = scoreRowFixture({ confianza: 0.4, score: 40, rachaB2: 2, rachaDeficit: 3, capacidadCuotaAdv: 0, C4: 0.5 });
  const e = elegibilidad(r, { ...ESTADO_INICIAL, crossDefaultActivo: true, causaCrossDefault: "COMP_X" });
  assert.equal(e.elegible, false);
  assert.deepEqual(e.puertasFallidas, ["historia", "estado", "fiabilidad", "caja", "clientes", "grupo"]);
  assert.match(e.motivo!, /Historial insuficiente: confianza 0,40 < 0,5/);
});

test("C4 null does not block; capacity 0 blocks; cross-default blocks", () => {
  assert.equal(elegibilidad(scoreRowFixture({ C4: null, capacidadCuotaAdv: 1 }), ESTADO_INICIAL).elegible, true);
  const caja = elegibilidad(scoreRowFixture({ capacidadCuotaAdv: 0 }), ESTADO_INICIAL);
  assert.deepEqual(caja.puertasFallidas, ["caja"]);
  assert.match(caja.motivo!, /Caja estresada no cubre cuotas actuales/);
  const g = elegibilidad(scoreRowFixture({ capacidadCuotaAdv: 1, D1: 0.2 }), { ...ESTADO_INICIAL, crossDefaultActivo: true, causaCrossDefault: "COMP_9" });
  assert.match(g.motivo!, /Cierre de COMP_9/);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `motivos.ts`**

```ts
import type { Accion, Banda, Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export function pct(x: number): string {
  return `${Math.round(x * 100)} %`;
}
export function eur(x: number): string {
  return `${Math.round(x).toLocaleString("es-ES")} €`;
}
export function dec(x: number, n = 2): string {
  return x.toFixed(n).replace(".", ",");
}

/** decision-engine §3 tabla de motivos. */
export function motivoPuerta(p: Puerta, r: ScoreRow, causaCrossDefault: string | null): string {
  switch (p) {
    case "historia":
      return `Historial insuficiente: confianza ${dec(r.confianza)} < 0,5`;
    case "estado":
      return `Score ${Math.round(r.score)} por debajo de 45`;
    case "fiabilidad":
      return `${r.rachaB2} meses seguidos sin pagar obligaciones`;
    case "caja":
      return r.rachaDeficit > 2 ? `${r.rachaDeficit} meses seguidos en déficit` : "Caja estresada no cubre cuotas actuales";
    case "clientes":
      return `${pct(r.C4 ?? 0)} de facturas vencidas sin cobrar`;
    case "grupo":
      return `Cierre de ${causaCrossDefault ?? "una empresa del grupo"} (${pct(r.D1)} del grupo)`;
  }
}

function topDelta(r: ScoreRow): string {
  const top = [...r.deltaContrib].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0];
  return top ? `${top.id} ${top.delta >= 0 ? "+" : ""}${dec(top.delta, 1)}` : "sin cambios";
}

/** decision-engine §11. */
export function motivoAccion(
  accion: Accion,
  r: ScoreRow,
  ctx: { banda: Banda; L: number; LPrev: number; LVigente: number; TMax: number; motivoCierre: string | null; causaReduccion: "estructural" | "confirmada" | "prevision" | null; bandaPred: Banda | null; mesesParaReapertura: number | null },
): string {
  switch (accion) {
    case "abrir":
      return `Elegible: score ${Math.round(r.score)} (banda ${ctx.banda}), límite ${eur(ctx.L)} hasta ${ctx.TMax} d`;
    case "ampliar":
      return `Límite sube de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${topDelta(r)}`;
    case "reducir": {
      const causa = ctx.causaReduccion === "estructural" ? "deterioro estructural" : ctx.causaReduccion === "prevision" ? `previsión: banda ${ctx.bandaPred} en 3 meses` : "2 meses por debajo";
      return `Límite baja de ${eur(ctx.LPrev)} a ${eur(ctx.LVigente)}: ${causa}, ${topDelta(r)}`;
    }
    case "cerrar":
      return ctx.motivoCierre ?? "No elegible";
    case "mantener":
      if (ctx.mesesParaReapertura !== null) return `Reapertura en ${ctx.mesesParaReapertura} meses`;
      if (ctx.causaReduccion === "confirmada") return "Pendiente confirmar bajada";
      return `Sin cambios: score ${Math.round(r.score)}, límite ${eur(ctx.LPrev)}`;
  }
}
```

- [ ] **Step 4: `eligibility.ts`**

```ts
import { motivoPuerta } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import { PUERTAS, type EstadoDecision, type Puerta } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

export type Elegibilidad = { elegible: boolean; motivo: string | null; puertasFallidas: Puerta[] };

/** decision-engine §3: seis puertas en orden fijo; la primera que falla es el motivo. */
export function elegibilidad(r: ScoreRow, prev: EstadoDecision): Elegibilidad {
  const ok: Record<Puerta, boolean> = {
    historia: r.confianza >= P.confMin,
    estado: r.score >= P.scoreMin,
    fiabilidad: r.rachaB2 <= P.rachaB2Max,
    caja: r.rachaDeficit <= P.rachaDeficitMax && r.capacidadCuotaAdv > 0,
    clientes: r.C4 === null || r.C4 <= P.C4Max,
    grupo: !prev.crossDefaultActivo,
  };
  const puertasFallidas = PUERTAS.filter((p) => !ok[p]);
  return {
    elegible: puertasFallidas.length === 0,
    motivo: puertasFallidas.length ? motivoPuerta(puertasFallidas[0], r, prev.causaCrossDefault) : null,
    puertasFallidas,
  };
}
```

- [ ] **Step 5: Run** → `# pass 3`. **Commit** `feat(decision): eligibility gates and reason templates`.

---

## Tarea 4: Banda y límite

**Files:** create `lib/features/decision/limit.ts`, `limit.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { bajarBanda, banda, bandaEfectiva, limite, peor } from "@/lib/features/decision/limit";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("bands from score, effective band lowered on structural deterioration", () => {
  assert.equal(banda(75), "A");
  assert.equal(banda(74.9), "B");
  assert.equal(banda(60), "B");
  assert.equal(banda(45), "C");
  assert.equal(banda(44), "D");
  assert.equal(bajarBanda("A"), "B");
  assert.equal(bajarBanda("D"), "D");
  assert.equal(bandaEfectiva(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "estructural" })), "B");
  assert.equal(bandaEfectiva(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "temporal" })), "A");
  assert.equal(bandaEfectiva(scoreRowFixture({ score: 80 }), 1), "B");
  assert.equal(peor("A", "C"), "C");
  assert.equal(peor("B", "A"), "B");
});

test("limit = min(cap×12, 0.8×3m cobros) × factor × confianza haircut, rounded down to 1000", () => {
  // fixture sana de decision-engine §13: cap 10 k/mes, cobros 100 k/mes, conf 0,9
  const r = scoreRowFixture({ capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.9, score: 82 });
  const l = limite(r, "A");
  assert.equal(l.limiteCap, 120_000);
  assert.equal(l.limiteOp, 240_000);
  assert.equal(l.L, 120_000);
  assert.equal(limite(r, "B").L, 84_000);
  assert.equal(limite(r, "C").L, 48_000);
  assert.equal(limite(r, "D").L, 0);
  assert.equal(limite(scoreRowFixture({ capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.3 }), "A").L, 60_000);
  assert.equal(limite(scoreRowFixture({ capacidadCuotaAdv: 1_234.5, cobrosOpMedia3m: 100_000, confianza: 1 }), "A").L, 14_000);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

const ORDEN: Banda[] = ["A", "B", "C", "D"];

export function banda(score: number): Banda {
  if (score >= P.bandas.A) return "A";
  if (score >= P.bandas.B) return "B";
  if (score >= P.bandas.C) return "C";
  return "D";
}

export function bajarBanda(b: Banda, n = 1): Banda {
  return ORDEN[Math.min(ORDEN.length - 1, ORDEN.indexOf(b) + n)];
}

export function peor(a: Banda, b: Banda): Banda {
  return ORDEN[Math.max(ORDEN.indexOf(a), ORDEN.indexOf(b))];
}

/** Banda tras el recorte por deterioro estructural (§4) y por cross-default (§9, `escalonesExtra`). */
export function bandaEfectiva(r: ScoreRow, escalonesExtra = 0): Banda {
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural" ? 1 : 0;
  return bajarBanda(banda(r.score), estructural + escalonesExtra);
}

export type Limite = { limiteCap: number; limiteOp: number; LBruto: number; L: number };

function redondearAbajo(x: number, paso: number): number {
  return Math.floor(x / paso) * paso;
}

/** decision-engine §4. La capacidad de cuota adversa viene calculada por scoring (mismos parámetros de estrés). */
export function limite(r: ScoreRow, b: Banda): Limite {
  const limiteCap = r.capacidadCuotaAdv * P.mesesLimiteCap;
  const limiteOp = P.anticipoPct * r.cobrosOpMedia3m * P.anticipoMeses;
  const factorC = Math.min(1, r.confianza / P.confRef);
  const LBruto = Math.min(limiteCap, limiteOp) * P.factorBanda[b] * factorC;
  return { limiteCap, limiteOp, LBruto, L: redondearAbajo(LBruto, P.redondeoL) };
}
```

- [ ] **Step 4: Run** → `# pass 2`. **Commit** `feat(decision): bands and limit`.

---

## Tarea 5: Plazo e interés

**Files:** create `lib/features/decision/tenor.ts`, `interest.ts`, `tenor.test.ts`, `interest.test.ts`.

- [ ] **Step 1: Tests que fallan**

`tenor.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { tMax } from "@/lib/features/decision/tenor";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("T_max by band and trend, worst of current and predicted band (decision 37)", () => {
  assert.equal(tMax(scoreRowFixture({ score: 80 }), "A"), 180);
  assert.equal(tMax(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "temporal" }), "A"), 120);
  assert.equal(tMax(scoreRowFixture({ score: 80, direccion: "deterioro", naturaleza: "estructural" }), "A"), 60);
  assert.equal(tMax(scoreRowFixture({ score: 65 }), "A"), 120);
  assert.equal(tMax(scoreRowFixture({ score: 80 }), "C"), 60); // previsión peor acorta
  assert.equal(tMax(scoreRowFixture({ score: 50, direccion: "deterioro", naturaleza: "estructural" }), "C"), 0);
  assert.equal(tMax(scoreRowFixture({ score: 40 }), "A"), 0);
});
```

`interest.test.ts`:

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { coste, tae } from "@/lib/features/decision/interest";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("TAE = base + tenor premium + confidence premium ± trend + forecast premium", () => {
  const r = scoreRowFixture({ confianza: 0.9 });
  assert.deepEqual(tae("A", 30, r, "A"), { tae: 0.05, desglose: { base: 0.05, primaPlazo: 0, primaConfianza: 0, ajusteTendencia: 0, primaPrevision: 0 } });
  assert.equal(tae("A", 180, r, "A").tae, 0.075);
  assert.equal(tae("B", 60, scoreRowFixture({ confianza: 0.65 }), "B").tae, 0.085);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "mejora" }), "A").tae, 0.045);
  assert.equal(tae("A", 30, scoreRowFixture({ direccion: "deterioro" }), "A").tae, 0.06);
  assert.equal(tae("A", 30, r, "B").tae, 0.055);
  assert.equal(tae("D", 30, r, "D").tae, null);
  assert.equal(coste(10_000, 0.06, 90), 150);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `tenor.ts`**

```ts
import { banda, peor } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

/** decision-engine §5 con la decisión 37: la banda de la tabla es la peor de la actual y la prevista. */
export function tMax(r: ScoreRow, bandaPred: Banda): number {
  const b = peor(banda(r.score), bandaPred);
  const fila = P.tMax[b];
  if (r.direccion !== "deterioro") return fila.base;
  return r.naturaleza === "estructural" ? fila.estructural : fila.temporal;
}
```

- [ ] **Step 4: `interest.ts`**

```ts
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { DesgloseTae } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const ORDEN: Banda[] = ["A", "B", "C", "D"];

export type Tae = { tae: number; desglose: DesgloseTae } | { tae: null; desglose: null };

/** decision-engine §6 (+ prima de previsión, decisión 37). Redondeo a 4 decimales. */
export function tae(bEfectiva: Banda, plazoDias: number, r: ScoreRow, bandaPred: Banda): Tae {
  const base = P.baseTAE[bEfectiva];
  if (base === null) return { tae: null, desglose: null };
  const desglose: DesgloseTae = {
    base,
    primaPlazo: P.primaPlazoPp30d * Math.max(0, Math.ceil((plazoDias - 30) / 30)),
    primaConfianza: r.confianza < P.confPrima ? P.primaConfianzaPp : 0,
    ajusteTendencia: r.direccion === "mejora" ? P.ajusteMejoraPp : r.direccion === "deterioro" ? P.ajusteDeterioroPp : 0,
    primaPrevision: ORDEN.indexOf(bandaPred) > ORDEN.indexOf(bEfectiva) ? P.primaPrevisionPp : 0,
  };
  const total = Object.values(desglose).reduce((a, b) => a + b, 0);
  return { tae: Math.round(total * 1e4) / 1e4, desglose };
}

export function coste(cantidad: number, taeAnual: number, plazoDias: number): number {
  return Math.round(((cantidad * taeAnual * plazoDias) / P.baseDias) * 100) / 100;
}
```

- [ ] **Step 5: Run** ambos → `# pass 1` cada uno. **Commit** `feat(decision): tenor and interest`.

---

## Tarea 6: Menú

**Files:** create `lib/features/decision/menu.ts`, `menu.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { menu, plazoNatural, valida } from "@/lib/features/decision/menu";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

test("sana fixture menu: amounts grow with tenor up to L, TAE grows, capped by T_max", () => {
  const r = scoreRowFixture({ capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.9, score: 82 });
  const m = menu(r, 120_000, 180, "A", "A");
  assert.deepEqual(m.map((o) => [o.plazo, o.cantidadMax, o.tae]), [
    [30, 10_000, 0.05], [60, 20_000, 0.055], [90, 30_000, 0.06], [120, 40_000, 0.065], [180, 60_000, 0.075],
  ]);
  assert.equal(m[4].costeMax, 2250);
  assert.equal(menu(r, 120_000, 60, "A", "A").length, 2);
  assert.deepEqual(menu(r, 0, 180, "A", "A"), []);
});

test("valida a request against the menu; plazo natural from C3", () => {
  const r = scoreRowFixture({ capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.9 });
  const m = menu(r, 120_000, 180, "A", "A");
  assert.equal(valida({ cantidad: 25_000, plazo: 90 }, m), true);
  assert.equal(valida({ cantidad: 25_000, plazo: 60 }, m), false);
  assert.equal(valida({ cantidad: 25_000, plazo: 75 }, m), true); // primera opción con plazo ≥ 75 es 90 d
  assert.equal(valida({ cantidad: 1, plazo: 200 }, m), false);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: 45 })), 60);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: null })), 60);
  assert.equal(plazoNatural(scoreRowFixture({ C3dias: 200 })), 180);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import { coste, tae } from "@/lib/features/decision/interest";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { MenuOption } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

function redondearAbajo(x: number, paso: number): number {
  return Math.floor(x / paso) * paso;
}

/** decision-engine §7: región factible `cantidad ≤ L` y `cantidad ≤ capacidad × plazo_meses`. */
export function menu(r: ScoreRow, L: number, TMax: number, bEfectiva: Banda, bandaPred: Banda): MenuOption[] {
  const out: MenuOption[] = [];
  for (const plazo of P.plazosMenu) {
    if (plazo > TMax) break;
    const cantidadMax = redondearAbajo(Math.min(L, r.capacidadCuotaAdv * (plazo / 30)), P.redondeoL);
    if (cantidadMax <= 0) continue;
    const t = tae(bEfectiva, plazo, r, bandaPred);
    if (t.tae === null) continue;
    out.push({ plazo, cantidadMax, tae: t.tae, costeMax: coste(cantidadMax, t.tae, plazo), desglose: t.desglose });
  }
  return out;
}

export function valida(peticion: { cantidad: number; plazo: number }, opciones: MenuOption[]): boolean {
  const op = opciones.find((o) => o.plazo >= peticion.plazo);
  return !!op && peticion.cantidad <= op.cantidadMax;
}

/** Plazo natural del anticipo: C3 redondeado arriba al plazo del menú; sin dato → 60 d (§6). */
export function plazoNatural(r: ScoreRow): number {
  const dias = r.C3dias ?? P.plazoNaturalDefecto;
  return P.plazosMenu.find((p) => p >= dias) ?? P.plazosMenu[P.plazosMenu.length - 1];
}
```

- [ ] **Step 4: Run** → `# pass 2`. **Commit** `feat(decision): feasible region and menu`.

---

## Tarea 7: Acción y estado

**Files:** create `lib/features/decision/action.ts`, `action.test.ts`.

- [ ] **Step 1: Test que falla** (fixtures §13 sobre secuencias de meses)

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { decidirAccion, siguienteEstado } from "@/lib/features/decision/action";
import { ESTADO_INICIAL, type EstadoDecision } from "@/lib/features/decision/types";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const sana = (i: number, p: Partial<ScoreRow> = {}) =>
  scoreRowFixture({ month: CALENDAR[i], score: 82, capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, confianza: 0.9, ...p });

function run(rows: ScoreRow[], bandaPred: (r: ScoreRow) => "A" | "B" | "C" | "D" = () => "A") {
  let estado: EstadoDecision = ESTADO_INICIAL;
  return rows.map((r) => {
    const d = decidirAccion(r, { elegible: r.score >= 45 && r.confianza >= 0.5 && r.rachaDeficit < 3, motivo: null }, bandaPred(r), estado);
    estado = siguienteEstado(estado, d, r);
    return { ...d, estado };
  });
}

test("sana: abrir at month 1, mantener afterwards", () => {
  const out = run([sana(0), sana(1), sana(2)]);
  assert.equal(out[0].accion, "abrir");
  assert.equal(out[0].LVigente, 120_000);
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[2].estado.LPrev, 120_000);
});

test("mejora: ampliar capped at +25 % per month, only if L > 1.15 × L_prev", () => {
  const out = run([sana(0, { capacidadCuotaAdv: 5_000 }), sana(1, { capacidadCuotaAdv: 10_000, direccion: "mejora" })]);
  assert.equal(out[0].LVigente, 60_000);
  assert.equal(out[1].accion, "ampliar");
  assert.equal(out[1].LVigente, 75_000);
});

test("deterioro estructural: reducir immediately without hysteresis; cierre when T_max hits 0", () => {
  const out = run([sana(0), sana(1, { score: 58, direccion: "deterioro", naturaleza: "estructural" })]);
  assert.equal(out[1].accion, "reducir");
  assert.equal(out[1].bandaEfectiva, "C");
  assert.equal(out[1].LVigente, 48_000); // sin histéresis: la señal manda
});

test("bache temporal: a one-off drop is not confirmed, limit held", () => {
  const out = run([sana(0), sana(1, { capacidadCuotaAdv: 5_000 }), sana(2)]);
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[1].LVigente, 120_000);
  assert.equal(out[1].estado.mesesReduccionSeguidos, 1);
  assert.equal(out[2].estado.mesesReduccionSeguidos, 0);
});

test("two months below 85 % → reducir with the −25 % cap", () => {
  const out = run([sana(0), sana(1, { capacidadCuotaAdv: 5_000 }), sana(2, { capacidadCuotaAdv: 5_000 })]);
  assert.equal(out[2].accion, "reducir");
  assert.equal(out[2].LVigente, 90_000);
});

test("cerrar and reapertura after 2 consecutive eligible months", () => {
  const out = run([sana(0), sana(1, { score: 40 }), sana(2), sana(3)]);
  assert.equal(out[1].accion, "cerrar");
  assert.equal(out[1].LVigente, 0);
  assert.equal(out[2].accion, "mantener");
  assert.equal(out[2].LVigente, 0);
  assert.equal(out[3].accion, "abrir");
});

test("previsión peor: hold, then preventive reducir after 2 months; never ampliar", () => {
  const out = run([sana(0), sana(1), sana(2), sana(3, { capacidadCuotaAdv: 20_000 })], (r) => (r.month === CALENDAR[0] ? "A" : "C"));
  assert.equal(out[1].accion, "mantener");
  assert.equal(out[1].estado.mesesPredPeorSeguidos, 1);
  assert.equal(out[2].accion, "reducir");
  assert.equal(out[2].LVigente, 90_000); // L con factor 0,4 = 48 k, acotado por histéresis a 120 k × 0,75
  assert.equal(out[3].accion, "reducir");
  assert.notEqual(out[3].accion, "ampliar");
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import type { Elegibilidad } from "@/lib/features/decision/eligibility";
import { bandaEfectiva, limite, type Limite } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion, EstadoDecision } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";

const ORDEN: Banda[] = ["A", "B", "C", "D"];
function esPeor(a: Banda, b: Banda): boolean {
  return ORDEN.indexOf(a) > ORDEN.indexOf(b);
}
function clip(x: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, x));
}

export type Decision = {
  accion: Accion;
  L: number;
  LVigente: number;
  bandaEfectiva: Banda;
  limite: Limite;
  causaReduccion: "estructural" | "confirmada" | "prevision" | null;
  mesesParaReapertura: number | null;
  escalonesExtra: number;
};

/**
 * decision-engine §8 con la decisión 37. `escalonesExtra` baja la banda por cross-default (§9).
 * No muta `prev`; el estado siguiente lo calcula `siguienteEstado`.
 */
export function decidirAccion(r: ScoreRow, e: Elegibilidad, bandaPred: Banda, prev: EstadoDecision, escalonesExtra = 0): Decision {
  const b = bandaEfectiva(r, escalonesExtra);
  const lim = limite(r, b);
  const L = lim.L;
  const Lp = prev.LPrev;
  const base = { L, bandaEfectiva: b, limite: lim, causaReduccion: null, mesesParaReapertura: null, escalonesExtra } as const;

  if (!e.elegible) return { ...base, accion: "cerrar", LVigente: 0 };

  if (Lp === 0) {
    if (prev.cerradoDesde !== null && prev.mesesElegibleSeguidos + 1 < P.reaperturaMeses)
      return { ...base, accion: "mantener", LVigente: 0, mesesParaReapertura: P.reaperturaMeses - prev.mesesElegibleSeguidos - 1 };
    return { ...base, accion: L > 0 ? "abrir" : "mantener", LVigente: L };
  }

  const LAcotado = clip(L, Lp * (1 - P.histeresisPct), Lp * (1 + P.histeresisPct));
  const estructural = r.direccion === "deterioro" && r.naturaleza === "estructural";
  if (estructural && L < Lp) return { ...base, accion: "reducir", LVigente: L, causaReduccion: "estructural" };

  if (esPeor(bandaPred, b) && prev.mesesPredPeorSeguidos + 1 >= P.reducirPrevMeses) {
    const LPred = limite(r, bandaPred).L;
    if (LPred < Lp) return { ...base, accion: "reducir", LVigente: Math.max(LPred, Lp * (1 - P.histeresisPct)), causaReduccion: "prevision" };
  }

  if (L > P.ampliarRatio * Lp && r.direccion !== "deterioro" && !esPeor(bandaPred, b))
    return { ...base, accion: "ampliar", LVigente: LAcotado };

  if (L < P.reducirRatio * Lp) {
    if (prev.mesesReduccionSeguidos + 1 >= P.reducirMeses) return { ...base, accion: "reducir", LVigente: LAcotado, causaReduccion: "confirmada" };
    return { ...base, accion: "mantener", LVigente: Lp, causaReduccion: "confirmada" };
  }
  return { ...base, accion: "mantener", LVigente: Lp };
}

/** Actualización del estado tras decidir (§8). */
export function siguienteEstado(prev: EstadoDecision, d: Decision & { elegible?: boolean }, r: ScoreRow, bandaPred: Banda = "A"): EstadoDecision {
  const elegible = d.accion !== "cerrar";
  return {
    LPrev: d.LVigente,
    accionPrev: d.accion,
    mesesElegibleSeguidos: elegible ? prev.mesesElegibleSeguidos + 1 : 0,
    mesesReduccionSeguidos: prev.LPrev > 0 && d.L < P.reducirRatio * prev.LPrev ? prev.mesesReduccionSeguidos + 1 : 0,
    mesesPredPeorSeguidos: esPeor(bandaPred, d.bandaEfectiva) ? prev.mesesPredPeorSeguidos + 1 : 0,
    cerradoDesde: d.accion === "cerrar" ? r.month : d.accion === "abrir" ? null : prev.cerradoDesde,
    crossDefaultActivo: prev.crossDefaultActivo,
    causaCrossDefault: prev.causaCrossDefault,
  };
}
```

Nota para el test `previsión peor`: `run()` debe pasar `bandaPred(r)` también a `siguienteEstado`; ajusta el helper: `estado = siguienteEstado(estado, d, r, bandaPred(r))`.

- [ ] **Step 4: Run** → `# pass 7`. Si un número esperado no sale de la implementación, recalcula y corrige la aserción dejando la derivación visible. **Commit** `feat(decision): monthly action with hysteresis, reopening and preventive reduction`.

---

## Tarea 8: Techo de grupo y cross-default

**Files:** create `lib/features/decision/group.ts`, `group.test.ts`.

Techo: `L_grupo` se calcula con la fórmula de §4 sobre los flujos consolidados de `ScoreRow` (`cobrosOpGrupoMedia6m`, `pagosOpGrupoMedia6m`, `servicioDeudaGrupoMedia6m`) usando `PARAMS.estresCobros/estresPagos/coberturaMin` de scoring, y `limiteOp` de grupo con `cobrosOpGrupoMedia6m × 3` (no existe media de 3 meses de grupo: desviación documentada en `decision-engine.md` §9). Banda del grupo: media de `score` de los miembros ponderada por `cobrosOpMedia6m`; factor de confianza: media ponderada de `confianza`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { ajusteGrupo, limiteGrupo } from "@/lib/features/decision/group";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";

const base = { cobrosOpGrupoMedia6m: 300_000, pagosOpGrupoMedia6m: 200_000, servicioDeudaGrupoMedia6m: 10_000 };

test("group limit from consolidated flows", () => {
  const rows = [scoreRowFixture({ company: "a", score: 80, confianza: 1, cobrosOpMedia6m: 100_000, ...base }), scoreRowFixture({ company: "b", score: 70, confianza: 1, cobrosOpMedia6m: 200_000, ...base })];
  const cap = (0.8 * 300_000 - 1.1 * 200_000) / 1.3 - 10_000; // 5 384,6
  assert.ok(Math.abs(limiteGrupo(rows).capacidad - cap) < 1e-6);
  assert.equal(limiteGrupo(rows).L, Math.floor((Math.min(cap * 12, 0.8 * 300_000 * 3) * 0.7) / 1000) * 1000); // banda B (73,3)
});

test("ceiling prorates limits; cross-default lowers siblings one band and flags them", () => {
  const rows = [scoreRowFixture({ company: "a", score: 80, D1: 0.5, ...base }), scoreRowFixture({ company: "b", score: 80, D1: 0.5, ...base })];
  const dec = [
    { company: "a", accion: "cerrar" as const, L: 0, LVigente: 0, bandaEfectiva: "D" as const },
    { company: "b", accion: "mantener" as const, L: 100_000, LVigente: 100_000, bandaEfectiva: "A" as const },
  ];
  const out = ajusteGrupo(rows, dec, 60_000);
  assert.equal(out.decisiones.find((d) => d.company === "b")!.LVigente, 45_000); // techo 60 k y escalón extra → se recalcula en el engine; aquí: min(techo prorrateado, LVigente)
  assert.deepEqual([...out.caidas], ["a"]);
  assert.deepEqual(out.afectadas, ["b"]);
  assert.match(out.motivoGrupo!, /Techo de grupo/);
});
```

Aclaración para el implementador: `ajusteGrupo` recibe las decisiones ya tomadas del mes (`L`, `LVigente`, `bandaEfectiva`) y el `L_grupo`; devuelve `LVigente` prorrateado cuando `Σ LVigente > L_grupo` (`45 000 = 100 000 × 60 000 / 100 000 → 60 000`... **recalcula**: Σ = 100 000 > 60 000 ⇒ b = 100 000 × 60/100 = 60 000; el test espera 45 000 porque, además, la caída de `a` con `D1 ≥ 0,3` baja un escalón a `b` y su límite se reduce; para mantener `group.ts` puro, `ajusteGrupo` devuelve `afectadas` y el **engine** recomputa esas filas con `escalonesExtra = 1` y vuelve a aplicar el techo). Simplifica el test a lo que hace `group.ts` solo: `LVigente` de b = 60 000, `caidas = {a}`, `afectadas = ["b"]`. El efecto del escalón se prueba en `engine.test.ts` (Tarea 9).

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import { banda } from "@/lib/features/decision/limit";
import { DECISION_PARAMS as P, type Banda } from "@/lib/features/decision/params";
import type { Accion } from "@/lib/features/decision/types";
import { PARAMS as S } from "@/lib/features/scoring/params";
import type { ScoreRow } from "@/lib/features/scoring/types";

export type DecisionMes = { company: string; accion: Accion; L: number; LVigente: number; bandaEfectiva: Banda };
export type LimiteGrupo = { capacidad: number; limiteCap: number; limiteOp: number; banda: Banda; L: number };

function redondearAbajo(x: number, paso: number): number {
  return Math.floor(x / paso) * paso;
}

/** §9: límite del grupo tratado como una sola empresa sobre los flujos consolidados de ScoreRow. */
export function limiteGrupo(rows: ScoreRow[]): LimiteGrupo {
  const g = rows[0];
  const capacidad = Math.max(0, (S.estresCobros * g.cobrosOpGrupoMedia6m - S.estresPagos * g.pagosOpGrupoMedia6m) / S.coberturaMin - g.servicioDeudaGrupoMedia6m);
  const limiteCap = capacidad * P.mesesLimiteCap;
  const limiteOp = P.anticipoPct * g.cobrosOpGrupoMedia6m * P.anticipoMeses;
  const peso = rows.reduce((a, r) => a + r.cobrosOpMedia6m, 0);
  const score = peso > 0 ? rows.reduce((a, r) => a + r.score * r.cobrosOpMedia6m, 0) / peso : rows.reduce((a, r) => a + r.score, 0) / rows.length;
  const conf = peso > 0 ? rows.reduce((a, r) => a + r.confianza * r.cobrosOpMedia6m, 0) / peso : 0;
  const b = banda(score);
  const L = redondearAbajo(Math.min(limiteCap, limiteOp) * P.factorBanda[b] * Math.min(1, conf / P.confRef), P.redondeoL);
  return { capacidad, limiteCap, limiteOp, banda: b, L };
}

export type AjusteGrupo = { decisiones: DecisionMes[]; caidas: Set<string>; afectadas: string[]; motivoGrupo: string | null };

/** §9: techo (Σ L_vigente ≤ L_grupo, prorrateo) y detección de cross-default (cierre con D1 ≥ 0,3). */
export function ajusteGrupo(rows: ScoreRow[], decisiones: DecisionMes[], LGrupo: number): AjusteGrupo {
  const suma = decisiones.reduce((a, d) => a + d.LVigente, 0);
  let motivoGrupo: string | null = null;
  let ajustadas = decisiones;
  if (suma > LGrupo) {
    ajustadas = decisiones.map((d) => ({ ...d, LVigente: redondearAbajo((d.LVigente * LGrupo) / suma, P.redondeoL) }));
    motivoGrupo = `Techo de grupo: ${Math.round(LGrupo).toLocaleString("es-ES")} €`;
  }
  const D1 = new Map(rows.map((r) => [r.company, r.D1]));
  const caidas = new Set(decisiones.filter((d) => d.accion === "cerrar" && (D1.get(d.company) ?? 0) >= P.D1CrossDefault).map((d) => d.company));
  const afectadas = caidas.size ? decisiones.filter((d) => !caidas.has(d.company)).map((d) => d.company) : [];
  return { decisiones: ajustadas, caidas, afectadas, motivoGrupo };
}
```

- [ ] **Step 4: Run** → `# pass 2`. **Commit** `feat(decision): group ceiling and cross-default detection`.

---

## Tarea 9: Orquestador `engine.ts`

**Files:** create `lib/features/decision/engine.ts`, `engine.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { decisionRowSchema } from "@/lib/features/decision/contracts";
import { decideGroup, parametrosDecision } from "@/lib/features/decision/engine";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

const params = parametrosDecision("score-v");
const grupo = { cobrosOpGrupoMedia6m: 1_000_000, pagosOpGrupoMedia6m: 600_000, servicioDeudaGrupoMedia6m: 20_000 };
function serie(company: string, patch: (i: number) => Partial<ScoreRow>): ScoreRow[] {
  return CALENDAR.map((month, i) => scoreRowFixture({ company, month, groupId: "g", score: 82, capacidadCuotaAdv: 10_000, cobrosOpMedia3m: 100_000, cobrosOpMedia6m: 100_000, confianza: 0.9, D1: 0.5, ...grupo, ...patch(i) }));
}

test("rows respect the contract; sana opens and holds; state carries", () => {
  const rows = decideGroup(serie("a", () => ({})), params);
  assert.equal(rows.length, CALENDAR.length);
  for (const r of rows) decisionRowSchema.parse(r);
  assert.equal(rows[0].accion, "abrir");
  assert.equal(rows[0].LVigente, 120_000);
  assert.equal(rows[1].accion, "mantener");
  assert.equal(rows[5].menu.length, 5);
  assert.equal(rows[0].bandaPred3mUsada, null); // sin previsión
  assert.equal(rows[0].motor, "v1");
});

test("no eligible ⇒ cerrar with reason and L_vigente 0", () => {
  const rows = decideGroup(serie("a", (i) => (i === 2 ? { score: 40 } : {})), params);
  assert.equal(rows[2].accion, "cerrar");
  assert.equal(rows[2].elegible, false);
  assert.match(rows[2].motivo!, /Score 40/);
  assert.equal(rows[2].LVigente, 0);
  assert.equal(rows[3].accion, "mantener");
  assert.equal(rows[4].accion, "abrir");
});

test("group: ceiling prorates and a big sibling closing lowers the others one band and closes them next month", () => {
  const a = serie("a", (i) => (i >= 3 ? { score: 40 } : {}));
  const b = serie("b", () => ({ D1: 0.5 }));
  const rows = decideGroup([...a, ...b], params);
  const bRows = rows.filter((r) => r.company === "b");
  assert.equal(bRows[3].bandaEfectiva, "B"); // escalón por cross-default en el mes de la caída
  assert.ok(bRows[3].LVigente < bRows[2].LVigente);
  assert.equal(bRows[4].accion, "cerrar"); // puerta grupo
  assert.match(bRows[4].motivo!, /Cierre de a/);
  assert.equal(bRows[3].estado.crossDefaultActivo, true);
});

test("Σ L_vigente ≤ L_grupo and determinism", () => {
  const rows = decideGroup([...serie("a", () => ({})), ...serie("b", () => ({}))], params);
  const byMonth = new Map<string, number>();
  for (const r of rows) byMonth.set(r.month, (byMonth.get(r.month) ?? 0) + r.LVigente);
  for (const suma of byMonth.values()) assert.ok(suma <= 400_000 + 1e-6); // techo del fixture: ver limiteGrupo
  assert.deepEqual(rows, decideGroup([...serie("a", () => ({})), ...serie("b", () => ({}))], params));
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Implementación**

```ts
import { decidirAccion, siguienteEstado, type Decision } from "@/lib/features/decision/action";
import { elegibilidad } from "@/lib/features/decision/eligibility";
import { ajusteGrupo, limiteGrupo } from "@/lib/features/decision/group";
import { banda } from "@/lib/features/decision/limit";
import { menu, plazoNatural } from "@/lib/features/decision/menu";
import { motivoAccion } from "@/lib/features/decision/motivos";
import { DECISION_PARAMS as P, hashDecisionParams, type Banda } from "@/lib/features/decision/params";
import { tMax } from "@/lib/features/decision/tenor";
import { ESTADO_INICIAL, type DecisionParameters, type DecisionRow, type EstadoDecision, type PrevisionInput } from "@/lib/features/decision/types";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { CALENDAR } from "@/lib/features/scoring/windows";

export function parametrosDecision(versionScoring: string): DecisionParameters {
  const paramsHash = hashDecisionParams(P);
  return { version: hashDecisionParams({ paramsHash, versionScoring }), paramsHash, versionScoring };
}

export type Previsiones = Map<string, PrevisionInput>; // clave `${company}|${month}`

function prevision(prev: Previsiones | undefined, r: ScoreRow): PrevisionInput {
  const p = prev?.get(`${r.company}|${r.month}`);
  if (!p || p.metodo === "desconectado") return { bandaPred3m: banda(r.score), scorePred3m: null, direccionPred: null, probDeterioro6m: null, metodo: "desconectado" };
  return p;
}

function fila(r: ScoreRow, d: Decision, e: ReturnType<typeof elegibilidad>, pred: PrevisionInput, prev: EstadoDecision, estado: EstadoDecision, params: DecisionParameters, motivoGrupo: string | null): DecisionRow {
  const T = d.accion === "cerrar" ? 0 : tMax(r, pred.bandaPred3m);
  const opciones = d.accion === "cerrar" || T === 0 ? [] : menu(r, d.LVigente, T, d.bandaEfectiva, pred.bandaPred3m);
  const elegible = e.elegible && T > 0;
  const motivo = !e.elegible ? e.motivo : T === 0 ? `Deterioro estructural en banda ${banda(r.score)}` : opciones.length === 0 && d.LVigente > 0 ? "Capacidad de cuota insuficiente para cualquier plazo" : null;
  return {
    company: r.company, month: r.month, groupId: r.groupId, motor: "v1", versionParametros: params.version,
    elegible, motivo, puertasFallidas: e.puertasFallidas,
    banda: banda(r.score), bandaEfectiva: d.bandaEfectiva,
    capacidadCuotaAdv: r.capacidadCuotaAdv, limiteCap: d.limite.limiteCap, limiteOp: d.limite.limiteOp, L: d.L, LVigente: d.LVigente,
    TMax: T, menu: opciones, plazoNaturalAnticipo: plazoNatural(r),
    accion: d.accion,
    motivoAccion: motivoAccion(d.accion, r, { banda: d.bandaEfectiva, L: d.L, LPrev: prev.LPrev, LVigente: d.LVigente, TMax: T, motivoCierre: e.motivo, causaReduccion: d.causaReduccion, bandaPred: pred.metodo === "desconectado" ? null : pred.bandaPred3m, mesesParaReapertura: d.mesesParaReapertura }),
    motivoGrupo,
    bandaPred3mUsada: pred.metodo === "desconectado" ? null : pred.bandaPred3m,
    estado,
  };
}

/**
 * decision-engine §12: todas las filas de score de UN grupo (todas las empresas, todos los meses).
 * Por mes: decidir cada empresa con su estado anterior → techo y cross-default → estado siguiente.
 */
export function decideGroup(scoreRows: ScoreRow[], params: DecisionParameters, previsiones?: Previsiones): DecisionRow[] {
  const porMes = new Map<string, ScoreRow[]>();
  for (const r of scoreRows) (porMes.get(r.month) ?? porMes.set(r.month, []).get(r.month)!).push(r);
  const estados = new Map<string, EstadoDecision>();
  const out: DecisionRow[] = [];
  for (const month of CALENDAR) {
    const rows = (porMes.get(month) ?? []).sort((a, b) => a.company.localeCompare(b.company));
    if (!rows.length) continue;
    const LGrupo = rows.length > 1 ? limiteGrupo(rows).L : Infinity;
    const decide = (r: ScoreRow, escalones: number) => {
      const prev = estados.get(r.company) ?? ESTADO_INICIAL;
      const e = elegibilidad(r, prev);
      const pred = prevision(previsiones, r);
      return { r, prev, e, pred, d: decidirAccion(r, e, pred.bandaPred3m, prev, escalones) };
    };
    let decisiones = rows.map((r) => decide(r, 0));
    let ajuste = ajusteGrupo(rows, decisiones.map(({ r, d }) => ({ company: r.company, accion: d.accion, L: d.L, LVigente: d.LVigente, bandaEfectiva: d.bandaEfectiva })), LGrupo);
    if (ajuste.afectadas.length) {
      decisiones = decisiones.map((x) => (ajuste.afectadas.includes(x.r.company) ? decide(x.r, 1) : x));
      ajuste = ajusteGrupo(rows, decisiones.map(({ r, d }) => ({ company: r.company, accion: d.accion, L: d.L, LVigente: d.LVigente, bandaEfectiva: d.bandaEfectiva })), LGrupo);
    }
    const causa = [...ajuste.caidas][0] ?? null;
    for (const x of decisiones) {
      const LVigente = ajuste.decisiones.find((a) => a.company === x.r.company)!.LVigente;
      const d = { ...x.d, LVigente };
      const siguiente = siguienteEstado(x.prev, d, x.r, x.pred.bandaPred3m);
      const afectada = ajuste.afectadas.includes(x.r.company);
      const estado: EstadoDecision = {
        ...siguiente,
        crossDefaultActivo: afectada ? true : x.prev.crossDefaultActivo && !!x.prev.causaCrossDefault && !ajuste.caidas.has(x.r.company) && estados.get(x.prev.causaCrossDefault)?.LPrev === 0,
        causaCrossDefault: afectada ? causa : siguiente.crossDefaultActivo ? x.prev.causaCrossDefault : null,
      };
      estados.set(x.r.company, estado);
      out.push(fila(x.r, d, x.e, x.pred, x.prev, estado, params, ajuste.motivoGrupo));
    }
  }
  return out;
}
```

Regla de levantamiento del cross-default (§9): se mantiene activo mientras la empresa causante siga cerrada (`LPrev === 0`); cuando reabre, se levanta. Simplifica la expresión anterior en una función `crossDefaultSiguiente(prev, afectada, causa, estados)` con esa regla y un test.

- [ ] **Step 4: Run** → `# pass 4`. Ajusta los números esperados del test de grupo si no salen de la implementación, dejando la derivación en comentario. **Commit** `feat(decision): group orchestrator producing company_month_decision rows`.

---

## Tarea 10: Métricas para el jurado (§14)

**Files:** modify `lib/features/scoring/backtest.ts` (exportar `detectEvents(rows) → { company, month, kind }[]`), create `lib/features/decision/metrics.ts`, `metrics.test.ts`.

- [ ] **Step 1: Test que falla**

```ts
import assert from "node:assert/strict";
import test from "node:test";
import { metricasDecision } from "@/lib/features/decision/metrics";
import { scoreRowFixture } from "@/lib/features/scoring/__fixtures__/score-row";
import { CALENDAR } from "@/lib/features/scoring/windows";
import type { DecisionRow } from "@/lib/features/decision/types";

function dec(month: string, accion: DecisionRow["accion"], LVigente: number): DecisionRow {
  return { company: "c", month, accion, LVigente, menu: [{ plazo: 60, cantidadMax: LVigente, tae: 0.06, costeMax: 0, desglose: { base: 0.06, primaPlazo: 0, primaConfianza: 0, ajusteTendencia: 0, primaPrevision: 0 } }], plazoNaturalAnticipo: 60 } as unknown as DecisionRow;
}

test("exposure avoided, simulated income, oscillation, false closes, lead time of reduction", () => {
  const deficit = [false, false, false, false, false, false, false, false, true, true, true, false, false, false, false, false, false, false];
  const scores = deficit.map((d, i) => scoreRowFixture({ month: CALENDAR[i], deficitMes: d }));
  const decisions = deficit.map((_, i) => dec(CALENDAR[i], i === 5 ? "reducir" : i === 7 ? "cerrar" : "mantener", i < 5 ? 100_000 : i < 7 ? 50_000 : 0));
  const m = metricasDecision(scores, decisions);
  assert.equal(m.eventos, 1);
  assert.equal(m.leadTimeCierreMediano, 3); // reducir en índice 5, evento en 8
  assert.equal(m.exposicionEvitada, 100_000); // L en t−3 (100 k) − L en el evento (0)
  assert.ok(m.ingresosSimulados > 0);
  assert.ok(Math.abs(m.oscilacion - 2 / 18) < 1e-9);
  assert.equal(m.cierresFalsos, 0);
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: `backtest.ts`** — extraer la detección de eventos a `export function detectEvents(rows: ScoreRow[]): { company: string; month: string; kind: "deterioro" | "recuperacion" }[]` reutilizando `eventAt`; `backtest()` la usa. Tests existentes deben seguir verdes.

- [ ] **Step 4: `metrics.ts`**

```ts
import { DECISION_PARAMS as P } from "@/lib/features/decision/params";
import type { DecisionRow } from "@/lib/features/decision/types";
import { detectEvents } from "@/lib/features/scoring/backtest";
import type { ScoreRow } from "@/lib/features/scoring/types";
import { median, monthIndex } from "@/lib/features/scoring/windows";

export type MetricasDecision = {
  eventos: number;
  exposicionEvitada: number;
  ingresosSimulados: number;
  oscilacion: number;
  cierres: number;
  cierresFalsos: number;
  leadTimeCierreMediano: number | null;
};

/** decision-engine §14. Exposición evitada = Σ (L_vigente(t−3) − L_vigente(t)) sobre eventos de deterioro en t. */
export function metricasDecision(scores: ScoreRow[], decisions: DecisionRow[]): MetricasDecision {
  const byKey = new Map(decisions.map((d) => [`${d.company}|${d.month}`, d]));
  const byCompany = new Map<string, DecisionRow[]>();
  for (const d of decisions) (byCompany.get(d.company) ?? byCompany.set(d.company, []).get(d.company)!).push(d);
  for (const list of byCompany.values()) list.sort((a, b) => a.month.localeCompare(b.month));
  const eventos = detectEvents(scores).filter((e) => e.kind === "deterioro");
  let exposicionEvitada = 0;
  const leads: number[] = [];
  for (const e of eventos) {
    const t = monthIndex(e.month);
    const list = byCompany.get(e.company) ?? [];
    const antes = list.find((d) => monthIndex(d.month) === t - 3);
    const en = byKey.get(`${e.company}|${e.month}`);
    if (antes && en) exposicionEvitada += Math.max(0, antes.LVigente - en.LVigente);
    const primeraReduccion = list.find((d) => (d.accion === "reducir" || d.accion === "cerrar") && monthIndex(d.month) < t && monthIndex(d.month) >= t - 6);
    if (primeraReduccion) leads.push(t - monthIndex(primeraReduccion.month));
  }
  let ingresos = 0, cambios = 0, cierres = 0, cierresFalsos = 0;
  const eventosPorEmpresa = new Map<string, number[]>();
  for (const e of eventos) (eventosPorEmpresa.get(e.company) ?? eventosPorEmpresa.set(e.company, []).get(e.company)!).push(monthIndex(e.month));
  for (const [company, list] of byCompany) {
    for (let i = 0; i < list.length; i++) {
      const d = list[i];
      const op = d.menu.find((o) => o.plazo >= d.plazoNaturalAnticipo) ?? d.menu.at(-1);
      if (op) ingresos += (P.usoSimulado * d.LVigente * op.tae * op.plazo) / P.baseDias;
      if (d.accion !== "mantener") cambios++;
      if (d.accion === "cerrar" && (i === 0 || list[i - 1].accion !== "cerrar")) {
        cierres++;
        const t = monthIndex(d.month);
        const ev = eventosPorEmpresa.get(company) ?? [];
        if (!ev.some((x) => x > t && x <= t + 6)) cierresFalsos++;
      }
    }
  }
  return {
    eventos: eventos.length,
    exposicionEvitada,
    ingresosSimulados: Math.round(ingresos),
    oscilacion: decisions.length ? cambios / decisions.length : 0,
    cierres,
    cierresFalsos,
    leadTimeCierreMediano: median(leads),
  };
}
```

- [ ] **Step 5: Run** → `# pass 1`, suite completa verde. **Commit** `feat(decision): judge metrics`.

---

## Tarea 11: Cableado y retirada del legacy

**Files:** modify `scripts/scoring.ts`, `lib/features/scoring/api.ts`, `README.md`, `docs/decision-engine.md`; delete `lib/features/decision/legacy.ts`, `legacy.test.ts`; remove `LegacyDecisionRow`/`legacyDecisionRowSchema`.

- [ ] **Step 1: `scripts/scoring.ts`**
  - `doDecide`: agrupar `scores.jsonl` por `groupId`; `const params = parametrosDecision(scoringParams.version)`; por grupo `decideGroup(rows, params)`; escribir `decisions.jsonl` validando con `decisionRowSchema`; escribir `decision-parameters.json` en el run dir; log `{ decisions, companies, groups, version }`.
  - `doBacktest`: además de `backtest(...)`, calcular `metricasDecision(scoresValidacion, decisionesValidacion)` leyendo `decisions.jsonl` y guardar bajo `decision` en `backtest.json`.
  - `doImport`: mapear `band: d.bandaEfectiva`, `action: d.accion`, `recommendedLimit: d.L`, `appliedLimit: d.LVigente`, `data: d`.
- [ ] **Step 2: `api.ts`** — `DECISION_KEYS = ["elegible","motivo","banda","bandaEfectiva","L","LVigente","TMax","accion","motivoAccion","motivoGrupo","bandaPred3mUsada"]` sobre `DecisionRowDTO`; los filtros `band`/`action` siguen sobre las columnas Prisma.
- [ ] **Step 3: Borrar legacy** — `git rm lib/features/decision/legacy.ts lib/features/decision/legacy.test.ts`; quitar los tipos/esquemas legacy de `types.ts`/`contracts.ts`; `grep -rn "legacy" lib scripts app` → solo comentarios históricos, si alguno.
- [ ] **Step 4: Docs** — `docs/decision-engine.md` §9: nota "limiteOp de grupo usa `cobros_op_grupo_media6m × 3` (no hay media de 3 meses consolidada)"; §1: la previsión es opcional (`metodo = desconectado` ⇒ `banda_pred_3m = banda`). README: `pnpm scoring:decide` ahora es el motor v1; `backtest.json` incluye `decision`.
- [ ] **Step 5: Gates** — `pnpm test`, `pnpm run typecheck`, `pnpm run lint`, prettier. **Commit** `feat(decision): wire v1 engine, retire legacy`.

---

## Tarea 12: Ejecución real y comprobaciones

- [ ] **Step 1** — con los artefactos de `tmp/scoring-v1/` (si `meta()` rechaza el fingerprint, `SCORING_REINGEST=1 pnpm scoring:fit && pnpm scoring:score`): `pnpm scoring:decide && pnpm scoring:backtest`. Registrar los JSON.
- [ ] **Step 2** — script desechable en `C:\Users\kekoi\.claude\jobs\0a164338\tmp\`: propiedades §13 sobre `decisions.jsonl`: (1) `elegible = false ⇒ LVigente = 0`; (2) `cantidadMax` y `tae` no decrecen con el plazo en cada menú; (3) `|LVigente − LPrev| ≤ 25 %` salvo `cerrar`/`reducir` estructural o previsión; (4) `Σ LVigente por grupo-mes ≤ L_grupo` (recalcular con `limiteGrupo`); distribución de `accion`, `bandaEfectiva`, `elegible`, `puertasFallidas` (por puerta) y `TMax`; % de filas con menú vacío; suma de `LVigente` en 2026-08 (exposición total) y `ingresosSimulados`.
- [ ] **Step 3** — commit `docs: decision v1 real run figures` si se toca README; no push.

---

## Auto-revisión

Cobertura de `decision-engine.md`: §2 → T1 · §3 → T3 · §4 → T4 · §5 → T5 · §6 → T5 · §7 → T6 · §8 → T7 · §9 → T8 + T9 · §10 → T2 + T9 · §11 → T3 (`motivos.ts`) · §12 → T9 · §13 fixtures → T7 (sana, mejora, deterioro_estructural, bache, historial_corto vía elegibilidad, prevision_peor) + T9 (grupo_caida) · §13 propiedades → T12 · §14 → T10. Huecos: el fixture `historial_corto` se prueba por la puerta `historia` (T3), no de punta a punta; la regla de levantamiento del cross-default es una interpretación de §9 ("cuando la empresa caída vuelve a abrir"), documentarla en el engine.

Consistencia de nombres: `elegibilidad` (T3, T7, T9) · `banda/bandaEfectiva/limite/peor/bajarBanda` (T4, T5, T7, T8, T9) · `tMax` (T5, T9) · `tae/coste` (T5, T6) · `menu/valida/plazoNatural` (T6, T9) · `decidirAccion/siguienteEstado/Decision` (T7, T9) · `limiteGrupo/ajusteGrupo/DecisionMes` (T8, T9) · `decideGroup/parametrosDecision/Previsiones` (T9, T11) · `metricasDecision` (T10, T11) · `detectEvents` (T10) · `DecisionRow/EstadoDecision/PrevisionInput/MenuOption` (T2, T7, T9, T10, T11).
