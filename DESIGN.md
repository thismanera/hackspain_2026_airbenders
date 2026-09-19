---
name: Grifo
description: A credit-committee memo you can click through — the recommendation up top, the working shown below.
colors:
  canvas: "oklch(0.985 0 0)"
  card: "oklch(1 0 0)"
  ink: "oklch(0.145 0 0)"
  ink-muted: "oklch(0.556 0 0)"
  hairline: "oklch(0.922 0 0)"
  primary: "oklch(0.205 0 0)"
  primary-ink: "oklch(0.985 0 0)"
  status-healthy: "oklch(0.72 0.14 168)"
  status-healthy-fg: "oklch(0.46 0.1 168)"
  status-healthy-surface: "oklch(0.96 0.03 168)"
  status-watch: "oklch(0.82 0.15 78)"
  status-watch-fg: "oklch(0.47 0.1 75)"
  status-watch-surface: "oklch(0.96 0.05 85)"
  status-risk: "oklch(0.6 0.2 25)"
  status-risk-fg: "oklch(0.48 0.18 25)"
  status-risk-surface: "oklch(0.96 0.02 20)"
  status-none: "oklch(0.78 0 0)"
  status-none-fg: "oklch(0.5 0 0)"
  status-none-surface: "oklch(0.97 0 0)"
  chart-1: "oklch(0.72 0.14 168)"
  chart-2: "oklch(0.58 0.2 293)"
  chart-3: "oklch(0.68 0.14 237)"
  chart-4: "oklch(0.82 0.15 78)"
  chart-5: "oklch(0.55 0.03 250)"
typography:
  metric:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.55
    letterSpacing: "normal"
  label:
    fontFamily: "Geist, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.35
    letterSpacing: "normal"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  pill: "999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "34px"
  button-primary-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.primary-ink}"
  button-secondary:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "8px 14px"
    height: "34px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
    height: "34px"
  badge-status-healthy:
    backgroundColor: "{colors.status-healthy-surface}"
    textColor: "{colors.status-healthy-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-status-watch:
    backgroundColor: "{colors.status-watch-surface}"
    textColor: "{colors.status-watch-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-status-risk:
    backgroundColor: "{colors.status-risk-surface}"
    textColor: "{colors.status-risk-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  badge-status-none:
    backgroundColor: "{colors.status-none-surface}"
    textColor: "{colors.status-none-fg}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "2px 8px"
  nav-item:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
  nav-item-active:
    backgroundColor: "{colors.status-none-surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    padding: "6px 10px"
---

# Design System: Grifo

## 1. Overview

**Creative North Star: "The Credit Committee Memo"**

A good credit memo puts the recommendation in the first line and spends the rest
of the page earning it. Nothing on the page is there to impress; every mark is
either the recommendation, the evidence, or the label that tells you which is
which. Grifo is that memo made clickable. The analyst reads the action first —
open, widen, hold, reduce, close — and then, at their own pace, walks down into
the score, the confidence, and the twelve variables that produced it. The
interface's job is to make that descent feel short.

Visually this means an almost-white room with the furniture drawn in hairlines.
The canvas is one lightness step below the cards, so panels read as objects
without a single drop shadow doing the work. Type is one family at five fixed
sizes. Colour is rationed: on a screen showing forty companies, the only
saturated pixels are the status dots, the trend deltas, and the chart series —
everything else is ink, muted ink, and hairline. When something is coloured
here, it is because a number needs attention, never because a surface needed
decorating.

What this system rejects, straight from PRODUCT.md: legacy bank chrome, the
fintech hype palette, the generic AI-SaaS template, and — the one that matters
most for this product — raw model machinery as the default view. A grid of
`A1 … D5` with weights attached is not transparency, it is abdication. The
variable IDs exist in this system, but they are a disclosure layer reached by
choice, always subordinate to a sentence a non-specialist can read.

**Key Characteristics:**

- Near-white canvas (`oklch(0.985 0 0)`) with pure-white cards; separation by
  lightness step plus a 1px hairline, never by shadow.
- One typeface (Geist) at five fixed rem sizes. No fluid `clamp()` anywhere.
- Colour reserved for status, trend, and data series. Ink and hairline carry
  everything else.
- A four-state status vocabulary ordered by lightness so it survives greyscale.
- All figures set in tabular numerals so columns align and digits don't jitter.

## 2. Colors

A neutral greyscale room with a rationed four-state signal palette and a
five-hue categorical set for charts; nothing decorative is coloured.

### Primary

- **Ink Black** (`oklch(0.205 0 0)`): the single primary action per view —
  "Ver ficha", "Exportar CSV". Near-black rather than a brand hue, because in a
  risk tool the loudest thing on screen should be the status of a company, not
  a button. Darkens to Ink (`oklch(0.145 0 0)`) on hover.

### Secondary

- **Signal Teal** (`oklch(0.72 0.14 168)`): the healthy state and the first
  chart series. Deliberately teal rather than pure green so it separates from
  Alert Rose for red-green colourblind users. This is also `chart-1`; the
  "good" colour and the "first series" colour are the same token on purpose, so
  a rising line and a healthy badge speak with one voice.

### Tertiary

- **Signal Amber** (`oklch(0.82 0.15 78)`): the watch state and `chart-4`. The
  lightest of the three signals — a company under observation should look
  lighter, not louder, than one in risk.
- **Alert Rose** (`oklch(0.6 0.2 25)`): the risk state. The darkest signal, so
  "worse" reads as "heavier" even before hue is processed.
- **Series Violet** (`oklch(0.58 0.2 293)`) and **Series Sky**
  (`oklch(0.68 0.14 237)`): categorical chart hues only (`chart-2`, `chart-3`).
  Never used for state. A violet pixel in this product means "a second data
  series", nothing more.

### Neutral

- **Canvas** (`oklch(0.985 0 0)`): the application background behind all
  panels. Chroma is exactly zero — no warm tint, no cool tint.
- **Card** (`oklch(1 0 0)`): every panel, the sidebar, and the top bar. The
  sidebar shares the card colour and lets the canvas do the separating.
- **Ink** (`oklch(0.145 0 0)`): headings, figures, and any number a decision
  rests on.
- **Muted Ink** (`oklch(0.556 0 0)`): labels, units, secondary sentences, table
  header cells, and placeholders. 4.74:1 on Card and 4.56:1 on Canvas, so it
  clears AA in both places — this is the floor, not a starting point for
  something lighter.
- **Hairline** (`oklch(0.922 0 0)`): every border, divider, table rule, and
  input stroke. One border colour for the whole system.

### Named Rules

**The Rationed Colour Rule.** On any screen, saturated pixels belong to exactly
three things: status indicators, trend deltas, and chart series. If a surface,
a heading, an icon, or a button is coloured, it is wrong. Count them — a
portfolio table of forty rows should have forty status dots and no other colour.

**The Never-Colour-Alone Rule.** Every status is carried by at least two
channels: its colour, plus a text label, plus (in dense contexts like the
portfolio table) a distinct dot shape. Render any screen in greyscale; if a
state becomes ambiguous, the screen is broken. This is a hard requirement from
PRODUCT.md, not a preference.

**The Lightness-Order Rule.** Risk (`L 0.60`) is darker than Healthy
(`L 0.72`), which is darker than Watch (`L 0.82`). Never reassign these so that
a worse state is lighter than a better one; the ordering is the accessibility
mechanism.

## 3. Typography

**Body Font:** Geist (with `system-ui`, `sans-serif`)
**Label/Mono Font:** Geist Mono (with `ui-monospace`, `monospace`) — reserved
for parameter hashes, company IDs, and raw variable keys like `A1`, never for
prose or figures.

**Character:** One neutral grotesque doing every job. Geist is legible at 12px,
has real tabular figures, and carries no personality of its own — which is the
point. In a tool whose credibility rests on its numbers, a typeface with
opinions is a liability. Hierarchy comes from weight and size, never from a
second family.

### Hierarchy

- **Metric** (600, 1.75rem/28px, 1.15, -0.02em, `tabular-nums`): the one figure
  a card exists to show — a score, a limit, a TAE. One per card, maximum.
- **Headline** (600, 1.125rem/18px, 1.35, -0.01em): page titles and the company
  name on a detail view.
- **Title** (600, 0.875rem/14px, 1.4): card headers and section headings. Same
  size as body, distinguished by weight — a dashboard has too many headings for
  size-based hierarchy to work.
- **Body** (400, 0.875rem/14px, 1.55): sentences, table cells, form values.
  Explanatory prose caps at 65–75ch; table and data rows may run wider.
- **Label** (500, 0.75rem/12px, 1.35): field labels, units, axis ticks, badge
  text, sidebar nav. Set in Muted Ink.

### Named Rules

**The Tabular Figures Rule.** Every number — scores, euros, percentages, dates,
deltas, counts — is set with `tabular-nums`. Columns must align down the page
and a value must not jitter when it changes from 68 to 71. This applies to
figures inside prose too.

**The Fixed Scale Rule.** Five sizes, all in fixed rem. No `clamp()`, no fluid
typography anywhere in this product. A heading that shrinks inside a sidebar or
a narrow panel looks broken, not responsive; responsiveness here is structural
(columns collapse, the sidebar folds), never typographic.

**The Sentence-First Rule.** Every indicator is introduced by a sentence in
plain Spanish before its notation appears. `A1` may sit beside "Margen de caja"
in Muted Ink at Label size; it may never replace it as the primary reading.

## 4. Elevation

This system is flat. Depth is conveyed entirely by a two-step lightness
relationship — Canvas behind, Card in front — reinforced by a 1px Hairline
border on every panel. There is no ambient shadow vocabulary and no elevation
scale. A card is legible as an object because it is lighter than the thing
behind it and has a drawn edge, which is exactly how the reference screenshot
works.

### Shadow Vocabulary

- **Contact** (`box-shadow: 0 1px 2px oklch(0 0 0 / 0.04)`): the only permitted
  resting shadow. Optional, used on cards that sit directly on the canvas to
  give the hairline a touch of weight. Blur is 2px; it should be invisible
  until you look for it.
- **Overlay** (`box-shadow: 0 8px 24px oklch(0 0 0 / 0.08)`): popovers,
  dropdowns, dialogs, and command palettes only — surfaces that genuinely float
  above the page. Never on a card, never on a button.

### Named Rules

**The No Ghost-Card Rule.** A 1px border and a soft wide drop shadow may never
appear on the same element. Pick one: the border (the default here), or, for
true overlays, the shadow. Any resting shadow with a blur radius of 16px or
more is forbidden outright — it is the single clearest tell of generated UI.

**The Flat-At-Rest Rule.** Surfaces are flat at rest. Elevation changes are a
response to state (an overlay opening, a row being dragged), never a decoration
applied to a static card.

## 5. Components

### Buttons

- **Shape:** Gently curved (8px, `{rounded.md}`), 34px tall, Label typography.
- **Primary:** Ink Black fill, Card-white text, 8px/14px padding. One per view;
  on the portfolio that is "Exportar CSV", on a company file it is the decision
  action. Hover darkens the fill to Ink; there is no shadow and no lift.
- **Secondary:** Card-white fill, Ink text, 1px Hairline border. Hover fills
  with `{colors.status-none-surface}`. This is the default for almost every
  button in the product.
- **Ghost:** transparent, Muted Ink text, no border. Icon buttons and toolbar
  actions. Hover fills with `{colors.status-none-surface}` and darkens text to
  Ink.
- **Focus:** a 2px ring in `{colors.ink-muted}` offset by 2px, on every variant.
  Focus is never removed, and never replaced by the hover treatment.
- **Transitions:** 150ms on background and border colour only. No transform, no
  scale, no translate.

### Chips

- **Status badge:** pill (`{rounded.pill}`), 2px/8px padding, Label typography,
  `-surface` background with `-fg` text from the matching status triplet.
  Always contains the state word ("Sana", "Vigilar", "Riesgo", "Sin datos") —
  a bare coloured pill is prohibited.
- **Status dot:** an 8px mark in the `-solid` colour, used in the portfolio
  table where a full badge would cost too much width. Shape differs by state so
  the column reads in greyscale: filled circle (healthy), hollow ring (watch),
  filled square with rounded corners (risk), small dash (none). The dot is
  always paired with the state as accessible text.
- **Filter chip:** Secondary-button treatment at pill radius; selected state
  swaps to Ink Black fill with Card-white text.

### Cards / Containers

- **Corner Style:** 14px (`{rounded.xl}`) — panels are the softest thing in the
  system; nothing exceeds 16px.
- **Background:** Card white on the Canvas.
- **Shadow Strategy:** Contact only, or nothing. See Elevation.
- **Border:** 1px Hairline on all sides. Never a thicker coloured edge on one
  side — side-stripe accents are banned.
- **Internal Padding:** 16px (`{spacing.lg}`); 12px for dense metric cards.
  Header, body, and footer are separated by Hairline dividers, not by shadow.
- **Nesting:** cards do not nest. A panel inside a panel is a sectioned card
  with a divider.

### Inputs / Fields

- **Style:** Card-white fill, 1px Hairline stroke, 8px radius, 34px tall, Body
  typography. Placeholders in Muted Ink — the same 4.5:1 as body text, never
  lighter.
- **Focus:** the border darkens to Ink Muted and a 2px ring appears at 2px
  offset. No glow, no colour shift.
- **Error:** border and helper text in `{colors.status-risk-fg}`, with the
  message stated in words below the field. The colour alone never signals the
  error.
- **Disabled:** 50% opacity, `not-allowed` cursor, no border change.

### Navigation

- **Sidebar:** Card white against the Canvas, separated by a 1px Hairline, with
  uppercase section labels (Label typography, Muted Ink) grouping the items.
- **Item:** Label typography in Muted Ink, 8px radius, 6px/10px padding, 16px
  leading icon. Hover fills `{colors.status-none-surface}`.
- **Active:** `{colors.status-none-surface}` fill with Ink text at weight 600.
  The active state is a filled pill, not a coloured left border.
- **Top bar:** Card white, 1px Hairline underneath, holding the breadcrumb on
  the left and the view's controls (date range, export) on the right.
- **Mobile:** the sidebar collapses to a sheet; the top bar keeps the
  breadcrumb and a trigger. Nothing about the type scale changes.

### Score Cascade (signature component)

The component the product is built to show: how the score moved since last
month, variable by variable. A vertical list of rows, each carrying the
indicator's plain-language name at Body, its variable ID (`A1`) at Label in
Muted Ink, a horizontal bar whose length is the contribution and whose colour
is Signal Teal for positive and Alert Rose for negative, and the signed delta
at Metric-weight in tabular figures. Rows sort by absolute contribution, so the
reason a limit changed is always the first row. Confidence renders as a
separate muted track behind the bar rather than as transparency on the bar
itself — a low-confidence contribution must never look like a small one.

## 6. Do's and Don'ts

### Do:

- **Do** separate surfaces with the Canvas/Card lightness step plus a 1px
  Hairline. That pairing is the entire depth system.
- **Do** set every figure with `tabular-nums`, including figures inside
  sentences.
- **Do** pair every status colour with its state word, and in dense contexts
  with a distinct dot shape. Greyscale must stay readable.
- **Do** show the threshold next to the number: "14 %, sano (umbral 10 %)", not
  "14 %".
- **Do** lead with the decision and the sentence behind it; put the twelve-
  variable cascade one interaction away.
- **Do** display confidence as its own visible figure. "Sin datos" is a valid
  state with its own status triplet, and it is always preferable to a confident
  number built on three months of history.
- **Do** keep all transitions at 150–250ms on colour and opacity. Motion is
  the same for everyone: do not gate it on `prefers-reduced-motion`; give a
  visible pause control when an animation loops.
- **Do** use skeletons shaped like the content that is loading; never a spinner
  in the middle of a panel.

### Don't:

- **Don't** use `border-left` or `border-right` above 1px as a coloured accent
  on cards, rows, or alerts. Use the full Hairline border and a status dot.
- **Don't** combine a 1px border with a drop shadow of 16px blur or more. That
  ghost-card pairing is banned outright.
- **Don't** round cards past 16px, or any surface past `{rounded.xl}`.
- **Don't** apply `background-clip: text` with a gradient. No gradient text
  anywhere, least of all on a score.
- **Don't** build the hero-metric template — big number, small label,
  supporting stats, gradient accent. A score needs its band and its threshold,
  which is a different component.
- **Don't** reach for **legacy bank chrome** (navy gradients, beveled toolbars,
  gray-on-gray data grids), **fintech hype** (neon gradients, glassmorphism,
  oversized animated counters), or the **generic AI-SaaS template** (a three-up
  grid of identical icon-cards, purple gradients). All three are named
  anti-references in PRODUCT.md.
- **Don't** show **raw model machinery as the default view** — a table of
  `A1 … D5` with weights and no sentences is the failure mode this product
  exists to avoid.
- **Don't** introduce a second typeface, a display face, or fluid `clamp()`
  sizing.
- **Don't** use Series Violet or Series Sky to mean anything about state; they
  are categorical chart hues only.
- **Don't** animate a number counting up on load. The analyst is reading, not
  watching.
- **Don't** reintroduce a dark theme casually. The product is light-only and
  forced light in `app/providers.tsx`; a dark ramp means re-deriving every
  token including the four status triplets.
