# Ceres x CamDX Hackathon 2026 - AI Slide Deck Prompt

**Purpose:** A copy-paste prompt pack for generating the Ceres pitch deck with an AI presentation tool (Gamma, Canva Magic Design, PowerPoint Copilot, Claude, ChatGPT, etc.).

**How to use:**

1. Paste the **Master Prompt** into the AI presentation tool.
2. If the tool only accepts slide-by-slide input, use the **Slide Prompts** section.
3. Replace all `[PLACEHOLDERS]` before presenting.
4. Keep the **Fact Sheet** and **Guardrails** beside you when editing the generated deck. Do not let the AI invent numbers, users, partners, or live features.

**Event:** CamDX Hackathon, 12-13 December 2026, Phnom Penh  
**Theme:** "EXCHANGE DATA. CREATE PUBLIC VALUE"  
**Format:** 16:9, approximately 12 slides, 5-minute demo + Q&A  
**Product:** Ceres - satellite crop-health monitoring for rice farmers, extended into a two-way data exchange with Cambodia's public agriculture system.

---

## 1. Master Prompt

Copy everything inside the block below into the AI presentation generator.

```text
Create a 12-slide, 16:9 hackathon pitch deck for Ceres, a satellite crop-health monitoring platform for rice farmers in Cambodia, extended for the CamDX Hackathon 2026.

EVENT THEME
"EXCHANGE DATA. CREATE PUBLIC VALUE."
The judges are looking for a working prototype that shows data moving between systems or institutions to create a public service.

CORE STORY
Ceres already turns Sentinel-2 satellite imagery into field-level crop health, stress alerts, rainfall context, and AI-written advisories for farmers. For CamDX, Ceres becomes a two-sided data-exchange prototype:

1. PUBLIC DATA IN
- Official Cambodia administrative codes (Province > District > Commune > Village) from DataEF 2025 lists.
- DataEF current province weather, shown as official current conditions.
- Open-Meteo remains the 5-day field-level forecast.

2. FARMER DATA OUT - WITH CONSENT
- A farmer tags each field with official admin codes.
- The farmer can opt in to share anonymized field health with local agriculture officers.
- Only commune-level aggregates are shared.
- No names, no owner identity, no field boundaries, no exact coordinates.

3. PUBLIC VALUE
- Extension officers get a /government dashboard showing commune-level stress summaries.
- Groups with fewer than 3 shared fields are suppressed.
- Agriculture officers can target extension visits without surveilling individual farmers.

THE ONE-SENTENCE PITCH
"Ceres turns every rice field into a consent-based data node: public admin codes and weather flow in, privacy-safe commune-level crop stress flows back out to the officers who need it."

TONE
Confident, concrete, public-interest focused, technically credible. Avoid hype. Avoid "AI will save agriculture" language. Show the exchange mechanism, the consent boundary, and the working product.

DESIGN DIRECTION
- 16:9 widescreen.
- Modern civic-tech aesthetic, not a generic startup deck.
- Palette: deep rice-field green (#14532d / #166534), warm paddy gold (#d97706), off-white paper (#faf7f0), charcoal text (#1f2937), muted red for stress (#dc2626).
- Typography: clean sans-serif for English; leave clear space for Khmer labels where relevant.
- Use diagrams more than bullet walls.
- Use real product screenshots / map imagery placeholders, not generic stock photos of people in suits.
- Every slide: one clear headline, one visual idea, no more than 3 short supporting points.
- Include source labels for data: Sentinel-2 / Sentinel-1 via Google Earth Engine; CHIRPS; DataEF; Open-Meteo.
- Footer on content slides: "Ceres x CamDX 2026" + slide number.

DECK ARC
Problem -> why data exchange is the missing piece -> the Ceres exchange model -> farmer experience -> government experience -> privacy and trust -> architecture -> demo -> impact -> roadmap -> ask.

IMPORTANT
- Do not invent user numbers, revenue, partnerships, or accuracy claims.
- Do not call DataEF current weather a forecast. It is current conditions only.
- Do not show a commune choropleth map. DataEF admin lists have no geometry.
- Do not imply farmer identities or boundaries are shared.
- Mark unfinished features as "in progress" or "prototype".
```

---

## 2. Deck Outline

| Slide | Title | Job of the slide |
|---|---|---|
| 1 | Ceres x CamDX | Name, pitch, team, event theme |
| 2 | The field is visible. The farmer is not. | Problem |
| 3 | Data exists, but it does not exchange | Insight |
| 4 | One field, two-way data exchange | Solution |
| 5 | What flows in, what flows out | Mechanism |
| 6 | Farmer experience: consent by design | Product - farmer side |
| 7 | Officer experience: patterns, not people | Product - public side |
| 8 | Privacy is the feature | Trust model |
| 9 | How it works | Architecture |
| 10 | Five-minute demo | Live proof |
| 11 | Public value at scale | Impact |
| 12 | What we need next | Roadmap / ask / team |

---

## 3. Slide Prompts

### Slide 1 - Title

**Headline:** Ceres x CamDX  
**Subhead:** Exchange data. Grow public value.  
**Visual:** Dark green full-bleed satellite image of Cambodian rice paddies, with a thin gold line connecting a field polygon to a province boundary. Small DataEF / Earth Engine / Supabase labels.

```text
Create the title slide for a 16:9 hackathon deck.

Title: "Ceres x CamDX"
Subtitle: "Exchange data. Grow public value."
Small line: "CamDX Hackathon 2026 - Phnom Penh"
Bottom: "[TEAM NAME] - [PRESENTER NAME]"

Visual: a dark, high-contrast satellite view of Cambodian rice paddies. Overlay a subtle gold line connecting a single field polygon to a province-level boundary. Keep it elegant and minimal.
Palette: deep rice green, warm paddy gold, off-white text.
No stock people. No generic AI brain imagery.
Footer: "Ceres x CamDX 2026" and slide number "01".
```

**Speaker note:** "Ceres is a working satellite crop-health monitor for rice farmers. This weekend we added the missing half: a consent-based exchange with Cambodia's public agriculture system."

---

### Slide 2 - Problem

**Headline:** The field is visible. The farmer is not.  
**Points:**
- Smallholder rice farmers face stress from cloud cover, drought, flood, and pests.
- Satellite data exists, but it rarely reaches the person standing in the paddy.
- Public agencies hold admin codes and weather data, but not field-level crop signals.

**Visual:** Split screen. Left: satellite tile with a stressed field outlined in red. Right: an empty extension-officer desk with a paper map.

```text
Create a problem slide, 16:9.

Headline: "The field is visible. The farmer is not."
Three short points:
1. "Smallholder rice farmers face stress from cloud cover, drought, flood, and pests."
2. "Satellite data exists, but it rarely reaches the person standing in the paddy."
3. "Public agencies hold admin codes and weather data, but not field-level crop signals."

Visual direction: split composition. Left side shows a satellite crop image with a red stressed-field polygon. Right side shows an empty extension officer's desk with a paper map and no live data. Muted, serious tone.
Palette: charcoal, off-white, with stress red as the only strong accent.
No bullet icons. No stock photos of sad farmers.
```

**Speaker note:** "The data gap is not a satellite gap. It is a translation and exchange gap."

---

### Slide 3 - Insight

**Headline:** Data exists, but it does not exchange  
**Points:**
- Farmers need interpretation, not raw pixels.
- Officers need patterns, not individual surveillance.
- Ministries need shared identifiers, not another silo.

**Visual:** Three disconnected boxes: "Farmer data", "Agency data", "Public service". A broken/dashed line between them.

```text
Create an insight slide, 16:9.

Headline: "Data exists, but it does not exchange"
Three boxes across the slide:
- "Farmer data" - field health, location, consent
- "Agency data" - official admin codes, current weather
- "Public service" - targeted extension, early warning
Show dashed, broken connectors between them.
Add a short caption: "The missing layer is not more data. It is a trusted exchange."

Style: clean civic-tech diagram, off-white background, deep green boxes, gold connectors.
No photos.
```

**Speaker note:** "CamDX is not asking us to collect more data. It is asking us to make existing data move with trust."

---

### Slide 4 - Solution

**Headline:** One field, two-way data exchange  
**Points:**
- In: official Province > District > Commune > Village codes + DataEF current weather.
- Out: anonymized commune-level crop-stress summaries for extension officers.
- Boundary: the farmer opts in, and only aggregates leave the farm.

**Visual:** A circular exchange diagram. Center: field polygon. Left arrow in: "Admin codes / DataEF weather". Right arrow out: "Commune stress summary". Bottom lock: "Consent + suppression".

```text
Create the core solution slide, 16:9.

Headline: "One field, two-way data exchange"
Center visual: a single field polygon on a satellite background.
Left arrow into the field: "Public data in - official Province/District/Commune/Village codes + DataEF current weather."
Right arrow out of the field: "Public value out - commune-level crop-stress summary for extension officers."
At the bottom center: a lock icon labelled "Farmer consent + small-group suppression".

Supporting line: "The farmer shares patterns, never personal identity."
Palette: deep green field, gold arrows, off-white background, red only for the lock boundary.
```

**Speaker note:** "This is the exchange story in one picture: public data comes in, public value goes out, and consent sits in the middle."

---

### Slide 5 - Mechanism

**Headline:** What flows in, what flows out  
**Columns:**

| Flows in | Stays local | Flows out |
|---|---|---|
| DataEF 2025 admin lists | Farmer name | Commune code |
| DataEF current province weather | Phone / Telegram ID | Field count |
| Open-Meteo 5-day forecast | Field boundary | Healthy / below expected / stressed counts |
| Sentinel-2 / Sentinel-1 imagery | Exact coordinates | Last alert date |
| | | Suppressed groups under 3 fields |

**Visual:** Three-column data-flow table with icons. A thick vertical privacy wall between "Stays local" and "Flows out".

```text
Create a three-column data-flow slide, 16:9.

Headline: "What flows in, what flows out"
Column 1: "Flows in" - DataEF 2025 admin lists; DataEF current province weather; Open-Meteo 5-day forecast; Sentinel-2 and Sentinel-1 imagery.
Column 2: "Stays local" - farmer name; Telegram / phone identity; field boundary; exact coordinates.
Column 3: "Flows out" - commune code; field count; healthy / below expected / stressed counts; last alert date; groups under 3 fields suppressed.

Visual: a strong vertical privacy wall between column 2 and column 3, with a small lock.
Use a clean table or flow layout. Off-white background, deep green headers, gold privacy wall.
Caption: "The officer sees the commune. The farmer keeps the field."
```

**Speaker note:** "This table is the privacy contract. If it is not in the right column, it does not leave the system."

---

### Slide 6 - Farmer Experience

**Headline:** Consent by design  
**Points:**
- Farmer draws a field and selects official location: Province > District > Commune > Village.
- The sharing checkbox is off by default and only appears when a commune is selected.
- The farmer sees the same alert in Khmer or English, with satellite health, 5-day forecast, and official current conditions.

**Visual:** Phone-sized UI mock: field form with cascading selects, consent checkbox, and an alert card. Use Khmer labels as a secondary layer.

```text
Create a farmer-experience slide, 16:9.

Headline: "Consent by design"
Left side: three short points.
1. "Draw a field and tag the official location: Province > District > Commune > Village."
2. "Sharing is off by default and only appears when a commune is selected."
3. "The farmer gets alerts in Khmer or English with satellite health, a 5-day forecast, and official current conditions."

Right side: a clean phone UI mock showing cascading location selects, an unchecked consent box, and a Telegram-style alert card.
Include a small Khmer label example, but keep the slide readable in English.
Palette: deep green, off-white, gold accent.
Do not show a real farmer's name or exact coordinates.
```

**Speaker note:** "Consent is not a settings page hidden three clicks deep. It is part of the field-creation moment, in the farmer's language."

---

### Slide 7 - Officer Experience

**Headline:** Patterns, not people  
**Points:**
- Extension officers open `/government` and see communes grouped by district and province.
- Each row shows counts: healthy, below expected, stressed, radar fallback, no data.
- Small groups are hidden, so no individual field can be identified.

**Visual:** Dashboard mock with a province filter, summary tiles, and a commune table with a stacked stress bar. One row greyed out: "Fewer than 3 fields - hidden for privacy".

```text
Create a government dashboard slide, 16:9.

Headline: "Patterns, not people"
Left: short explanation.
- "Extension officers see communes, not farms."
- "Each row shows healthy, below expected, stressed, radar fallback, and no-data counts."
- "Groups under 3 fields are suppressed."

Right: a realistic dashboard mock with:
- province filter
- three summary tiles: communes reporting, fields reporting, percent stressed
- a table grouped by province > district > commune
- a stacked horizontal bar per row
- one greyed-out row reading "Fewer than 3 fields - hidden for privacy"

Add a visible note: "Includes demo data" if demo rows are present.
Palette: off-white dashboard, deep green headers, status colours matching the app: green / amber / red / blue-grey.
No field names, no owner names, no map polygons.
```

**Speaker note:** "The officer gets exactly enough to act, and not enough to identify a farmer."

---

### Slide 8 - Privacy and Trust

**Headline:** Privacy is the feature  
**Points:**
- Opt-in only, never opt-out by default.
- Commune-level aggregation only.
- Minimum group size of 3 fields.
- No names, no boundaries, no coordinates, no owner IDs in the output.
- Database role checks, not just UI hiding.

**Visual:** Four-layer trust stack: consent -> aggregation -> suppression -> role check. Each layer with a one-line explanation.

```text
Create a privacy and trust slide, 16:9.

Headline: "Privacy is the feature"
Visual: a four-layer stack, bottom to top:
1. "Consent" - farmer opts in, off by default.
2. "Aggregation" - commune-level counts only.
3. "Suppression" - fewer than 3 fields is hidden.
4. "Role check" - only extension_viewer can call the summary function.
Add a side note: "The UI guard is UX. The database function is the security boundary."
Use a lock motif, deep green and gold, no fear-based imagery.
```

**Speaker note:** "We are not asking judges to trust a checkbox. The privacy properties live in the database function and its output shape."

---

### Slide 9 - Architecture

**Headline:** Built on systems that already work  
**Points:**
- Vue 3 + Vite frontend.
- Supabase auth, Postgres, RLS, and Edge Functions.
- Google Earth Engine for Sentinel-2 / Sentinel-1 processing.
- DataEF admin lists seeded once; DataEF current weather proxied server-side.
- Telegram for farmer alerts.

**Visual:** Clean architecture diagram:
`Farmer / Officer -> Vue 3 app -> Supabase -> ee-data -> Earth Engine`
`Supabase -> DataEF admin tables / DataEF weather proxy`
`ee-alerts-worker -> Telegram`

```text
Create a system architecture slide, 16:9.

Headline: "Built on systems that already work"
Diagram, left to right:
- "Farmer / Extension officer" -> "Vue 3 + Vite app"
- App -> "Supabase: Auth, Postgres, RLS, Edge Functions"
- Supabase -> "ee-data -> Google Earth Engine (Sentinel-2 / Sentinel-1)"
- Supabase -> "admin_* tables (DataEF 2025 lists)" and "DataEF weather proxy"
- "ee-alerts-worker" -> "Telegram advisory"
Show the privacy boundary around the government summary function.

Keep the diagram simple, 5-6 boxes maximum, clear arrows, deep green and gold on off-white.
Label the data sources: DataEF, Open-Meteo, CHIRPS, Sentinel-2, Sentinel-1.
Do not include secret keys, project refs, or internal URLs.
```

**Speaker note:** "There is no exotic infrastructure here. The innovation is the exchange contract, not the stack."

---

### Slide 10 - Demo

**Headline:** Live demo: farmer to officer in five steps  
**Steps:**
1. Farmer draws a field and picks Battambang > district > commune > village.
2. Farmer opts in to anonymized sharing.
3. Field panel shows satellite stress, 5-day forecast, and DataEF current conditions.
4. Telegram advisory arrives in Khmer.
5. Extension officer opens `/government` and sees the commune summary.

**Visual:** Five numbered frames in a horizontal filmstrip, each with a small UI thumbnail placeholder.

```text
Create a demo-flow slide, 16:9.

Headline: "Live demo: farmer to officer in five steps"
Five numbered frames:
1. Draw field + select official location
2. Opt in to anonymized sharing
3. See satellite stress + forecast + official conditions
4. Receive Telegram advisory in Khmer
5. Officer sees commune summary in /government

Use small UI thumbnail placeholders, not stock photos.
Add a note: "Demo uses clearly labelled demo fields."
Keep the sequence readable from left to right.
Palette: off-white, deep green, gold step numbers.
```

**Speaker note:** "In five minutes: one farmer consents, one advisory arrives, one officer sees a pattern."

---

### Slide 11 - Public Value

**Headline:** From one field to a provincial early-warning layer  
**Points:**
- Farmers: earlier, plainer-language stress warnings.
- Extension officers: prioritise visits by commune, not by guesswork.
- Ministries: join on official admin codes instead of building another silo.
- Scale path: more provinces, more crops, co-op and agency partnerships.

**Visual:** Three beneficiaries with one concrete outcome each. A map of Cambodia made of small commune squares (abstract, not a real choropleth).

```text
Create an impact slide, 16:9.

Headline: "From one field to a provincial early-warning layer"
Three beneficiary columns:
- "Farmer" - earlier, plain-language stress warnings.
- "Extension officer" - prioritise visits by commune, not guesswork.
- "Ministry" - join on official admin codes, not another silo.

Bottom line: "Same field data. Three levels of public value."

Visual: abstract grid of commune-sized squares over a subtle Cambodia outline. Do not draw real commune boundaries or a fake choropleth.
No invented statistics. No user-count claims.
Palette: deep green, gold, off-white.
```

**Speaker note:** "The value multiplies because the same consented field data can serve a farmer, an officer, and a ministry at different resolutions."

---

### Slide 12 - Roadmap and Ask

**Headline:** What we need next  
**Points:**
- Pilot with Battambang provincial agriculture officers.
- Seed and validate all 25 provinces, 210 districts, and 14,576 villages.
- Add DataEF exchange-rate and other public datasets when endpoints are published.
- Harden the extension-viewer role and demo-data controls.
- Partner with co-ops and the Ministry to move from prototype to service.

**Visual:** Three-step horizon: "Now / Next / With partners". A QR code placeholder for the demo.

```text
Create the closing slide, 16:9.

Headline: "What we need next"
Three horizons:
- "Now" - working satellite monitoring + consent-based commune summary prototype.
- "Next" - Battambang pilot, full admin-code seed, extension-viewer onboarding.
- "With partners" - co-op and ministry deployments, more public datasets.

Bottom: "Let's exchange data. Let's create public value."
Include a QR code placeholder for [DEMO URL].
Team line: "[TEAM NAME] - [CONTACT]".
Palette: deep green background, gold headline, off-white text.
```

**Speaker note:** "We are not asking for permission to build. We are asking for the pilot partner who can turn a working prototype into a public service."

---

## 4. Optional Slide - Sustainability

Use only if the judges ask about long-term funding, or if the deck needs a business slide.

**Headline:** A public-value service with a sustainable base  
**Points:**
- Free tier for individual farmers.
- Paid individual and co-op tiers for larger operations.
- Agency and co-op partnerships for province-level dashboards.
- Public datasets stay public; farmer data stays consent-gated.

```text
Create a compact sustainability slide, 16:9.

Headline: "A public-value service with a sustainable base"
Four short pillars:
- "Free for individual farmers"
- "Paid individual and co-op plans"
- "Agency and co-op partnerships"
- "Consent-gated farmer data"

Visual: four pillars supporting one roof labelled "Public value".
No revenue projections. No invented prices.
```

---

## 5. Visual Asset Prompts

Use these if the slide tool asks for separate image generation.

### Architecture diagram

```text
Clean vector-style system architecture diagram for a civic-tech pitch deck.
Boxes: Farmer/Officer, Vue 3 app, Supabase (Auth/Postgres/RLS/Edge Functions), Google Earth Engine via ee-data, DataEF admin tables, DataEF weather proxy, Telegram advisory.
Arrows show data flow. A dashed lock boundary surrounds the commune summary function.
Style: minimal, 16:9, off-white background, deep green boxes, gold arrows, charcoal labels.
No logos, no screenshots, no secrets.
```

### Privacy boundary diagram

```text
Minimal diagram showing a field polygon inside a locked boundary.
Outside the boundary: commune-level summary cards with counts only.
Inside: farmer name, field boundary, exact coordinates, Telegram ID.
Labels: "Stays local" and "Leaves as aggregate".
Style: deep green and gold, off-white background, no people, no maps of real locations.
```

### Farmer-to-officer flow

```text
Horizontal five-step flow for a hackathon slide:
draw field -> tag admin location -> opt in -> receive Telegram advisory -> officer sees commune summary.
Simple line icons, no stock photography, deep green and gold palette, off-white background.
```

---

## 6. Five-Minute Demo Script

Use this as speaker notes for Slide 10 or as a live-demo script.

```text
[0:00 - 0:30]
"This is Ceres. It already turns Sentinel-2 satellite data into field-level crop health for rice farmers."

[0:30 - 1:15]
"Here is a farmer drawing a field. They tag it with the official DataEF location: Battambang, then district, commune, village. The codes are text and keep their leading zeros, so any ministry system can join on them."

[1:15 - 2:00]
"Sharing is off by default. The farmer opts in only after selecting a commune. The copy is explicit: only commune-level summaries are shared; no name, no boundary, no exact location."

[2:00 - 3:00]
"Open the field. The farmer sees satellite stress, a 5-day Open-Meteo forecast, and DataEF official current conditions. These are separate on purpose: current conditions are not a forecast."

[3:00 - 3:45]
"Trigger the Telegram advisory. It combines satellite health, rainfall, the forecast, and official current conditions in Khmer."

[3:45 - 4:30]
"Now switch to the extension officer. The /government dashboard shows commune-level stress counts. Groups under 3 fields are hidden. There are no names, no field boundaries, no coordinates."

[4:30 - 5:00]
"That is the exchange: public admin codes and weather in, privacy-safe public value out. Same field data, three levels of value: farmer, officer, ministry."
```

---

## 7. 60-Second Elevator Pitch

```text
"Ceres is a satellite crop-health monitor for rice farmers in Cambodia. Farmers draw a field and get stress alerts in Khmer or English. For CamDX, we added the missing half: a two-way data exchange.

Official Province, District, Commune and Village codes from DataEF come in, so every field joins the public system. The farmer can opt in to share anonymized health. What goes out is only a commune-level summary for extension officers: counts, not names; patterns, not boundaries; small groups suppressed.

Public data in. Consent in the middle. Public value out. That is Ceres x CamDX."
```

---

## 8. Fact Sheet

Use these facts; do not replace them with invented numbers.

- Product: Ceres, satellite crop-health monitoring for rice farmers.
- Stack: Vue 3 + Vite, Supabase (Auth, Postgres, RLS, Edge Functions), Google Earth Engine.
- Satellite data: Sentinel-2 optical; Sentinel-1 radar fallback.
- Rainfall: CHIRPS for historical/worker context; GPM IMERG for trailing rainfall in the app.
- Forecast: Open-Meteo, 5 days, at field centroid.
- Official current conditions: DataEF realtime weather API, province level, current conditions only.
- Admin data: DataEF 2025 lists - approximately 25 provinces, 210 districts, 1,6xx communes, 14,576 villages.
- Codes are text with leading zeros: `01`, `0102`, `010201`, `01020101`.
- Location model: Province > District > Commune > Village, optional for existing fields.
- Sharing: `share_with_authorities` is off by default; only true when a commune is selected.
- Aggregation: commune-level only; groups under 3 fields suppressed.
- Output excludes: field names, owner IDs, geometry, exact coordinates.
- Roles: `farmer` and `extension_viewer`; role changes are manual.
- Security boundary: a Postgres security-definer function checks the viewer role and returns only aggregates.
- Alerts: Telegram, built by `ee-alerts-worker`.
- Languages: English and Khmer.

---

## 9. Guardrails - Do Not Let the AI Invent

Add this to the AI tool if it starts hallucinating.

```text
Do not invent:
- user counts, farmer counts, revenue, funding, or accuracy percentages
- ministry partnerships or signed MOUs
- live features that are still in progress
- commune boundaries or a choropleth map

Do not say:
- "DataEF provides a forecast" (it provides current conditions only)
- "We share farmer names or boundaries with the government"
- "We monitor individual farmers for the ministry"
- "Our AI predicts crop failure" (the advisory is guidance, not a diagnosis)

Always say:
- "prototype" or "in progress" for features not yet demonstrated end-to-end
- "consent-based" and "commune-level aggregate"
- "current conditions" for DataEF weather
- "5-day forecast" only for Open-Meteo
```

---

## 10. Q&A Preparation

### "How is this different from an ordinary farm app?"

```text
"An ordinary farm app consumes data one way. Ceres exchanges it: official admin codes and public weather come in, and a privacy-safe commune summary goes back out to a public-sector user. The exchange contract is the product."
```

### "Why would a farmer opt in?"

```text
"Because the farmer gets the alert first, and the sharing is explicit and bounded. They are not donating their field boundary to a ministry. They are contributing to a commune-level early-warning layer that can bring extension help to their area."
```

### "How do you prevent re-identification?"

```text
"Three layers: opt-in consent, commune-level aggregation, and suppression of groups under 3 fields. The output shape contains no names, owner IDs, geometry, or coordinates. The database function is the security boundary, not the UI."
```

### "Why official admin codes?"

```text
"Because they are the join key. If every field uses the same Province-District-Commune-Village codes as the ministry, any public system can exchange data without a custom mapping project."
```

### "What is actually working today?"

```text
"The satellite monitoring, field management, Telegram alerts, and AI advisory are already built. The CamDX layer adds the admin-code picker, consent, DataEF weather, roles, and the commune summary dashboard. We will only demo what is running."
```

### "What happens if DataEF is down?"

```text
"The official-conditions card degrades gracefully: it hides or shows the last known value. The satellite alerts and the 5-day Open-Meteo forecast keep working. DataEF is context, not a hard dependency."
```

### "What is the business model?"

```text
"Free for individual farmers, paid plans for larger individual operations and co-ops, and agency or co-op partnerships for province-level dashboards. The public-data exchange stays free; farmer data stays consent-gated."
```

---

## 11. Final Checklist Before Presenting

- [ ] Replace `[TEAM NAME]`, `[PRESENTER NAME]`, `[CONTACT]`, `[DEMO URL]`.
- [ ] Confirm every screenshot shows demo or anonymized data.
- [ ] Confirm no farmer names, exact coordinates, or field boundaries appear in the government dashboard.
- [ ] Confirm the DataEF card says "current conditions", not "forecast".
- [ ] Confirm the Open-Meteo card says "5-day forecast".
- [ ] Confirm unfinished features are labelled "in progress" or "prototype".
- [ ] Confirm the QR code points to the deployed demo.
- [ ] Confirm the deck fits 5 minutes.
- [ ] Confirm Khmer text renders correctly.
- [ ] Confirm no secrets, tokens, project keys, or internal URLs appear in any screenshot.
