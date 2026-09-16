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

## Step 7 — Fix redundant cloud-blocked messaging (3 places saying the same thing)

```
My NDVI app's cloud-blocked fallback (Part 8 of my roadmap: true-color fallback + unified confidence badge, threshold is >=40% cloud) currently shows the SAME information in three separate places at once when a month is heavily cloud-covered:

1. A small pill next to the month label reading "☁️ cloud-blocked"
2. A large toast/banner in the top-right corner with the full sentence: "☁️ Cloud-covered on Jul 2026 (49% cloud) — showing true-color image. NDVI can't be reliably calculated. Last valid reading: 2026-06-21"
3. A "LOW CONFIDENCE" badge in the bottom-right legend area, which ALSO repeats "Cloud-covered — last satellite view unavailable"

This is visual noise — three UI elements competing to say the same thing, and it looks broken/unpolished, especially bad for a demo where the field happens to be fully obscured by cloud (near-white true-color image with almost no useful visual content).

Fix this:
1. Consolidate into ONE clear message. Keep the small "☁️ cloud-blocked" pill next to the month label as the primary at-a-glance indicator (always visible, low-key).
2. On hover/tap of that pill, show the full detail (cloud %, "NDVI can't be reliably calculated", last valid reading date) in a tooltip or small popover — don't auto-show a large persistent toast every time the month is cloud-blocked.
3. The confidence badge (bottom-right) should show ONLY the tier + short reason (e.g. "🔴 Low confidence — cloud-blocked"), NOT the full repeated sentence about last valid reading — that detail already lives in the pill's tooltip from step 2.
4. When the current view is this heavily cloud-obscured (near-100% white/cloud true-color image, little useful map content), add a small action button or link: "Jump to last valid reading (2026-06-21)" that moves the time slider to that month — turn the bad state into something actionable instead of just an apology.
5. Auto-dismiss any toast after ~4 seconds if you keep one at all for the FIRST time a user hits a cloud-blocked month in a session, but never show it again for subsequent cloud-blocked months in the same session — rely on the persistent pill instead.
6. Keep the underlying cloud-detection logic, thresholds, and true-color fallback rendering unchanged — this is a messaging/redundancy fix only.

Show me the updated components: the month pill with tooltip, the confidence badge, and the "jump to last valid reading" action.
```

---

## Step 8 — Fix mobile settings drawer overlay + overlapping time-panel labels

```
Two responsive bugs on mobile (<768px) after the Step 1 and Step 7 changes:

BUG A — Settings drawer doesn't actually cover the screen:
Tapping the hamburger opens a "Settings" header bar (title + X close button) at the top, but the drawer body/menu items are not visibly rendering, and the map + time-slider panel remain fully visible and interactive underneath/behind it. The drawer is either missing its backdrop, missing a solid background on its content area, or has a z-index/height bug that's collapsing it down to just its header row.

Fix:
1. The drawer container needs an explicit height (100vh or 100dvh) and a solid background color from the existing dark design tokens — it should NOT be see-through to the map behind it.
2. Add a semi-transparent backdrop/scrim behind the drawer (covering the rest of the screen) that closes the drawer on tap, and ensure the backdrop sits above the map/time-slider panel in z-index but below the drawer itself.
3. Verify the drawer's menu items (Compare, Export, Telegram alerts, Help, language switch, account email, sign out — from Step 1) are actually rendering inside the drawer body, not just the header — check whether a conditional render or v-if is failing silently.
4. While the drawer is open, the map and time-slider panel underneath should not be scrollable, clickable, or interactable (trap focus/scroll within the drawer).
5. Test on a real narrow viewport (375px or so), not just resizing a desktop browser window — this bug may only show up at actual mobile widths/heights.

BUG B — Time-slider panel text overlapping on mobile:
The month label "July 2026", the "cloud-blocked" pill, and a "Last reading 202..." badge are all overlapping each other and getting cut off at the screen edge on mobile. This looks broken/unpolished — text is rendering on top of other text instead of wrapping or stacking.

Fix:
1. On mobile widths, stack these elements vertically instead of trying to fit them in one horizontal row: month + season label on one line, the cloud-blocked pill and "last reading" indicator below it (either on their own line, or the last-reading detail moved entirely into the pill's tooltip/popover from Step 7 instead of being a separate always-visible badge).
2. Make sure no element has a fixed/absolute position that ignores its siblings' widths — use flexbox with wrap or a column layout instead, so elements push each other down rather than overlapping.
3. Add text-overflow: ellipsis or truncate + tooltip-on-tap for anything that still doesn't fit rather than letting it clip off the edge of the screen.
4. Re-test the panel specifically in the cloud-blocked state (the worst case, most text) at 375px width and at least one narrower width (~320px) to make sure it holds up.
5. Keep desktop layout (≥768px) as-is — this is a mobile-only layout fix.

Show me the updated drawer component (with backdrop and proper stacking) and the updated time-slider panel component (mobile-responsive layout, no overlapping text).
```

---

### Notes

- Run Step 3 and Step 4 in either order — they don't depend on each other, but both assume Step 1's drawer exists if you're referencing it.
- Step 4 now assumes you'll check the codebase first (per its own instructions) rather than guessing at the orange icon's function — the roadmap confirms it's part of the Areas/AOI system, just not exactly which sub-action it maps to.
- Step 6 is optional but worth doing before a pitch/demo — Consult AI and the confidence badges are your most technically interesting features and currently read as afterthoughts in the UI.
- Step 7 matters most right before recording your demo video — a heavily cloud-blocked field with three overlapping messages is exactly the kind of thing that looks broken on camera. Consider picking a demo month/field you already know is clean (not cloud-blocked) as a workaround if you're recording soon and don't have time to ship this fix first.
- Step 8 fixes real functional bugs (the drawer not blocking interaction with the map underneath it is a usability bug, not just cosmetic) — prioritize this before Step 6's polish items.
- After each step, test at both the mobile breakpoint and desktop width before moving to the next — some of these prompts explicitly touch both.
