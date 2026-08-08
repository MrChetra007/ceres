# NDVI Rice Crop Health Monitor — Project Brief

## What it is
Satellite-based rice crop health monitor for Battambang, Cambodia. Shows NDVI/NDWI/LSWI vegetation-health maps, lets users draw/save fields, tracks health over time, and sends Telegram alerts when a field shows stress.

## Stack
- **Frontend:** Vue 3 + Vite, CDN-loaded Leaflet + Google Earth Engine JS API
- **Backend:** Supabase (Postgres + Auth + Edge Functions + Storage), Google sign-in only
- **Satellite data:** Google Earth Engine (Sentinel-2 NDVI/NDWI, LSWI, CHIRPS rainfall) — Cloud Project `gen-lang-client-0978198347`
- **Alerts:** Telegram bot, scheduled via `ee-alerts-worker` Edge Function + pg_cron
- **AI:** `consult-ai` and `ee-alerts-worker` both call a shared LLM orchestrator (`_shared/llm.ts`), fallback chain Gemini → DeepSeek → Qwen

## Core features (live, deployed, confirmed working)
- Live NDVI/NDWI map with time slider (14-month history), scene-count confidence indicator
- Click-to-inspect trend chart + automatic stress detection (>15% NDVI drop)
- Draw & save fields, multi-area support (5-area cap per user)
- Growth-stage-aware health thresholds (NDVI expected range by days-since-planting)
- Dashboard with health badges, compare-two-dates mode, PNG/PDF export
- Event overlays (flood/dry-spell markers), CHIRPS rainfall context on alerts
- Google-auth login, per-user Supabase-synced fields (replaced localStorage)
- Scheduled Telegram alerts (daily worker, dedup verified)
- "Consult AI" — on-demand plain-language explanation of a field's health, cached, daily cap per user

## Built, but NOT yet live (frontend done, backend deploy pending)
Run these to activate:
1. Apply `migration8.sql`, `migration9.sql`, `migration10.sql` in Supabase SQL editor
2. Redeploy Edge Functions: `consult-ai`, `ee-alerts-worker`, `telegram-webhook`

What they unlock once deployed:
- **Cloud-blocked fallback:** true-color imagery + 🟢🟡🔴 confidence badge when a month is ≥40% cloudy
- **LLM-generated Telegram alerts:** Khmer/English advisory text instead of flat templates (falls back to template if LLM fails)
- **Farmer photo uploads:** send a field photo via Telegram → auto-linked to the right field, stored privately, viewable in-app
- **Auto-planting-date detection:** detects transplanting date from an LSWI spike (dry→flooded), auto-fills field, downgrades confidence to "estimated" until manually confirmed

## Explicitly out of scope (for now)
No TTS, no harvest-window prediction, no pest/disease risk mapping, no yield estimation, no offline mode.

## Next steps
- Deploy migrations + redeploy the 3 Edge Functions above
- End-to-end validate the LLM advisory + photo + auto-planting flows in production
