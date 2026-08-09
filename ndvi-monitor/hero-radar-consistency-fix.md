# Fix: NDVI/Radar Labeling Clarity + Telegram/Frontend Window Consistency

Two things to fix, found while reviewing the live field detail panel.

---

## Fix 1 — Clarify that the hero NDVI number and the map tile show different things

```
In my field detail panel, when a field is in a cloud-blocked month, two different measurements
are shown together with no visual distinction:

1. The hero NDVI number (e.g. "0.135" + "Stressed") — this is the LAST VALID optical NDVI
   reading from before the cloud cover started.
2. The map tile behind it — this is showing LIVE Sentinel-1 radar (RVI), a completely different
   measurement type, for the CURRENT period.

Right now nothing on screen tells the viewer these are two different things from two different
time periods. It reads as if the NDVI number describes what's currently on the map, which it
doesn't.

Fix:
1. Find the field detail panel component (FieldDetailPanel.vue) where the hero NDVI number is
   rendered alongside the LOW CONFIDENCE / Cloud-blocked badges.
2. When the current state is cloud_blocked or radar_fallback (per the mode logic from the earlier
   Sentinel-1 work), add a small caption under or beside the hero NDVI number: e.g. "Last clear
   reading: [date]" using the same lastValidDate value already available from the cloud-blocked
   fallback logic.
3. If the map is currently showing radar_fallback mode, add a separate small note near the map
   (not the hero number) clarifying: "Map showing radar signal (RVI) — a different measurement
   from the NDVI value above, not directly comparable."
4. Don't change the underlying values or scoring logic — this is a labeling/clarity fix only, so
   a user can't mistake a stale NDVI number for a live reading of what's currently rendered on the
   map.

Show me the updated FieldDetailPanel.vue with these two clarifying labels.
```

---

## Fix 2 — Confirm the Telegram worker and frontend use the same lookback window

```
My app has two independent places that compute a field's NDVI status from the same saved field
geometry (stored in Supabase):

1. The frontend field detail panel (src/store.js / src/services/earthEngine.js) — computes the
   hero NDVI value and growth-stage status shown to the user in the browser.
2. The ee-alerts-worker Edge Function (supabase/functions/ee-alerts-worker/index.ts) — computes
   NDVI independently using a service account, on a 90-day lookback window (per an earlier fix
   for rainy-season coverage), and sends Telegram alerts based on its own result.

These run as separate Earth Engine queries and could return different NDVI values for the same
field at the same moment if their date windows or cloud-filter thresholds don't match — which
would mean the number a farmer sees in the app doesn't match the number in their Telegram alert
for the same day.

Please:
1. Find the exact date-range window and cloud-cover filter threshold used in the frontend's
   current NDVI computation (src/services/earthEngine.js's loadIndexTile()/getRecentIndexValue()
   or equivalent) for what becomes the field detail panel's hero value.
2. Compare it to the 90-day window and <40% cloud filter used in ee-alerts-worker/index.ts.
3. Report back exactly what each one is (window length in days, cloud threshold) — do not assume
   they already match.
4. If they differ, tell me which is more accurate/appropriate for rice monitoring in Cambodia's
   wet season and recommend aligning them to the same window/threshold, OR, if there's a good
   reason for them to differ (e.g. one needs to be more responsive, one needs more reliable
   coverage), explain that tradeoff clearly so I can decide rather than assuming they should
   always match.
5. Do NOT change either value yet — this step is a comparison/report only. I'll decide whether to
   align them after seeing the actual numbers.

Show me the comparison and your recommendation.
```

---

### Notes
- Fix 1 is a quick, low-risk UI clarity change — safe to ship any time.
- Fix 2 is intentionally scoped to "report back, don't change yet" — a mismatch here could be
  totally fine (worker prioritizing reliability over the app's snappier live view) or it could be
  a real bug worth fixing. Get the actual numbers before deciding.
