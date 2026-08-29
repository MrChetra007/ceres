# NDVI Rice Crop Health Monitor — Project Brief

## What it is
Satellite-based rice crop health monitor ("Ceres") for Battambang, Cambodia. Shows **seven view modes** (NDVI / NDWI / LSWI / SAVI / EVI / GNDVI / True Color), lets users draw/save fields and manage monitoring areas (AOIs), tracks health against the rice growth cycle, explains any field with an AI agronomist, and sends Telegram alerts (weather-aware, LLM-written advisory text) when a field shows stress — in English and Khmer.

## Stack
- **Frontend:** Vue 3 + Vite + vue-router (marketing landing page + map app). Leaflet + leaflet-draw load via CDN `<script>` (UMD/global libs that break under Vite). All Earth Engine compute is **proxied server-side** through the `ee-data` Supabase Edge Function (service-account auth) — there is **no client-side Earth Engine JS API or EE OAuth**; the browser sends EE actions with the user's Supabase JWT and receives ready-to-render tiles/series.
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions + pg_cron/pg_net + Vault for the scheduled worker).
- **Auth:** Supabase — Google OAuth **and** email/password (sign up / sign in / sign out), per-user fields, AOIs and photos sync.
- **Satellite data:** Google Earth Engine — Cloud Project `gen-lang-client-0978198347`; Sentinel-2 (all indices + true-color), Sentinel-1 GRD IW (RVI radar fallback), CHIRPS rainfall.
- **Weather:** Open-Meteo 5-day forecast, keyed to each field's stored centroid (`centroid_lat`/`centroid_lng`).
- **Maps:** Leaflet with Street (OSM) and Satellite (Esri) basemaps; leaflet-draw for polygon/rectangle field and AOI drawing.
- **Charts:** Chart.js (trend charts with AOI benchmark line). **Area calc:** turf.js. **Export:** jsPDF (PNG / PDF reports). **Language:** custom `src/i18n` store-backed EN/KM dictionaries.
- **AI:** `consult-ai` Edge Function and `ee-alerts-worker` share one LLM orchestrator (`_shared/llm.ts`) — fallback chain Gemini (`gemini-3.5-flash`) → DeepSeek (`deepseek-chat`) → Qwen (`qwen3-max`), with 20s per-provider timeouts, truncation-retry via a concise prompt, and language steering (`languageLine`); the responding model is stored/logged server-side only, never shown to the user.
- **Alerts:** Telegram bot, daily scheduled `ee-alerts-worker` (pg_cron `ndvi-alerts-daily`, 23:00 UTC ≈ 06:00 Cambodia), dedup verified end-to-end.

## Core features (implemented, confirmed)
- 14-month time slider with season/date-range presets, scene-count + cloud-confidence indicators, ▶ play, "Today" quick-jump (runs the standard clean/cloud-blocked/no-data pipeline), compare-two-dates split-screen with draggable divider and double-click reset.
- **Seven view modes** — NDVI, NDWI, LSWI, SAVI, EVI, GNDVI, True Color — sharing one legend/threshold system; SAVI/EVI/GNDVI are visual/exploratory only (not part of stress scoring). Each band tab shows an explanatory tooltip (EN filled, Khmer pending translation).
- **"Latest Satellite View"** — renders the most recent Sentinel-2 pass as an un-masked True Color photo, independent of the slider, with a clear date + cloud% label and graceful empty state.
- Per-scene **True Color date picker**; clouds intentionally left visible/unmasked as the reliability signal.
- **Cloud-blocked fallback:** months ≥40% cloudy render the least-cloudy true-color scene instead of a misleading index composite, with a ☁️ pill (hover tooltip), a "jump to last valid reading" action (90-day lookback), and silent autoplay toasts (shown once per session).
- **Sentinel-1 RVI radar fallback:** when optical is fully blocked, live radar tiles (RVI = 4·VH/(VV+VH), ±15-day window) render in `radar_fallback` mode, with explicit in-UI notes that radar is a different measurement and not comparable to the hero NDVI.
- **Unified 🟢🟡🔴 confidence badge** (`getConfidenceTier`, 21-day staleness) shown in the map legend, field cards, field detail hero and compare scrubber — always consistent; auto-estimated planting dates downgrade confidence to Medium.
- **Fields & areas:** draw/save polygons or rectangles with live hectare tooltip and implausible-size warning; per-user AOIs (5-area cap) with four creation paths — Search place (Nominatim), Draw on map, Manual coordinates, **Use existing field**; a selected field always clips analysis to its real polygon rather than the AOI rectangle.
- **Growth-stage-aware health assessment** against the 6-stage rice phenology range by days-since-planting (flat-threshold fallback when no planting date), with planting date optionally **auto-detected from an LSWI spike** (`planting_date_source = 'estimated'`, tap to adjust).
- **Health badge dashboard** with per-field sparklines, trend charts with dashed AOI benchmark line and click-to-enlarge, CHIRPS 21-day rainfall watcher, dry-month and flood/dry-spell markers on the slider.
- **Health Zone panel:** buckets the viewed month's index (or RVI fallback) into 10 value ranges — area in Ha + % per bucket, scale bar with Good/Medium/Bad markers that match growth-stage-aware thresholds.
- **Weather forecast:** 5-day Open-Meteo card (temps, rain probability) on the field detail panel, cached (15-min TTL per location).
- **Observations day-strip:** auto-opens when a field is selected; horizontal per-pass columns with cloud icons + NDVI values; click any pass to jump the map to that date; collapsible with the mode selector in one floating bottom sheet.
- **Consult AI:** on-demand, cached (`ai_explanations`), per-user daily cap (20/day → friendly 429 toast), confidence-aware hedging, bilingual explanation; never auto-triggered.
- **Telegram:** bot account-linking, daily scheduled stress worker that sends **weather-aware, LLM-generated advisories** (with flat-template + Khmer fallback if the LLM fails), **farmer photo uploads** (send a photo to the bot → auto-linked to the right field → private storage → in-app thumbnail strip + lightbox), and best-effort field disambiguation when a photo is ambiguous.
- **Export** of PNG charts and full PDF reports; **bilingual EN/Khmer UI** (per-user `preferred_language` synced to `profiles`); onboarding "How this works" tour; marketing landing page with six index before/after comparison sliders.
- Collapsible left (fields/settings) + right (field stats) drawers and a floating, centered bottom sheet; fully responsive down to small mobile widths; dark "satellite dashboard" design system.

## Explicitly out of scope (for now)
No TTS, no harvest-window prediction, no pest/disease risk scoring, no yield estimation, no offline mode.

## Remaining polish (small)
- Khmer tooltip copy for the 7 band/index tabs (`band.tip_*` in `km.js` currently empty strings)
- Worker RVI stress threshold (`RVI_STRESS_THRESHOLD = 0.4`) is an uncalibrated placeholder
- Sentinel-1 (RVI) pass columns in the Observations day-strip are stubbed for a future pass