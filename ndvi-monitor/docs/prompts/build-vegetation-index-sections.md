# UI Build: Vegetation Index Comparison Sections for Landing Page

## Context

This is the existing landing page: `src/views/Landing.vue` (or wherever this file lives — confirm path). It uses Vue 3 `<script setup>`, scoped CSS with a design token system (`--paddy-night`, `--canopy`, `--husk-paper`, `--ripening-gold`, `--canopy-green`, `--stress-red`, fonts `--font-display` (Space Grotesk), `--font-body` (IBM Plex Sans), `--font-mono` (IBM Plex Mono)), a `.landing-section` wrapper pattern (max-width 1080px, centered, `reveal` scroll-in animation class), `.landing-eyebrow`, `.landing-h2`, `.landing-lead` heading patterns, and Tabler icons (`ti ti-*`).

Add six new sections — one per vegetation index (NDVI, NDWI, LSWI, SAVI, EVI, GNDVI) — each with a draggable before/after image comparison slider (raw field photo vs. the color-rendered index), matching the existing visual language of this page exactly (same fonts, colors, spacing, reveal-on-scroll behavior).

## Assets

Images already exist at:

```
src/assets/landing-assets/ndvi/
src/assets/landing-assets/ndwi/
src/assets/landing-assets/lswi/
src/assets/landing-assets/savi/
src/assets/landing-assets/evi/
src/assets/landing-assets/gndvi/
```

Each folder contains two images: the raw/true-color field photo and the index-rendered version. Inspect each folder and use whatever filenames are actually present — do not assume exact filenames, discover them.

## Architecture (data-driven, not one component per index)

### 1. Data file: `src/data/landing-indices.js`

Export an array of index definitions, one object per index, e.g.:

```js
export const landingIndices = [
  {
    key: 'ndvi',
    name: 'NDVI',
    fullName: 'Normalized Difference Vegetation Index',
    formula: 'NDVI = (NIR − Red) / (NIR + Red)',
    description: 'The standard index for measuring plant health and density from satellite imagery — higher values mean denser, healthier vegetation.',
    scaleLow: 'water, clouds, bare soil',
    scaleHigh: 'healthy, dense vegetation',
    beforeImage: /* imported raw photo */,
    afterImage: /* imported rendered image */,
  },
  // ...ndwi, lswi, savi, evi, gndvi with their respective formulas/descriptions/scale labels
  // (reuse the exact copy already written for each index's infographic: formula strings,
  // captions, and low/high scale labels from the earlier infographics for each mode)
]
```

Import each pair of images at the top of this file from their respective `assets/landing-assets/<mode>/` folders.

### 2. Reusable component: `src/components/landing-page/CompareSlider.vue`

A generic before/after image comparison slider:

- Props: `beforeSrc`, `afterSrc`, `beforeLabel` (optional, default "Field photo"), `afterLabel` (optional, default index name).
- Two images stacked in the same position/size (absolute positioning, same aspect-ratio container).
- The "after" (rendered) image is clipped via `clip-path: inset(0 X% 0 0)` (or equivalent) where X is controlled by slider position state.
- A vertical drag handle line with a small circular grip in the middle, positioned at the current split percentage.
- **Default split: 50/50.**
- Supports both mouse drag and touch drag (pointer events: `pointerdown`/`pointermove`/`pointerup`, using `setPointerCapture` for reliability across mouse and touch).
- Clamp the drag position between ~5% and ~95% so a corner drag can't fully hide either image.
- Small text labels in the corners (or near the handle) showing which side is which (e.g. "Field photo" left, index name right), styled consistently with this page's `.mono` / `--font-mono` treatment used elsewhere (e.g. like `.brand-loc`, `.landing-step-num`).
- No external dependencies — implement with native Vue reactivity + CSS `clip-path`.
- Style using the existing design tokens (`--canopy`, `--line-on-dark`, `--ripening-gold` for the handle/grip color) so it visually matches the rest of the page, not a generic/default slider look.

### 3. Reusable component: `src/components/landing-page/IndexSection.vue`

A generic section template, fed entirely by props (one object from `landing-indices.js`):

- Wrapped in `.landing-section.reveal` (same class used by other sections on this page, so it inherits the existing scroll-reveal `IntersectionObserver` behavior already set up in the parent's `onMounted`).
- Layout: eyebrow/label (e.g. index key as `.landing-eyebrow.mono`), heading using `.landing-h2` showing `name — fullName` (e.g. "NDVI — Normalized Difference Vegetation Index"), the formula displayed in a styled code/mono block (new small style block consistent with `.mock-badge`/`.trust-chip` treatment — dark background, mono font, subtle border), the `CompareSlider` component fed this index's `beforeImage`/`afterImage`, a horizontal color scale bar (-1 to +1 gradient, reuse the visual style of `.mock-legend` swatches but as a continuous gradient bar) with `scaleLow`/`scaleHigh` labels underneath, and the `description` text styled as `.landing-lead`.
- Props: a single `index` object matching the shape defined in `landing-indices.js`.

### 4. Wiring into the landing page

In the existing landing page file (`Landing.vue`):

- Import `landingIndices` from `src/data/landing-indices.js` and `IndexSection` from `src/components/landing-page/IndexSection.vue`.
- Add a new wrapping section (e.g. `id="landing-indices"`) placed logically in the page flow — after `#landing-features` and before `#landing-lang` makes sense, but use your judgment based on content flow; add a section eyebrow/heading above it introducing this block (e.g. "Six ways to read a field" — write appropriate copy consistent with this page's tone).
- Inside it, `v-for` over `landingIndices` rendering one `<IndexSection :index="item" :key="item.key" />` per entry.
- Ensure each rendered `IndexSection` gets the `reveal` scroll-in treatment — since `onMounted` in the parent queries `.landing .reveal` at mount time via `document.querySelectorAll`, confirm this still picks up the new dynamically rendered elements (it will, since they exist in the DOM by the time `onMounted` runs on initial page load — no change needed there, but verify no timing issue if these components use `v-if`/async loading).

## Constraints

- Reuse existing CSS custom properties/tokens — do not introduce new hardcoded colors/fonts.
- Do not modify the existing sections' markup/logic/animations (hero, problem, how-it-works, features, language, trust, CTA, footer) — only add the new section and its two new components plus the data file.
- Keep `CompareSlider.vue` fully generic/reusable — it must not contain any index-specific text or logic, only props-driven image comparison behavior.
- Match the existing `<script setup>` + scoped `<style>` conventions used throughout this codebase.

## Deliverables

- `src/data/landing-indices.js`
- `src/components/landing-page/CompareSlider.vue`
- `src/components/landing-page/IndexSection.vue`
- Updated landing page file wiring in the new section
- List every file created/changed at the end of your response.
