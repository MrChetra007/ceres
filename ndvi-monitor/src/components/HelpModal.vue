<template>
  <div id="help-overlay" class="help-overlay" v-show="state.helpVisible" @click.self="state.helpVisible = false">
    <div class="help-modal">
      <div class="help-header">
        <h3>How This Works</h3>
        <button class="close-btn" @click="state.helpVisible = false">&times;</button>
      </div>
      <div class="help-body">
        <h4>What are the indices?</h4>
        <p><strong>NDVI</strong> (Normalized Difference Vegetation Index) measures plant health using near-infrared and red bands. Values range from <strong>-1 to 1</strong>:</p>
        <ul>
          <li><span style="color:#22c55e">Green</span> &gt; 0.6 — Dense, healthy vegetation</li>
          <li><span style="color:#eab308">Yellow</span> 0.3–0.6 — Moderate or sparse vegetation</li>
          <li><span style="color:#ef4444">Red</span> &lt; 0.3 — Bare soil, water, or stressed crops</li>
        </ul>
        <p><strong>NDWI</strong> detects surface water (green &amp; NIR bands). <strong>LSWI</strong> (Land Surface Water Index, NIR &amp; SWIR) is more sensitive to moisture in canopy and soil — useful for spotting transplanting and flooded paddies. Toggle between all three with the segmented buttons in the bottom panel.</p>

        <h4>How to use this app</h4>
        <ol>
          <li><strong>Sign in</strong> — Click "Sign in with Google" to authenticate with Earth Engine.</li>
          <li><strong>Drag the slider</strong> — Move the time slider at the bottom to see NDVI/NDWI/LSWI change month by month. A scene count next to the month label shows how many cloud-free Sentinel-2 images went into that month's composite (amber dot means 1–2 scenes — lower confidence). Click <strong>&#8635;</strong> to jump to the most recent complete month.</li>
          <li><strong>Toggle basemap</strong> — Switch between Street (OSM) and Satellite (Esri World Imagery) with the button in the slider panel.</li>
          <li><strong>Search places</strong> — Type a location name in the search bar and press Enter or click Go to fly to it.</li>
          <li><strong>Edit area of interest</strong> — Click the map icon in the slider panel to change the AOI boundaries. Changes save automatically.</li>
          <li><strong>Click anywhere</strong> on the map to see a detailed trend chart, stress alerts, and recent rainfall context.</li>
          <li><strong>Draw a field</strong> — Use the polygon/rectangle tools to outline a rice paddy, then name it and optionally set a planting date.</li>
          <li><strong>Check the dashboard</strong> — Click &#9776; to see your saved fields with live health status, growth stage, and area. Click an active field card to deselect it and return to the AOI-wide view.</li>
          <li><strong>Compare months</strong> — Toggle "Compare" to view two months side-by-side with synced maps.</li>
          <li><strong>Export</strong> — Click "Export" to download the trend chart as PNG or a full PDF report with chart, field info, and health summary.</li>
        </ol>

        <h4>Growth stages</h4>
        <p>If you set a planting date for a field, the app compares the current NDVI against expected ranges for each rice growth stage:</p>
        <ul>
          <li><strong>Germination</strong> (Days 1–10) — Bare soil / shallow water: NDVI 0.05–0.15</li>
          <li><strong>Seedling</strong> (Days 11–25) — Sparse green: NDVI 0.15–0.30</li>
          <li><strong>Vegetative</strong> (Days 26–55) — Rapid growth: NDVI 0.30–0.55</li>
          <li><strong>Reproductive</strong> (Days 56–90) — Peak biomass: NDVI 0.55–0.75</li>
          <li><strong>Maturation</strong> (Days 91–110) — Senescing: NDVI 0.35–0.55</li>
          <li><strong>Harvest</strong> (Days 111+) — Dry-down: NDVI 0.10–0.30</li>
        </ul>

        <h4>Data source</h4>
        <p>Satellite imagery from <strong>Sentinel-2</strong> (ESA), processed by <strong>Google Earth Engine</strong>. Rainfall data from <strong>CHIRPS</strong> (UCSB/USGS). Area of interest: cement factory region (Battambang, Cambodia).</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { state } from '../store'
</script>
