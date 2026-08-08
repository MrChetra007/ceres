# New Area — Use Existing Field Instead of Manual Coordinates

## Context (give this to your AI assistant)

My app has two related but separate concepts:
- **Fields** — user-drawn polygons (leaflet-draw), saved to Supabase, used for per-field NDVI/NDWI/LSWI stats, growth-stage health badges, and Telegram alerts. Real polygon shapes, not rectangles.
- **Areas (AOIs)** — a broader bounding-box region (West/South/East/North), used to set what the map view/analysis is centered on. Currently created via a "New Area" modal requiring manual coordinate entry or a place search.

Right now these are fully separate — even with a saved field, the map defaults to showing/rendering the wide rectangular Area bounding box (the red dashed rectangle), not the tighter actual field polygon shape. I want field-based monitoring to take priority when a field exists, since a rectangular AOI is much bigger and less precise than the field's real boundary.

---

## Fix 1 — "Use an existing field" option in the New Area modal

```
My "New Area" modal currently only lets a user define a bounding box by typing West/South/East/
North coordinates or searching a place name (Nominatim). Add a third option: select one of the
user's existing saved fields, and auto-fill the bounding box from that field's actual polygon
extent (bounding box of the polygon's coordinates) instead of typing numbers manually.

1. Add a tab or toggle at the top of the New Area modal: "Search place" | "Manual coordinates" |
   "Use existing field" (only show this third option if the user has at least one saved field).
2. "Use existing field" shows a simple list/dropdown of the user's saved fields (name + area in
   hectares, same info already shown on their dashboard cards).
3. Selecting a field computes its bounding box (min/max lat/lng from the polygon's coordinates,
   turf.js's bbox() or equivalent since turf is already a dependency) and pre-fills the West/
   South/East/North inputs, same as the place-search flow already does.
4. User can still see/adjust the resulting numbers before saving, same as today.
5. Don't change the manual-coordinates or place-search flows — this is purely an additional entry
   point into the same bounding-box creation flow.

Show me the updated AoiEditor.vue with the new "Use existing field" tab/option.
```

---

## Fix 2 — Confirm/fix that a selected field clips to its real shape, not the Area's rectangle

This is the more important one — check this BEFORE or alongside Fix 1, since it may already be
partially working and just needs verification, not a rebuild.

```
When a user has a saved field selected/active, I want the map's NDVI/NDWI/LSWI rendering to be
clipped to that field's actual saved polygon shape — not the broader rectangular Area (AOI)
bounding box. Right now, based on screenshots, the app appears to still show/render the wide
rectangular Area outline (red dashed box) even when a field exists, rather than a tight clip to
the field's real boundary.

1. Check loadIndexTile() and the store's loadIndexForMonth() (src/services/earthEngine.js,
   src/store.js): confirm what geometry is actually passed to .clip() when a field is selected —
   is it the field's saved polygon (state.currentGeometry from the field), or is it falling back
   to the active AOI's rectangle regardless of field selection?
2. If it's incorrectly using the AOI rectangle even with a field selected: fix the geometry
   priority so a selected field's own polygon always takes precedence over the active Area's
   bounding box for rendering/analysis.
3. The red dashed rectangle overlay on the map should only show when NO field is selected (i.e.
   the user is viewing/exploring the general Area to find where to draw a new field) — it should
   NOT persist as a visual overlay once a specific field is loaded/selected, since the field's own
   boundary should be the visible outline instead.
4. Confirm this with a real test: select a saved field, verify the map's colored overlay stops at
   the field's actual polygon edges (not the AOI rectangle's edges), and that the red dashed
   rectangle either disappears or visually recedes in favor of the field's own outline.
5. Don't change the underlying Area/AOI system itself — Areas should still work for browsing/
   exploring where to draw a new field. This fix is about which geometry wins when a field IS
   selected.

Show me the relevant geometry-selection logic in store.js and earthEngine.js, and confirm whether
this was already correct or needed a fix.
```

---

### Notes
- Fix 2 matters more than Fix 1 for your actual goal ("only render for that field") — Fix 1 is a
  convenience improvement to a modal, Fix 2 is the core behavior that makes per-field monitoring
  actually tighter/more precise than a competitor's broader regional rendering.
- Worth testing Fix 2 first on your real field (~60-70km field, planted 7/8/2026) to see whether
  this was already working correctly and you were just seeing the AOI rectangle because no field
  happened to be selected in those screenshots.
