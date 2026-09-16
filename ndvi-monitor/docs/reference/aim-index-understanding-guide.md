# AIM — Field Index Understanding: Implementation Guide

**Purpose:** A step-by-step build guide for an AI coding agent (Claude Code, Cursor, etc.) to implement all 6 recommendations for helping farmers understand and combine NDVI/EVI/SAVI/NDWI/LSWI/GNDVI into a clear result for their field.

**Read first:** This guide assumes the agent has access to the existing `ee-data` Supabase Edge Function, `growthStage.ts` (`statusFromNdvi`), and the frontend index config (`BANDS`/`VIS` — mirrors `src/config.js INDICES`). Reference those files directly rather than guessing their shape — read them before writing any new code.

**Build order matters.** Features 3 and 6 depend on the plain-language thresholds built in Feature 1. Feature 4 (composite score) depends on Feature 2 (growth-stage index selection) being in place first, since the composite weighting changes by growth stage. Build in the order below, not in parallel.

---

## Feature 0: UI Design System (build this before touching components)

**Goal:** Give the AI coding agent concrete visual direction instead of improvising generic dashboard styling. AIM's actual users check this outdoors, in bright sunlight, often on mid/low-end Android phones — legibility and one-glance clarity matter more than density or decoration.

### Design direction

Ground the palette in rice farming itself rather than a generic SaaS look — paddy green, harvest gold, water blue, soil brown — so the app's visual language matches what a farmer already recognizes, rather than an imported dashboard aesthetic.

**Color tokens** (add to `tailwind.config.js` under `theme.extend.colors`):

```js
colors: {
  paddy: {   // primary brand / healthy states
    50:  '#f2f8ed', 500: '#5a8f3c', 700: '#3f6629', 900: '#2a4519',
  },
  harvest: { // warnings, moderate states, accent
    50:  '#fdf6e8', 500: '#d9a441', 700: '#a97a24',
  },
  paddyWater: { // water/moisture indices (NDWI, LSWI)
    50:  '#eef6fb', 500: '#3f7ea6', 700: '#2c5c7d',
  },
  clay: {    // unhealthy/dead states, soil brown
    50:  '#faf4ee', 500: '#a8724f', 700: '#7a4f34',
  },
  ink: '#2b2620',   // primary text — warm near-black, not pure #000
  paper: '#fbf9f5', // app background — warm off-white, not pure #fff
}
```

Reuse these consistently: `paddy` for healthy/good, `harvest` for moderate/caution, `clay` for unhealthy/dead — this maps directly onto the existing 4-band health system (Feature 1) and should be the ONLY palette used for health-status color-coding across every index, so a farmer builds one consistent color instinct (green=good, brown=bad) rather than a different scheme per screen.

**Typography:**

- Body/UI: a highly legible geometric sans already in your stack (system font stack or Inter) at a minimum 16px base — never smaller, given outdoor/mobile reading conditions
- Numbers (the composite score, index values): a slightly heavier weight or tabular-nums variant so scores don't visually jitter/reflow between renders
- Khmer language support: confirm the chosen font stack has full Khmer glyph coverage (e.g., Noto Sans Khmer as fallback) — test this explicitly, don't assume system defaults cover it

**Layout principles:**

- Mobile-first, single-column — this is a phone app first, not a desktop dashboard shrunk down
- One primary action/reading per screen fold — the composite score (Feature 3) should be the first and largest thing visible with no scrolling required
- Generous touch targets (min 44px) — farmers may be interacting with gloves or in sun glare, not precision mouse clicks
- Minimal motion — a subtle fade/scale on score updates is fine; avoid decorative animation that drains battery or distracts from the actual reading

### Component specs

**Composite Score Card (Feature 3)** — the default field view:

```
┌─────────────────────────────┐
│  [large score number/badge]  │   ← 48-64px, colored by band (paddy/harvest/clay)
│  "Moderately developed"       │   ← 20px, ink color, the plain-language phrase
│  Field: [field name]          │   ← 14px, muted
│  [Show details ▾]             │   ← tap target, expands Feature 6
└─────────────────────────────┘
```

Use a single rounded card (`rounded-2xl`, soft shadow `shadow-sm`) on `paper` background — one clear focal object, not a grid of competing widgets.

**Discrepancy Banner (Feature 4)** — visually distinct from the score card, NOT the same green/harvest/clay coding (avoid confusing "this is a warning about a mismatch" with "this index reads unhealthy"):

```
┌─────────────────────────────┐
│ ⚠ Canopy looks healthy, but   │   ← harvest-50 background, harvest-700 text/icon
│   soil moisture is dropping   │
└─────────────────────────────┘
```

Place directly below the score card, always visible when present — never inside the collapsed "Show details" section.

**Index Legend (Feature 5)** — reuse the existing NDVI infographic layout exactly (4 horizontal panels, plant illustrations, soil strip) for all 6 indices. Do not redesign this — the whole point of Feature 5 is visual consistency with what's already built. Only the range labels, subtitle text, and generated illustration differ per index.

**Progressive Disclosure Toggle (Feature 6):**

- Collapsed state: score card + discrepancy banner only, "Show details ▾" button beneath
- Expanded state: reveals the 6-tab index switcher below, each tab showing its `<IndexLegend>` (Feature 5) + plain-language phrase (Feature 1)
- Use a simple height-transition (`transition-all duration-200`), not a full-page navigation — this should feel like unfolding more of the same screen, not going somewhere else

### Accessibility floor (non-negotiable, per any UI work here)

- Color is never the only signal — every health-band color pairing must also carry a text label (e.g., not just a green dot, but "Healthy" next to it) since color-blind users and washed-out outdoor screens can't rely on hue alone
- Visible focus states on all interactive elements (toggle, tabs)
- Text contrast meets WCAG AA against `paper`/card backgrounds at minimum

---

## Feature 1: Plain-Language Index Translation Layer

**Goal:** Turn a raw number like "NDVI: 0.45" into "Your rice canopy is moderately developed — slightly behind typical growth for this stage."

### Step 1.1 — Define threshold-to-phrase tables (one per index)

Create a new shared module, e.g. `src/shared/indexTranslations.ts` (frontend) and a matching Deno version in `supabase/functions/_shared/indexTranslations.ts` if the phrase needs to be returned from the Edge Function rather than computed client-side. Pick ONE location as source of truth — don't duplicate the same thresholds in two places that can drift apart. Recommended: compute server-side in `ee-data`, return the phrase alongside the raw value, since the Edge Function already owns the raw computation.

For each index, define the same 4-band structure already used in the NDVI infographic (`Dead/Unhealthy/Moderate/Healthy`), with index-specific ranges pulled from `VIS` min/max in `ee-data`:

```ts
// _shared/indexTranslations.ts
export const INDEX_BANDS: Record<
  string,
  { max: number; label: string; phrase: string }[]
> = {
  ndvi: [
    { max: 0, label: "dead", phrase: "This area shows no living vegetation." },
    { max: 0.33, label: "unhealthy", phrase: "Canopy is sparse or stressed." },
    { max: 0.66, label: "moderate", phrase: "Canopy is moderately developed." },
    { max: 1, label: "healthy", phrase: "Canopy is dense and healthy." },
  ],
  // ndwi, lswi, savi, evi, gndvi: same shape, use each index's own VIS min/max
  // as band boundaries — do NOT reuse ndvi's -1..1 range for indices with
  // different natural ranges (e.g. savi/evi run 0..1 in this app's VIS config).
};

export function translateIndexValue(
  index: string,
  value: number,
): { label: string; phrase: string } {
  const bands = INDEX_BANDS[index];
  const band = bands.find((b) => value <= b.max) ?? bands[bands.length - 1];
  return { label: band.label, phrase: band.phrase };
}
```

### Step 1.2 — Wire into `ee-data` responses

In `actionGetRecentIndexValue`, `actionGetFieldStatus`, and `actionGetAllFieldStatuses`, call `translateIndexValue(index, value)` and add `label`/`phrase` fields to the returned object, alongside the existing raw `value`. Do not remove the raw value — power users and the trend chart still need it.

### Step 1.3 — Frontend: display phrase as primary, number as secondary

In whichever Vue component currently renders `NDVI: {{ value }}`, change to show `phrase` as the main text and the raw value + label as small secondary text (e.g., "0.45 · moderate"). This is a display-only change once step 1.2 ships the fields.

**Done when:** every index tab shows a plain-language sentence, not just a number, using the same 4-band logic already established for NDVI.

---

## Feature 2: Growth-Stage-Aware Primary Index Selection

**Goal:** Auto-pick which index is shown as the "main" reading based on the field's growth stage, since NDVI is unreliable on bare soil / newly flooded fields.

### Step 2.1 — Read the existing growth-stage logic

Open `growthStage.ts` and confirm what stages `statusFromNdvi(ndvi, plantingDate)` already recognizes (e.g., early growth, vegetative, mature). Do not invent a new stage system — extend the existing one.

### Step 2.2 — Define stage → primary-index mapping

Add a small mapping, e.g. in `_shared/growthStage.ts` or a new `_shared/primaryIndex.ts`:

```ts
export function primaryIndexForStage(stage: string | null): string {
  switch (stage) {
    case "flooding": // just transplanted / field flooded
    case "early_growth": // soil still visible through canopy
      return "savi"; // corrects for soil brightness
    case "vegetative":
    case "mature":
    default:
      return "ndvi"; // canopy dense enough for standard NDVI
  }
}
```

If `growthStage.ts` doesn't currently expose a "flooding" stage distinct from "early_growth", check whether `detectPlantingDate`'s LSWI-jump detection (already in `ee-data`) can supply that signal — reuse it rather than re-detecting flooding separately.

### Step 2.3 — Wire into field status endpoints

In `actionGetFieldStatus` and `actionGetAllFieldStatuses`, after computing `stage`, call `primaryIndexForStage(stage)` to decide which index's value to compute/return as the field's headline reading — instead of always hardcoding NDVI.

**Note on cost:** this doesn't add extra EE calls — it changes _which_ index gets computed as the primary one, not how many are computed. No conflict with the cost-control plan.

### Step 2.4 — Frontend: show the auto-selected index with a one-line reason

When rendering the field's headline status, if the selected index isn't NDVI, show a small explanatory line: _"Your field is in early growth, so we're showing SAVI, which accounts for visible soil."_ Pull this reason text from a lookup table keyed by the same stage→index mapping from Step 2.2 (don't hardcode English strings inline in the Vue component — keep it alongside the mapping so it stays in sync).

**Done when:** a farmer viewing a field in early growth automatically sees SAVI as the headline number (not a hidden-away tab), with a short reason why.

---

## Feature 3: Composite Field Health Score

**Goal:** One 0–100 score (or reuse the existing 4-band Dead/Unhealthy/Moderate/Healthy labels) combining multiple indices into a single verdict, so farmers aren't asked to interpret 6 separate numbers.

**Depends on Feature 2 being done first** — the weighting below changes by growth stage.

### Step 3.1 — Define weighting per growth stage

Add to the same primary-index module:

```ts
export function healthScoreWeights(
  stage: string | null,
): Record<string, number> {
  switch (stage) {
    case "flooding":
    case "early_growth":
      return { savi: 0.6, lswi: 0.4 }; // soil-corrected canopy + water presence
    case "vegetative":
    case "mature":
    default:
      return { ndvi: 0.6, lswi: 0.3, evi: 0.1 }; // canopy health + water stress + saturation-resistant cross-check
  }
}
```

These starting weights are a reasonable default, not a scientifically tuned model — flag this explicitly in the code comment so future-you knows to revisit them once real field outcomes (farmer-reported yield, ground-truth stress) are available to validate against.

### Step 3.2 — Compute composite score server-side

Add a new `ee-data` action, `getFieldHealthScore`, that:

1. Determines growth stage (reuse existing logic from Feature 2)
2. Gets weights via `healthScoreWeights(stage)`
3. Computes each required index's value (reuse `applyIndex` — already handles all 6 indices)
4. Normalizes each index's raw value to a 0–1 scale using its own `VIS` min/max (an index with range -1..1 and one with range 0..1 can't be averaged raw)
5. Combines: `score = Σ(normalized_value_i × weight_i) × 100`
6. Runs the combined score through the same 4-band translation from Feature 1 (`translateIndexValue`-style banding, but on the composite 0-100 scale) to get a label/phrase

```ts
async function actionGetFieldHealthScore(payload: any) {
  const geom = toEeGeometry(payload.geometry);
  const stage = /* reuse Feature 2 stage detection */;
  const weights = healthScoreWeights(stage);
  const normalizedValues: Record<string, number> = {};

  for (const [index, weight] of Object.entries(weights)) {
    const raw = await computeIndexOverField(geom, index); // reuse existing per-index compute logic
    normalizedValues[index] = normalizeToUnitRange(index, raw); // uses VIS min/max
  }

  const score = Object.entries(weights).reduce(
    (sum, [index, weight]) => sum + normalizedValues[index] * weight,
    0
  ) * 100;

  return { score, stage, components: normalizedValues, ...translateScore(score) };
}
```

**Cost note:** this computes N indices per field where N = number of weighted indices (2-3), same order of magnitude as checking a couple of tabs manually — no new caching concerns beyond what's already in the cost-control plan. Cache this action's result the same way as other "current status" endpoints (§2 of `aim-ee-cost-control-plan.md` — 5-day revisit window, not closed-period, since it reflects current conditions).

### Step 3.3 — Frontend: composite score as the default field view

Make the composite score + phrase the first thing shown when opening a field (replacing "NDVI: 0.45" as the default). Individual index tabs (existing NDVI/EVI/NDWI/etc. switcher) move to a secondary "Show details" area — see Feature 6.

**Done when:** opening any field shows one score + one plain-language verdict by default, computed from the growth-stage-appropriate index blend.

---

## Feature 4: Guided Comparison — Surfacing Index Disagreement

**Goal:** When indices disagree in a diagnostically meaningful way (e.g., NDVI says healthy but LSWI signals water stress), surface that explicitly instead of making the farmer notice it.

### Step 4.1 — Define disagreement rules

Add a small rules table — start with the single most useful case, expand later:

```ts
export function detectDiscrepancy(
  values: Record<string, number>,
): { message: string } | null {
  // Canopy looks fine (NDVI healthy) but soil moisture is dropping (LSWI low)
  if (values.ndvi >= 0.5 && values.lswi < 0) {
    return {
      message:
        "Canopy looks healthy, but soil moisture is dropping — consider irrigation soon.",
    };
  }
  return null;
}
```

Keep this as a short, explicit rules list, not a generic scoring formula — the value of this feature is catching _specific, known-meaningful_ contradictions, not flagging every minor numeric difference between indices (which would produce noise, not insight).

### Step 4.2 — Compute alongside the health score

In `actionGetFieldHealthScore` (Feature 3), after gathering `normalizedValues`, also run `detectDiscrepancy` using the raw (non-normalized) values for the indices the rule needs. Return `discrepancy: { message } | null` in the response.

### Step 4.3 — Frontend: discrepancy banner

When `discrepancy` is non-null, show a distinct banner (different visual treatment from the main score — e.g., amber warning style) above or below the composite score. Don't bury it inside the "Show details" secondary area — this is meant to be seen immediately, since it's catching something the composite score alone would miss.

**Done when:** a farmer whose field has healthy canopy but dropping soil moisture sees an explicit warning, not just two numbers they'd have to notice disagree.

---

## Feature 5: Consistent Visual Legend Across All Indices

**Goal:** Every index uses the same visual grammar (the NDVI infographic style: -1→1 bands with plant illustrations) so a farmer who learns "green plant = good" once doesn't relearn it per index.

### Step 5.1 — Confirm existing NDVI infographic assets

Locate the current NDVI legend component/image (the one already built matching the uploaded `ndvi.jpg` reference). This is the visual template to replicate, not redesign.

### Step 5.2 — Generate matching assets for remaining indices

Five index-specific infographic variants (EVI, NDWI, LSWI, SAVI, GNDVI) were already scoped with generation prompts. Produce these as static image assets (SVG preferred for crisp scaling) using the same layout: 4 panels, same plant-illustration style, same soil strip, just different range labels and subtitle text per index (already defined in the earlier prompts — reuse those verbatim).

### Step 5.3 — Component-ize the legend

Refactor the NDVI legend into a reusable `<IndexLegend :index="activeIndex" />` component that swaps in the correct image asset and range labels based on which index tab is active, rather than having a one-off NDVI-only component. This is what makes "consistency" maintainable — one component, swappable data, not six near-duplicate components.

**Done when:** switching between index tabs shows a visually consistent legend every time, differing only in the specific range numbers and generated illustration for that index.

---

## Feature 6: Progressive Disclosure Onboarding

**Goal:** First-time field view shows only the composite score; a "Show details" toggle reveals the individual index tabs — avoiding overwhelming a new user with 6 tabs before they understand one number.

**Depends on Features 3 and 5 being in place** (needs the composite score to show by default, and the consistent legend for when details are expanded).

### Step 6.1 — Default collapsed state

In the field detail view component, wrap the existing 6-tab index switcher in a collapsible section, collapsed by default. Show only:

- Composite health score (Feature 3) + phrase
- Discrepancy banner if present (Feature 4)
- A "Show details" button/toggle

### Step 6.2 — Expanded state

On toggle, reveal the existing tab switcher (NDVI/EVI/NDWI/LSWI/SAVI/GNDVI) with the consistent legend (Feature 5) and plain-language phrase per index (Feature 1) — this is the current full-detail view, just no longer the default.

### Step 6.3 — Remember user preference (optional, low priority)

If a user expands details repeatedly, consider persisting that preference (e.g., a `profiles` column or local storage flag) so power users aren't re-collapsing it every visit. Ship without this first — it's a nice-to-have, not required for the core feature.

**Done when:** a brand-new user sees one score and one sentence on first open; an engaged/returning user can expand to the full index breakdown in one click.

---

## Summary: File Touch List

| File                                                         | Features touched                                                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `tailwind.config.js`                                         | 0 (color tokens)                                                                                                |
| `_shared/indexTranslations.ts` (new)                         | 1                                                                                                               |
| `_shared/primaryIndex.ts` (new, or extend `growthStage.ts`)  | 2, 3                                                                                                            |
| `ee-data/index.ts`                                           | 1 (wire translations), 2 (stage-aware primary), 3 (new `getFieldHealthScore` action), 4 (discrepancy detection) |
| Frontend field detail component                              | 0, 1, 2, 3, 4, 6                                                                                                |
| `<IndexLegend>` component (new, refactored from NDVI legend) | 0, 5                                                                                                            |
| Index infographic image assets (EVI/NDWI/LSWI/SAVI/GNDVI)    | 5                                                                                                               |

## Build Order Recap

0. Feature 0 (design tokens + component specs) — build first, everything else references these colors/layout
1. Feature 1 (translation layer) — foundation for 3 and 6
2. Feature 2 (growth-stage primary index) — foundation for 3
3. Feature 3 (composite score) — the main new "clear result" deliverable
4. Feature 4 (discrepancy detection) — small addition once 3 is done
5. Feature 5 (visual consistency) — can be done in parallel with 1-4, no dependency
6. Feature 6 (progressive disclosure) — wraps everything together, do last
