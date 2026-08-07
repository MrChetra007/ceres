# NDVI Rice Monitor — UI Fix Prompts

Run these one at a time, in order. Each one assumes the previous step is done and merged. Stack: Vue 3 + Vite, dark "satellite dashboard" design system, Leaflet map, Earth Engine.

---

## Step 1 — Mobile hamburger menu

```
My app is a Vue 3 + Vite NDVI monitoring dashboard with a dark "satellite dashboard" design system. On mobile (<768px), the header currently crams these icon-only buttons into one row: Street/Satellite toggle, Compare, Export, Telegram alerts, Help, language switch (EN/KH), account email, sign out. This is too cramped and hard to tap accurately.

Refactor the mobile header to:
1. Keep visible in the header bar: logo/app name (collapsed to just the leaf icon on mobile) and the Street/Satellite toggle only.
2. Move everything else (Compare, Export, Telegram alerts, Help, language switch, account email, sign out) into a hamburger icon that opens a slide-out menu (drawer) from the right or left side of the screen.
3. The drawer should use the existing dark design tokens (same background/border colors as the current TopBar and time-slider panel) so it feels native to the app, not bolted on.
4. Each item in the drawer needs a visible text label next to its icon — no icon-only rows.
5. The drawer should close on: tapping outside it, tapping an item, or a close (X) button at its top.
6. Preserve existing desktop layout — this change should only apply below the 768px breakpoint (or whatever breakpoint the app already uses for mobile).

Show me the updated header/drawer component code.
```

---

## Step 2 — Remove duplicate Street/Satellite toggle

```
My NDVI monitoring app currently has the Street/Satellite basemap toggle in TWO places: once in the top header bar, and again in the bottom control bar next to the NDVI/NDWI/LSWI index tabs.

Remove the duplicate:
1. Keep the toggle ONLY in the bottom control bar, grouped visually near the NDVI/NDWI/LSWI tabs since they're all "how to view the map" controls.
2. Remove it entirely from the header (desktop) and from the hamburger drawer (mobile, if it was added there in Step 1).
3. Make sure the single remaining toggle still correctly drives the same state/store value that both instances previously read from — don't leave orphaned state or duplicate event handlers.
4. Double check no other component references the removed header toggle's DOM element or class names.

Show me the diff/updated code for the header component and the bottom control bar component.
```

---

## Step 3 — Collapsible time-slider panel (mobile)

```
My NDVI app has a time-slider panel (shows month, "Wet Season (Rainfed)" label, cloud-blocked badge, a play button, the slider itself, and a FLOOD/DRY SPELL/LOW RAINFALL legend). On mobile this panel is expanded by default and takes up roughly 35% of the screen height before the user even sees the map.

Make it collapsible on mobile (<768px):
1. Default (collapsed) state shows only: play button, current month + season label (e.g. "July 2026 · Wet Season"), and a small chevron/expand icon. Single compact row.
2. Tapping the row or chevron expands it to show the full slider track, date range labels (Jul 2025 / Aug 2026), and the FLOOD/DRY SPELL/LOW RAINFALL legend — same as current full view.
3. Tapping again (or tapping the chevron) collapses it back.
4. Use a smooth height transition (CSS transition or Vue <transition>), not an abrupt show/hide.
5. On desktop (≥768px), keep the panel always expanded as it currently is — this collapse behavior is mobile-only.
6. Persist the collapsed/expanded state in the component's local state (no need to persist across sessions).

Show me the updated component code including the transition/animation.
```

---

## Step 4 — Group and label the Areas controls in the bottom bar

```
My NDVI app's bottom control bar currently has three controls that are all part of the same "Areas" feature (Part 6 of my roadmap: per-user AOIs, 5-area cap, AOI editor with manual bounds or Nominatim place search) but they're rendered as three visually disconnected icons with no grouping and no labels:

1. A location/Areas dropdown showing the current area name (e.g. "Battambang (default)") — lets the user switch between their saved AOIs.
2. A circular icon next to it, currently only distinguished by an orange highlight when active, with no label — likely tied to the 5-area cap indicator or "recenter to selected area."
3. A separate map icon further along the bar that opens the AOI editor modal (manual West/South/East/North bounds, or Nominatim place-search autofill).

Fix this:
1. First, check the actual click handlers/store actions for the orange circular icon and the map icon in the codebase so we know exactly what each does — don't guess.
2. Visually group all three into one labeled unit, e.g. a single "Area" section with a border/background container, instead of three loose icons scattered across the bar.
3. Add a small text label above or beside the group ("Area" or "Monitoring Area") so its purpose is clear at a glance, especially since a judge/first-time user won't know this maps to a saved-AOI system.
4. Give the circular icon a `title` tooltip on desktop and a short text caption on mobile describing its real function (fill this in once step 1 confirms what it does — e.g. "Near area limit (4/5)" or "Recenter map").
5. The map icon (AOI editor) should get a clear label too, e.g. "Edit area bounds" as a tooltip/caption, since right now it's indistinguishable from a generic "view map" icon.
6. Ensure the "active" state has more than just color — add a background fill or border change too, for accessibility/contrast.
7. Don't change what these controls DO, only how clearly they're grouped and labeled.

Show me the updated bottom bar component code with the grouped, labeled Areas section.
```

---

## Step 5 — Desktop header zoning

```
My NDVI app's desktop header currently has all controls in a single flat row with no visual grouping: logo, search bar, Street/Satellite toggle, Compare, Export, Telegram alerts, Help, EN/KH language switch, account email, sign out, hamburger.

Reorganize into three clear zones using flexbox (left / center / right, e.g. justify-content: space-between with three child containers):
1. LEFT zone: logo + app name + "1 monitored field" subtitle, and the search-place input next to it.
2. CENTER zone: view-related controls only — Street/Satellite toggle and Compare. (Note: if Step 2 already moved Street/Satellite to the bottom bar, this zone should just contain Compare, or be dropped if Compare also lives elsewhere — check current state first.)
3. RIGHT zone: collapse Export, Telegram alerts, Help, and the language switch into a single settings/kebab (⋮) dropdown menu. Keep the account email + sign out as a separate avatar/account dropdown at the very right edge, since account actions are conceptually different from app settings.
4. Add consistent spacing (gap) within each zone and between zones — don't let items touch.
5. Keep every existing feature reachable, just regrouped — nothing should be deleted, only relocated into the settings dropdown or account dropdown.
6. Use the app's existing dark design tokens for the dropdown menus so they match the time-slider panel and bottom bar styling.

Show me the updated header component code with the three-zone layout and the two new dropdown menus.
```

---

## Step 6 (bonus, recommended for demo day) — Surface Consult AI and the confidence badge

```
My NDVI app has two flagship technical features that are currently under-exposed in the UI:

1. "Consult AI" — a Gemini/DeepSeek/Qwen-backed button in the field detail panel that generates a plain-language explanation of a field's health. Right now it only appears once a user has selected a saved field and opened its detail panel — it's not visible anywhere else.
2. A unified 🟢🟡🔴 confidence badge system (getConfidenceTier) that appears in several places (map legend, field cards, field detail hero, compare scrubber) but currently renders as a small, easy-to-miss badge (e.g. a small red "LOW CONFIDENCE" box in the bottom-right corner of the map).

Since these are the most technically differentiated parts of the app (useful for demos/pitches where reviewers are evaluating depth, not just visuals), increase their visual prominence without changing their underlying logic:

1. Confidence badge: increase its size/contrast where it appears on the main map view (bottom-right), and consider adding a short one-line explanation next to the tier label (e.g. "🔴 Low confidence — cloud-blocked, showing true-color image") rather than just the tier name, so a first-time viewer understands why at a glance.
2. Consult AI: if no field is currently selected, add a subtle empty-state hint in the sidebar/dashboard area (e.g. "Select a field to get an AI health summary") so new users discover the feature exists, instead of it only appearing after they've found their way into a field's detail panel.
3. Don't move Consult AI into the global header — it's correctly scoped to a specific field's context. Just make its entry point more discoverable from the dashboard/sidebar.
4. Keep both changes purely visual/informational — no changes to the LLM calls, confidence-tier scoring logic, or caching behavior.

Show me the updated components for the confidence badge display and the Consult AI empty-state hint.
```

---

### Notes

- Run Step 3 and Step 4 in either order — they don't depend on each other, but both assume Step 1's drawer exists if you're referencing it.
- Step 4 now assumes you'll check the codebase first (per its own instructions) rather than guessing at the orange icon's function — the roadmap confirms it's part of the Areas/AOI system, just not exactly which sub-action it maps to.
- Step 6 is optional but worth doing before a pitch/demo — Consult AI and the confidence badges are your most technically interesting features and currently read as afterthoughts in the UI.
- After each step, test at both the mobile breakpoint and desktop width before moving to the next — some of these prompts explicitly touch both.
