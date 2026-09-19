# Product — Grifo (Embat · X-Ray)

Strategic brief. Answers **who / what / why**. Visual decisions live in
`DESIGN.md`; technical conventions in [`AGENTS.md`](./AGENTS.md); the scoring
and decision spec in [`docs/SOURCE.md`](./docs/SOURCE.md).

## Register

product

## Users

**Primary — risk analyst at the financing partner (the lender).** Sits with a
portfolio of ~1.286 Spanish SMEs that gets re-scored every month. Opens the
product to answer two questions in order: *what changed this month, and which
companies do I need to act on?* Then, for each one: *can I defend this number
to my credit committee?* They are numerate but time-poor; they triage a list,
drill into a handful, and need the reasoning to be inspectable, not trusted on
faith. The portfolio view is home; the company file is the drill-down.

**Secondary — the SME.** A read-only view of its own limit, price, and the
plain-language reason behind it. Not the surface we optimise first.

**Third, and specific to this build — the hackathon judge.** A first-time user
with five minutes and none of the domain vocabulary. Every screen the primary
user needs must also be legible to someone who has never read `SOURCE.md`. This
is the constraint that makes "approachable" a requirement rather than a
preference.

## Product Purpose

Grifo turns the bank and ERP data Embat already holds into a working-capital
credit limit that recalculates itself every month, with the price and the
action attached. Three stages, each visible in the UI:

1. **Score** — per company × month. Block A cash capacity (weight 45), block B
   payment reliability (30), block C customer/supplier dependency (25), plus a
   group aval/contagion adjustment capped at ±20 points. Every score carries a
   separate **confidence** figure.
2. **Decision** — six hard eligibility gates, then the limit `L`, the maximum
   tenor `T_max`, and the TAE, with a feasible-region menu of (amount, term,
   price) combinations.
3. **Action** — `abrir` / `ampliar` / `mantener` / `reducir` / `cerrar`, with
   hysteresis so the tap doesn't oscillate on one noisy month.

**Success looks like:** the analyst goes from portfolio to a decision they can
defend in under a minute, and the judge believes the decision without reading
the spec. The product's value is the decision *and* the paper trail behind it —
neither one alone is the product.

## Brand Personality

**Clear, reassuring, approachable.** Credit risk made legible to someone who
isn't a credit analyst, without dumbing it down for someone who is.

- **Voice:** plain-language sentences before notation. "Le queda un 14 % de
  caja después de pagar la operación — sano, el umbral es 10 %" before
  `A1 = 0,14`. Every number carries its unit and the threshold it's being
  judged against.
- **Tone:** stating findings, not selling them. No hedging, no hype, no
  exclamation. When the model doesn't know, it says so.
- **Emotion:** calm confidence. The analyst should feel the tool has already
  done the triage; the judge should feel the decision is grounded.

## Anti-references

The single positive reference the team supplied is
[`docs/reference-dashboard.png`](./docs/reference-dashboard.png): light canvas,
white cards, hairline borders, muted labels, small chart accents, one dark
primary action. The anti-references below are derived as its inverse, not
volunteered independently — treat the screenshot as the arbiter in any conflict.

- **Anything darker, denser, or more cryptic than the reference.** No terminal
  aesthetic, no green-on-black, no unlabelled tickers. Density serves the
  analyst; opacity does not.
- **Legacy bank chrome.** Navy gradients, beveled toolbars, gray-on-gray data
  grids, screens that look like they were built in 2004.
- **Fintech hype.** Neon gradients, glassmorphism, oversized animated counters,
  a gradient-text hero metric.
- **Generic AI-SaaS template.** A three-up grid of identical icon-cards, purple
  gradients, a marketing hero bolted onto an app.
- **Raw model machinery as the default view.** A table of `A1 … D5` with weights
  and no sentences is the failure mode this product exists to avoid. The
  variable IDs are a disclosure layer, never the first thing on screen.

## Design Principles

1. **The decision leads; the evidence is one interaction away.** Action, limit,
   price, and the sentence explaining them come first. The twelve-variable
   contribution cascade is always reachable, never the opening move.
2. **Plain language before notation.** Every indicator gets a sentence a
   non-specialist can read. The formula and the variable ID are available for
   the analyst who wants them, and subordinate in the hierarchy.
3. **Every number shows what it's judged against.** A score of 68 means nothing
   alone. Show the band it sits in, the threshold it passed or missed, and what
   would move it. This is what makes a decision defensible in committee.
4. **Confidence is displayed, never silently baked in.** Coverage is uneven
   across the portfolio by design — only 524 companies have visible debt
   instalments. "No opinamos" is a valid, visible answer, and it is more
   trustworthy than a confident-looking number built on three months of data.
5. **Earned familiarity.** Standard app-shell patterns, one consistent component
   vocabulary, no invented affordances. The interface should disappear into the
   task; novelty here costs trust and buys nothing.

## Accessibility & Inclusion

- **WCAG 2.2 AA minimum.** Body text ≥ 4.5:1, large text ≥ 3:1, placeholders
  held to the same 4.5:1 as body.
- **Status is never encoded by colour alone.** The sana / vigilar / riesgo /
  sin datos traffic light is core to the portfolio view, so every state carries
  a text label and a distinct shape or glyph in addition to its colour. A
  screenshot converted to greyscale must still be readable.
- **Colourblind-safe status palette.** Avoid the pure red/green pairing;
  deuteranopia and protanopia are the most common forms and that pairing is
  exactly what they collapse. Build the ramp so the states differ in lightness,
  not just hue.
- **`prefers-reduced-motion` honoured on every transition**, with a crossfade or
  instant change as the alternative.
- **Projector-legible.** The demo will be shown on a projector in a bright room:
  favour the darker end of the text ramp, and don't rely on 1px hairlines to
  carry meaning that matters.

---

## Core flow (happy path)

1. Analyst opens the **portfolio**: companies with status, score, trend,
   current limit, and this month's action. Sorted so the ones that changed are
   on top.
2. Filters or searches down to the ones that need attention (state, action,
   direction of travel, group).
3. Opens a **company file**: the decision (action, limit, tenor menu, TAE) with
   the sentence behind it; the score with its confidence and band; the trend
   over time; the alerts fired and when.
4. Expands the **cascade** — which variables moved the score since last month
   and by how much, each with its plain-language reading.
5. Leaves able to state, in one sentence, why this company's tap opened,
   narrowed, or closed this month.

## Out of scope (for now)

- The SME-facing view (secondary user; build the analyst shell first).
- Authentication flows beyond what the Better Auth template already provides.
- Email/Slack alert delivery (listed as a bonus in `docs/SOURCE.md` §3).
- Writing back to the model. The UI reads scoring output; it does not tune
  parameters.

## Project-specific stack

Everything in [`AGENTS.md`](./AGENTS.md) applies. Additions for this project:

- **Scoring engine** in `lib/features/scoring/` (`engine.ts`, `model.ts`,
  `contracts.ts`, `backtest.ts`, `ingest.ts`), driven by `pnpm scoring:*`
  scripts. `ScoreResultDTO` in `contracts.ts` is the shape the UI renders.
- **Python analysis** in `analysis/` — read `analysis/FINDINGS.md` for the
  dataset's traps before building anything that displays its numbers.
- **Charts** with `recharts` (already installed) via `components/ui/chart.tsx`.
