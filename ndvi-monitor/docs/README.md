# Documentation Index

Internal project docs for the NDVI Rice Monitor (Ceres). Previously scattered
across the repo root, now grouped by purpose.

## Roadmaps & Planning

`roadmaps/` — long-range plans, phase scopes, build guides.

- `NDVI_Master_Roadmap.md` — consolidated single-source roadmap
- `NDVI_Crop_Monitor_Roadmap.md` — original full build roadmap
- `NDVI_Product_Pivot_Roadmap.md` — tech-show demo → simple real tool
- `NDVI_Stack_Migration_Roadmap.md` — Vue + Vite → plain HTML/CSS/JS migration
- `Backend_Telegram_Roadmap.md` — Phase 8: Supabase backend + Telegram alerts
- `Phase_13_AI_Advisory_Photo_Planting.md` — Phase 13: AI advisory, photos, auto-planting
- `Performance_Fix_Batch_EE_Calls.md` — batching sequential EE calls on init
- `sentinel1-radar-fallback-roadmap.md` — Sentinel-1 RVI fallback build guide

## Fixes & Bug Reports

`fixes/` — diagnosis → fix records (bug reports, follow-ups, patches).

- `field-bundle-fix-guide.md` — field selection fires ~10 concurrent requests
- `fix-ee-data-batch-fields.md` — batch per-field status/trend fetches
- `fix-ee-data-chart-cache.md` — cache trend charts on mode switches
- `fix-ee-data-slow-auth.md` — ee-data re-authenticating EE every request
- `fix-ee-login-edge-function.md` — drop per-user EE login requirement
- `fix-fallback.md` — scene-aware RVI tab + real hero RVI value
- `fix-prompt-ndvi-rvi-bug.md` — NDVI/RVI day count disagreement
- `fix-prompt-sidebar-daycount.md` — sidebar day count fix
- `fix-prompt-stagetext-daycount.md` — hero subtitle day count fix
- `hero-radar-consistency-fix.md` — NDVI/radar labeling + window consistency
- `rvi-fallback-fix-guide.md` — no-capture months skip RVI/true-color fallback
- `store-patch.md` — stop discarding sceneDate for cloud-blocked obs
- `no-data.md` — scope per-scene RVI substitution to NDVI only

## Feature Specifications

`features/` — new capabilities, patches, schemas, integration guides.

- `Cloud_Blocked_Scene_Fallback.md` — data trust layer + confidence badge
- `aba-payway-integration-instructions.md` — ABA PayWay sandbox integration
- `add-email-password-auth.md` — email/password login beside Google
- `ee-cost-control-implementation.md` — EE cost control directive
- `ndvi-rvi-compare-toggle.md` — NDVI ↔ RVI compare implementation
- `rvi-time-series-addition.md` — RVI time series action
- `subscription-tiers-schema.md` — tiers, limits, billing audit trail
- `NDVI_Field_Area_Patch.md` — field area (hectares) patch
- `NDVI_Growth_Stage_Thresholds_Patch.md` — growth-stage-aware thresholds
- `NDVI_LSWI_CHIRPS_Patch.md` — LSWI + CHIRPS rainfall patch

## AI Task Prompts

`prompts/` — instructions intended to be handed to an AI coding agent.

- `Ceres_cloud_resilient_implementation_prompt.md` — correct cloud-resilient flow
- `add-band-tooltips-prompt.md` — band/index tooltips
- `aoi-use-existing-field.md` — use existing field for new area
- `billing-subscription-ui-prompt.md` — billing & subscription UI
- `build-vegetation-index-sections.md` — landing page index sections
- `ceres-add-indices-weather.md` — SAVI/EVI/GNDVI + weather forecast panel
- `ceres-weather-telegram-integration.md` — centroid + weather in advisories
- `consult-ai-prompt.md` — AI Agronomist feature
- `multi-provider-ai-prompt.md` — Gemini → DeepSeek → Qwen fallback
- `ndvi-ui-fix-prompts.md` — ordered UI fix prompts

## UI & Design Changes

`ui/` — visual/structural redesigns and UI bug fixes.

- `Ndvi_ui_redesign_patch.md` — unified visual language redesign
- `redesign-observations-strip.md` — observations panel → horizontal day-strip
- `ui-redesign-collapsible-panels.md` — collapsible side panels + bottom sheet
- `ui-fix-overlay-and-bottom-sheet.md` — overlay blocking map + bottom sheet content
- `ui-fix-bottom-sheet-and-mobile.md` — bottom sheet styling + mobile rendering

## Reference

`reference/` — how the app works: briefs, codebase, design system, process.

- `NDVI_Project_Brief.md` — project brief
- `code_base.md` — technical reference (frontend + Edge Functions)
- `design.md` — design system spec
- `PROCESS.md` — build process / phase log
- `aim-index-understanding-guide.md` — field index understanding implementation
- `phase-86-validation.md` — Phase 8.6 end-to-end dedup validation