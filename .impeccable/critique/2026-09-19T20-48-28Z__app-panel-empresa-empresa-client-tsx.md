---
target: company view / empresa Mi score
total_score: 17
p0_count: 1
p1_count: 2
timestamp: 2026-09-19T20-48-28Z
slug: app-panel-empresa-empresa-client-tsx
---
# Critique: company view (Mi score)

Target: `app/(panel)/empresa/empresa-client.tsx`
Live: `http://localhost:3000/empresa`

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | Status contradicted: badge Vigilar vs Banda A; KPI 236.000 € vs reason 137.000 € vs simulator 137.000 €; TAE 0,0 % vs 0,1 %. Ladder a11y title exposes raw float. |
| 2 | Match System / Real World | 2 | Jury H1 “Lo que ve la empresa antes de pedir nada”. PCA Eje 1/2/3. “Opt-in activo” while still private. TAE 0,0 % is not a rate a CFO believes. |
| 3 | User Control and Freedom | 2 | Pedir circulante has no confirm. Escape from the 4,000px stack is scroll, not IA. |
| 4 | Consistency and Standards | 1 | Three limits, two TAEs, three health languages (Vigilar / Banda A / banda B). Cartera uses action verbs; here the CTA is a small button under a privacy essay. |
| 5 | Error Prevention | 1 | One click shares score + offer. Savings (9.912 €/año) computed in the client from a hardcoded 8,2 %. |
| 6 | Recognition Rather Than Recall | 2 | Everything is on-screen, so nothing is findable. User must hold 236k vs 137k vs 110k to act. |
| 7 | Flexibility and Efficiency | 2 | ⌘K exists. No 60s path. Power-user chrome (PCA, full cascade) is default. |
| 8 | Aesthetic and Minimalist Design | 1 | Nine equal h2s. Score shown three times. Twelve indicators twice. Decorative KPI icon tiles. Nested cards. |
| 9 | Error Recovery | 2 | Retirar solicitud after the fact, then a demo footnote. No recovery from believing TAE 0,0 %. |
| 10 | Help and Documentation | 2 | Benchmark questions are good. No help on the actual decision. PCA unexplained. |
| **Total** | | **17/40** | **Poor** |

## Anti-Patterns Verdict

**LLM assessment**: Tokens are mostly on-spec (Canvas/Card, hairline, ≤16px radius). Composition is generated dashboard: four identical icon-tile KPI cards, banned hero-metric (77 / 100), then eight more equal-weight panels. Nested cards inside the offer and the negotiation dossier. Tiny uppercase kicker on the argumentario. PCA scatter dumped onto a treasurer screen.

**Deterministic scan (CLI)**: `detect.mjs --json` on `app/(panel)/empresa` and `components/grifo/company` returned `[]` (exit 0). Source scan clean.

**Visual overlays**: Injection succeeded on `/empresa` (COMP_0357). Overlay reported **30 anti-patterns**: nested-cards × 20, layout-transition × 4, line-length × 3, cramped-padding × 1, text-overflow × 1 (false positive: intended `truncate`), overused-font (geist), skipped-heading (h2 → h4 on Informe de negociación). Overlay was visible in the Playwright tab; live-server on port 8400 was stopped after capture.

## Overall Impression

Cartera ranks. Mi score stacks. The same design system proves it can feel clean; this page makes the treasurer rank nine equal panels and reconcile three different offer amounts before they can ask for money.

## What's Working

1. Surface language of the design system is mostly right: hairline cards, tabular figures, status tokens.
2. `Tu oferta este mes` is the only card that knows the job (decision sentence, tenor, CTA).
3. Benchmark row copy is human (`¿Queda caja tras pagar la operación?`).

## Priority Issues

**[P0] The offer cannot be trusted**
- **What**: Same screen shows 236.000 €, 137.000 €, and 110.000 € as “the” limit; TAE 0,0 % vs 0,1 %; Vigilar vs Banda A vs banda B.
- **Why it matters**: Marta cannot decide in 60s if the number on the button is a lie.
- **Fix**: One line limit (`decision.limit`), one drawable amount per tenor (`menu.maxAmount`), one TAE (the selected tenor). Lead with `decisionNarrative` so the sentence uses the same euros as the table.
- **Suggested command**: `$impeccable distill` + `$impeccable clarify`

**[P1] No ranking: eight equal panels, three scores**
- **What**: PymeKpis 4-up (banned hero-metric grid), BandLadderCard repeats 77/100, then seven more h2s. DESIGN cap of three ranks is broken. Nested cards in the offer simulator.
- **Why it matters**: Cartera feels clean because one question owns the fold.
- **Fix**: Three levels only. Lead = offer + score. Act = tenor + Pedir. Evidence = one DetailStack (already exists for the partner file).
- **Suggested command**: `$impeccable distill`

**[P1] Pedir circulante treats consent as a toggle**
- **What**: Click shares with the partner. Button is size sm beside a lock essay. KPI said “Opt-in activo: nadie ve tu nota” while private.
- **Why it matters**: High-stakes with no recap.
- **Fix**: Recap in one line next to a default-size primary: partner will see score and limit, not movements.
- **Suggested command**: `$impeccable clarify`

**[P2] Charts/tables are the wrong density**
- **What**: Sparse score line, 12 micro percentile bars, PCA scatter, a sales table arguing 0,0 % vs 8,2 %.
- **Why it matters**: “No good charts” is a ranking problem, not a Recharts shortage.
- **Fix**: One trend tied to the score. Top 5 levers like HotList. Kill PCA from this route. Negotiation collapsed, no client-side 8,2 % invention.
- **Suggested command**: `$impeccable distill`

**[P2] Copy is for the jury, not the CFO**
- **What**: H1 “Lo que ve la empresa antes de pedir nada”. “5 combinaciones factibles”. “Argumentario certificado…”. “Previsión en sombra”.
- **Why it matters**: Jordan reads a demo. Marta does not hear “puedes pedir hasta X”.
- **Fix**: Job line like Cartera. Cut kickers, opt-in jargon, and duplicated explanations.
- **Suggested command**: `$impeccable clarify`

## Persona Red Flags

**Alex (Power User)**: 4,100px of duplicate 12-row grids; Pedir is not keyboard-primary; Imprimir dossier = window.print(). Will bounce to Cartera.

**Jordan (First-Timer)**: H1 does not say what to do. Vigilar vs Banda A vs TAE 0,0 %. PCA Eje 1 is alien. Abandons before the fold’s second card.

**Marta, tesorera/CFO**: Needs cuánto, plazo, precio, ¿pido? Fold gives 77, 236k, 9.912 €/año, 100 % Privado. The decision sentence disagrees with Hasta and with the selected tenor.

## Minor Observations

- Negotiation uppercase tracking kicker is the banned eyebrow.
- Nested cards: simulator, argumentario, escalera.
- Alerts as a full card for a one-line empty state.
- Raw float in ladder marker title.
- PymeKpis / NegotiationReport violate “UI no calcula.”
- text-overflow overlay hit is a false positive (`truncate`).

## Questions to Consider

- If Marta may see one card before asking, why is it four KPIs and not Tu oferta este mes?
- Why should a treasurer ever see Eje 1 / Eje 2 / Eje 3?
- Which number is the product: 236.000 €, 137.000 €, or 110.000 €?
